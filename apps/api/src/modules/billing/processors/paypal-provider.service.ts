import { BadRequestException, Injectable } from "@nestjs/common";
import { randomUUID } from "crypto";
import { tenantClientUrl } from "../../../tenancy/tenant-urls";
import { centsToAmount, gatewayMessage, isRecord, requiredConfig, stringConfig } from "./gateway-utils";
import type { PaymentRequest, PaymentResult } from "./payment-processor.interface";
import type { GatewayConfig, GatewayValidation, PaymentProvider } from "./payment-provider.interface";

// Direct PayPal REST integration (orders v2 + vault). `config.mode` selects sandbox vs live —
// that switch is what the 6.3 sandbox test process flips on production.
@Injectable()
export class PayPalProviderService implements PaymentProvider {
  readonly name = "paypal";

  handles(method: string, config: GatewayConfig): boolean {
    return method === "PAYPAL" && Boolean(stringConfig(config, "clientId"));
  }

  async charge(config: GatewayConfig, request: PaymentRequest): Promise<PaymentResult> {
    const token = await this.accessToken(config);
    // When a redirectUrl is provided this is a redirect-based flow (not JS SDK popup).
    // In SDK popup mode the payment_source block must be omitted so PayPal handles the UX.
    const paymentSource = request.redirectUrl
      ? {
          payment_source: {
            paypal: {
              experience_context: {
                cancel_url: request.redirectUrl,
                return_url: request.redirectUrl,
                user_action: "PAY_NOW",
                vault_instruction: "ON_PAYER_APPROVAL"
              },
              attributes: {
                vault: {
                  store_in_vault: "ON_SUCCESS",
                  usage_type: "MERCHANT",
                  customer_type: "CONSUMER"
                }
              }
            }
          }
        }
      : {};
    const response = await fetch(`${this.baseUrl(config)}/v2/checkout/orders`, {
      body: JSON.stringify({
        intent: "CAPTURE",
        purchase_units: [{
          amount: { currency_code: request.currency, value: centsToAmount(request.amountCents) },
          description: request.description,
          reference_id: request.invoiceId
        }],
        ...paymentSource
      }),
      headers: { Authorization: `Bearer ${token.accessToken}`, "Content-Type": "application/json", "PayPal-Request-Id": request.invoiceId },
      method: "POST"
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new BadRequestException(gatewayMessage(payload, "PayPal order failed."));
    }

    return {
      paymentRedirectUrl: approvalUrl(payload),
      providerReference: String(payload.id ?? `paypal_${randomUUID()}`),
      raw: payload as Record<string, unknown>,
      status: "PENDING"
    };
  }

  async confirm(config: GatewayConfig, providerReference: string): Promise<PaymentResult> {
    const token = await this.accessToken(config);
    const response = await fetch(`${this.baseUrl(config)}/v2/checkout/orders/${providerReference}/capture`, {
      headers: { Authorization: `Bearer ${token.accessToken}`, "Content-Type": "application/json", "PayPal-Request-Id": `capture_${providerReference}` },
      method: "POST"
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      // PayPal returns 422 ORDER_ALREADY_CAPTURED when the order was captured by a concurrent
      // request (e.g., the webhook beat the browser's payment-return confirm call).  Treat this as
      // SUCCEEDED by fetching the completed order rather than propagating an error to the caller.
      if (String(isRecord(payload) ? payload.name : "").toUpperCase() === "ORDER_ALREADY_CAPTURED") {
        const orderResp = await fetch(`${this.baseUrl(config)}/v2/checkout/orders/${providerReference}`, {
          headers: { Authorization: `Bearer ${token.accessToken}` }
        }).catch(() => null);
        if (orderResp?.ok) {
          const orderPayload = await orderResp.json().catch(() => ({})) as Record<string, unknown>;
          if (String(orderPayload.status ?? "").toUpperCase() === "COMPLETED") {
            const vault = vaultAttributes(orderPayload);
            return {
              providerReference,
              raw: { ...orderPayload, paypalVaultId: vault?.id, paypalCustomerId: isRecord(vault?.customer) ? vault.customer.id : undefined },
              status: "SUCCEEDED"
            };
          }
        }
      }
      throw new BadRequestException(gatewayMessage(payload, "PayPal capture failed."));
    }
    const completed = String(payload.status).toUpperCase() === "COMPLETED";
    const vault = vaultAttributes(payload as Record<string, unknown>);
    return {
      providerReference,
      raw: { ...(payload as Record<string, unknown>), paypalVaultId: vault?.id, paypalCustomerId: vault?.customer && isRecord(vault.customer) ? vault.customer.id : undefined },
      status: completed ? "SUCCEEDED" : "PENDING"
    };
  }

  async validate(config: GatewayConfig): Promise<GatewayValidation> {
    const token = await this.accessToken(config);
    return { ok: true, message: "PayPal connection verified.", raw: { tokenType: token.tokenType } };
  }

  // Charge a vaulted PayPal payment method (renewal auto-payments).
  async chargeVault(config: GatewayConfig, input: {
    amountCents: number;
    currency: string;
    description: string;
    invoiceId: string;
    vaultId: string;
  }): Promise<PaymentResult> {
    const token = await this.accessToken(config);
    const response = await fetch(`${this.baseUrl(config)}/v2/checkout/orders`, {
      body: JSON.stringify({
        intent: "CAPTURE",
        processing_instruction: "ORDER_COMPLETE_ON_PAYMENT_APPROVAL",
        purchase_units: [{
          amount: { currency_code: input.currency, value: centsToAmount(input.amountCents) },
          description: input.description,
          reference_id: input.invoiceId
        }],
        payment_source: {
          paypal: {
            vault_id: input.vaultId,
            experience_context: {
              return_url: tenantClientUrl(`/billing/payment-return?invoiceId=${encodeURIComponent(input.invoiceId)}`),
              cancel_url: tenantClientUrl(`/billing/payment-return?invoiceId=${encodeURIComponent(input.invoiceId)}`)
            }
          }
        }
      }),
      headers: { Authorization: `Bearer ${token.accessToken}`, "Content-Type": "application/json", "PayPal-Request-Id": `vault_${input.invoiceId}` },
      method: "POST"
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new BadRequestException(gatewayMessage(payload, "PayPal vault charge failed."));
    }
    const orderStatus = String(payload.status ?? "").toUpperCase();
    if (orderStatus === "COMPLETED") {
      return { providerReference: String(payload.id ?? `paypal_vault_${randomUUID()}`), raw: payload as Record<string, unknown>, status: "SUCCEEDED" };
    }
    if (orderStatus === "APPROVED") {
      return this.confirm(config, String(payload.id));
    }
    return {
      paymentRedirectUrl: approvalUrl(payload),
      providerReference: String(payload.id ?? `paypal_vault_${randomUUID()}`),
      raw: payload as Record<string, unknown>,
      status: "PENDING"
    };
  }

  private async accessToken(config: GatewayConfig) {
    const clientId = requiredConfig(config, "clientId", "PayPal client ID is required.");
    const clientSecret = requiredConfig(config, "clientSecret", "PayPal client secret is required.");
    const response = await fetch(`${this.baseUrl(config)}/v1/oauth2/token`, {
      body: "grant_type=client_credentials",
      headers: {
        Authorization: `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString("base64")}`,
        "Content-Type": "application/x-www-form-urlencoded"
      },
      method: "POST"
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new BadRequestException(gatewayMessage(payload, "PayPal validation failed."));
    }
    return { accessToken: String(payload.access_token), tokenType: payload.token_type };
  }

  private baseUrl(config: GatewayConfig) {
    return stringConfig(config, "mode") === "live" ? "https://api-m.paypal.com" : "https://api-m.sandbox.paypal.com";
  }
}

function approvalUrl(payload: unknown) {
  if (!isRecord(payload) || !Array.isArray(payload.links)) {
    return undefined;
  }
  // PayPal returns "approve" for basic orders and "payer-action" when payment_source.paypal is set
  const approve = payload.links.find((item) => isRecord(item) && (item.rel === "approve" || item.rel === "payer-action"));
  return isRecord(approve) && typeof approve.href === "string" ? approve.href : undefined;
}

function vaultAttributes(payload: Record<string, unknown>) {
  const source = isRecord(payload.payment_source) && isRecord(payload.payment_source.paypal)
    ? payload.payment_source.paypal as Record<string, unknown>
    : undefined;
  const attributes = isRecord(source?.attributes) ? source.attributes as Record<string, unknown> : undefined;
  return isRecord(attributes?.vault) ? attributes.vault as Record<string, unknown> : undefined;
}
