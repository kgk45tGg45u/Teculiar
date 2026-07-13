import { BadRequestException, Injectable } from "@nestjs/common";
import { randomUUID } from "crypto";
import { BillingRepository } from "../billing.repository";
import type { PaymentProcessor, PaymentRequest, PaymentResult } from "./payment-processor.interface";
import { tenantClientUrl } from "../../../tenancy/tenant-urls";

@Injectable()
export class AbstractPaymentService {
  constructor(private readonly billing: BillingRepository) {}

  get(method: string): PaymentProcessor {
    if (!["CREDIT_CARD", "PAYPAL", "SEPA", "CRYPTO", "ACCOUNT_BALANCE"].includes(method)) {
      throw new BadRequestException(`Unsupported payment method: ${method}`);
    }

    return {
      method: method as PaymentProcessor["method"],
      charge: (request) => this.charge(method, request),
      confirm: (providerReference) => this.confirm(method, providerReference)
    };
  }

  async validateConfig(input: { config: Record<string, unknown>; enabled: boolean; method: string }) {
    if (!input.enabled) {
      return { ok: true, message: "Gateway disabled." };
    }
    if (input.method === "PAYPAL") {
      if (isMollieConfig(input.config)) {
        return validateMollie(input.config);
      }
      return validatePayPal(input.config);
    }
    if (["CREDIT_CARD", "SEPA"].includes(input.method)) {
      return validateMollie(input.config);
    }

    return { ok: true, message: "Gateway uses sandbox fallback." };
  }

  // ─── PayPal vault: charge saved payment method ────────────────────────────

  async chargePayPalVault(input: {
    amountCents: number;
    currency: string;
    description: string;
    invoiceId: string;
    vaultId: string;
    webhookUrl?: string;
  }): Promise<PaymentResult> {
    const config = await this.billing.paymentGateway("PAYPAL");
    if (!config?.enabled || !config.config) {
      return {
        providerReference: `paypal_vault_${randomUUID()}`,
        raw: { invoiceId: input.invoiceId, sandbox: true },
        status: "SUCCEEDED"
      };
    }
    const cfg = config.config as Record<string, unknown>;
    const token = await paypalAccessToken(cfg);
    const baseUrl = paypalBaseUrl(cfg);
    const response = await fetch(`${baseUrl}/v2/checkout/orders`, {
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
      return capturePayPalOrder(cfg, String(payload.id));
    }
    return {
      paymentRedirectUrl: approvalUrl(payload),
      providerReference: String(payload.id ?? `paypal_vault_${randomUUID()}`),
      raw: payload as Record<string, unknown>,
      status: "PENDING"
    };
  }

  async createMollieCustomer(input: { email: string; name: string }) {
    const config = await this.mollieGatewayConfig("CREDIT_CARD");
    if (!config) {
      return { id: `sandbox_customer_${randomUUID()}`, raw: { sandbox: true } };
    }
    const apiKey = requiredConfig(config, "apiKey", "Mollie API key is required.");
    const response = await fetch("https://api.mollie.com/v2/customers", {
      body: JSON.stringify({ email: input.email, name: input.name }),
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      method: "POST"
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new BadRequestException(gatewayMessage(payload, "Mollie customer creation failed."));
    }
    return { id: String(payload.id), raw: payload as Record<string, unknown> };
  }

  async setupMollieMandate(input: {
    customerId: string;
    iban?: string;
    method: string;
    name: string;
    redirectUrl: string;
    webhookUrl?: string;
  }) {
    const config = await this.mollieGatewayConfig(input.method);
    if (!config) {
      return {
        mandateId: `sandbox_mandate_${randomUUID()}`,
        providerReference: `sandbox_setup_${randomUUID()}`,
        raw: { sandbox: true },
        status: "SUCCEEDED" as const
      };
    }
    if (input.method === "SEPA") {
      const mandate = await createMollieDirectDebitMandate(config, {
        consumerAccount: input.iban,
        consumerName: input.name,
        customerId: input.customerId
      });
      return {
        mandateId: mandate.mandateId,
        providerReference: mandate.mandateId,
        raw: mandate.raw,
        status: mandate.status === "valid" ? "SUCCEEDED" as const : "PENDING" as const
      };
    }
    return createMollieFirstPayment(config, {
      currency: await this.billing.mainCurrency(),
      customerId: input.customerId,
      method: input.method,
      redirectUrl: input.redirectUrl,
      webhookUrl: input.webhookUrl
    });
  }

  async confirmMollieMandateSetup(input: { customerId?: string | null; method: string; providerReference: string }) {
    const config = await this.mollieGatewayConfig(input.method);
    if (!config) {
      return {
        customerId: input.customerId ?? `sandbox_customer_${randomUUID()}`,
        mandateId: `sandbox_mandate_${randomUUID()}`,
        raw: { sandbox: true },
        status: "SUCCEEDED" as const
      };
    }
    const payment = await fetchMolliePayment(config, input.providerReference);
    if (payment.status !== "SUCCEEDED") {
      return { raw: payment.raw ?? {}, status: payment.status };
    }
    const customerId = stringValue(payment.raw, "customerId") ?? input.customerId;
    if (!customerId) {
      throw new BadRequestException("Mollie setup payment has no customer.");
    }
    const mandate = await latestMollieMandate(config, customerId, input.method);
    return {
      customerId,
      mandateId: mandate.id,
      raw: { payment: payment.raw, mandate: mandate.raw },
      status: mandate.status === "valid" || mandate.status === "pending" ? "SUCCEEDED" as const : "PENDING" as const
    };
  }

  async chargeSavedPayment(input: {
    amountCents: number;
    currency: string;
    customerId?: string | null;
    description: string;
    invoiceId: string;
    mandateId?: string | null;
    method: string;
    webhookUrl?: string;
  }) {
    if (input.method === "PAYPAL") {
      const vaultId = input.mandateId ?? input.customerId;
      if (!vaultId) {
        throw new BadRequestException("PayPal vault token is missing.");
      }
      return this.chargePayPalVault({
        amountCents: input.amountCents,
        currency: input.currency,
        description: input.description,
        invoiceId: input.invoiceId,
        vaultId
      });
    }
    const config = await this.mollieGatewayConfig(input.method);
    if (!config) {
      return {
        providerReference: `${input.method.toLowerCase()}_recurring_${randomUUID()}`,
        raw: { invoiceId: input.invoiceId, sandbox: true },
        status: "SUCCEEDED" as const
      };
    }
    if (!input.customerId || !input.mandateId) {
      throw new BadRequestException("Saved payment method is missing mandate details.");
    }
    return createMollieRecurringPayment(config, input);
  }

  async getMollieMandateForCustomer(customerId: string, method: string): Promise<{ mandateId: string; raw: Record<string, unknown> } | undefined> {
    const config = await this.mollieGatewayConfig(method);
    if (!config) {
      return undefined;
    }
    try {
      const mandate = await latestMollieMandate(config, customerId, method);
      return { mandateId: mandate.id, raw: mandate.raw };
    } catch {
      return undefined;
    }
  }

  private async charge(method: string, request: PaymentRequest): Promise<PaymentResult> {
    if (request.paymentMethodId === "sandbox") {
      return sandboxResult(method, request);
    }

    const gateway = await this.billing.paymentGateway(method);
    if (!gateway?.enabled) {
      return sandboxResult(method, request);
    }

    const gatewayCfg = gateway.config && isRecord(gateway.config) ? gateway.config as Record<string, unknown> : {} as Record<string, unknown>;
    if (method === "PAYPAL") {
      if (isMollieConfig(gatewayCfg)) {
        return createMolliePayment(gatewayCfg, request, method);
      }
      if (!gatewayCfg.clientId) {
        return sandboxResult(method, request);
      }
      // paymentMethodId="paypal" signals JS SDK mode — omit redirectUrl so PayPal popup works.
      const sdkMode = request.paymentMethodId === "paypal";
      return createPayPalOrder(gatewayCfg, {
        ...request,
        redirectUrl: sdkMode ? undefined : request.redirectUrl
      });
    }
    if (method === "SEPA") {
      const config = gatewayCfg;
      // SEPA Direct Debit workflow:
      //   1. If the user already has a saved valid mandate → charge via sequenceType=recurring immediately.
      //   2. Otherwise the caller must supply an IBAN so we can create a mandate directly via the
      //      Mollie mandates API and then charge via sequenceType=recurring in the same request.
      //      (The sequenceType=first redirect flow requires the Mollie Recurring add-on; direct mandate
      //      creation is supported by all Mollie accounts that have SEPA DD activated.)
      if (request.userId) {
        // Reuse only a SEPA mandate — a Credit Card mandate (same provider "mollie") cannot be charged
        // as a SEPA direct debit, which previously made SEPA checkout fail for clients who had a card on file.
        const existing = await this.billing.findUserPaymentMethodByProvider(request.userId, "mollie", "SEPA");
        if (existing?.providerCustomerId && existing?.mandateId && existing?.status === "VALID") {
          return createMollieRecurringPayment(config, {
            amountCents: request.amountCents,
            currency: request.currency,
            customerId: existing.providerCustomerId,
            description: request.description ?? `Invoice ${request.invoiceId}`,
            invoiceId: request.invoiceId,
            mandateId: existing.mandateId,
            method: "SEPA",
            webhookUrl: request.webhookUrl
          });
        }
      }

      if (!request.iban) {
        throw new BadRequestException("IBAN is required for SEPA Direct Debit payment.");
      }

      const user = request.userId ? await this.billing.findUserForPaymentSetup(request.userId) : null;
      const customer = await createMollieCustomerWithConfig(
        config,
        user?.email ?? `sepa-${request.invoiceId}@dezhost.internal`,
        user?.name ?? "Customer"
      );
      const mandate = await createMollieDirectDebitMandate(config, {
        consumerAccount: request.iban,
        consumerName: user?.name ?? "Customer",
        customerId: customer.id
      });

      if (request.userId) {
        await this.billing.createPaymentMethod({
          automatic: true,
          label: "SEPA Direct Debit",
          mandateId: mandate.mandateId,
          provider: "mollie",
          providerCustomerId: customer.id,
          providerToken: mandate.mandateId,
          status: "VALID",
          type: "SEPA",
          userId: request.userId,
          verifiedAt: new Date()
        });
      }

      return createMollieRecurringPayment(config, {
        amountCents: request.amountCents,
        currency: request.currency,
        customerId: customer.id,
        description: request.description ?? `Invoice ${request.invoiceId}`,
        invoiceId: request.invoiceId,
        mandateId: mandate.mandateId,
        method: "SEPA",
        webhookUrl: request.webhookUrl
      });
    }

    if (method === "CREDIT_CARD") {
      const config = gatewayCfg;
      let mollieCustomerId: string | undefined;
      if (request.userId) {
        const existing = await this.billing.findUserPaymentMethodByProvider(request.userId, "mollie");
        if (existing?.providerCustomerId) {
          mollieCustomerId = existing.providerCustomerId;
        } else {
          const user = await this.billing.findUserForPaymentSetup(request.userId);
          if (user) {
            const customer = await createMollieCustomerWithConfig(config, user.email, user.name ?? user.email);
            mollieCustomerId = customer.id;
          }
        }
      }
      const opts = mollieCustomerId
        ? { customerId: mollieCustomerId, sequenceType: "first" }
        : undefined;
      return createMolliePayment(config, request, method, opts);
    }

    return sandboxResult(method, request);
  }

  private async mollieGatewayConfig(method: string) {
    const asCfg = (gw: { config: unknown } | null) => gw?.config && isRecord(gw.config) ? gw.config as Record<string, unknown> : undefined;
    const primary = await this.billing.paymentGateway(method);
    const primaryCfg = asCfg(primary);
    if (primary?.enabled && primaryCfg && isMollieConfig(primaryCfg)) return primaryCfg;
    const fallback = await this.billing.paymentGateway("CREDIT_CARD");
    const fallbackCfg = asCfg(fallback);
    if (fallback?.enabled && fallbackCfg && isMollieConfig(fallbackCfg)) return fallbackCfg;
    const sepa = await this.billing.paymentGateway("SEPA");
    const sepaCfg = asCfg(sepa);
    if (sepa?.enabled && sepaCfg && isMollieConfig(sepaCfg)) return sepaCfg;
    return undefined;
  }

  private async confirm(method: string, providerReference: string): Promise<PaymentResult> {
    const gateway = await this.billing.paymentGateway(method);
    const cfg = gateway?.config && isRecord(gateway.config) ? gateway.config as Record<string, unknown> : undefined;
    if (!gateway?.enabled || !cfg) {
      if (method === "PAYPAL") {
        const mollieConfig = await this.mollieGatewayConfig(method);
        if (mollieConfig) {
          return fetchMolliePayment(mollieConfig, providerReference);
        }
      }
      return { providerReference, status: "SUCCEEDED", raw: { sandbox: true } };
    }
    if (method === "PAYPAL") {
      if (isMollieConfig(cfg)) {
        return fetchMolliePayment(cfg, providerReference);
      }
      if (!cfg.clientId) {
        return { providerReference, status: "SUCCEEDED", raw: { sandbox: true } };
      }
      return capturePayPalOrder(cfg, providerReference);
    }
    if (["CREDIT_CARD", "SEPA"].includes(method)) {
      return fetchMolliePayment(cfg, providerReference);
    }
    return { providerReference, status: "SUCCEEDED", raw: { sandbox: true } };
  }
}

function sandboxResult(method: string, request: PaymentRequest): PaymentResult {
  return {
    providerReference: `${method.toLowerCase()}_${randomUUID()}`,
    status: request.amountCents > 0 ? "SUCCEEDED" : "FAILED",
    raw: { invoiceId: request.invoiceId, sandbox: true }
  };
}

async function validateMollie(config: Record<string, unknown>) {
  const apiKey = stringConfig(config, "apiKey");
  if (!apiKey) {
    throw new BadRequestException("Mollie API key is required.");
  }
  const response = await fetch("https://api.mollie.com/v2/methods", {
    headers: { Authorization: `Bearer ${apiKey}` }
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new BadRequestException(gatewayMessage(payload, "Mollie validation failed."));
  }
  return { ok: true, message: "Mollie connection verified.", raw: payload };
}

async function validatePayPal(config: Record<string, unknown>) {
  const token = await paypalAccessToken(config);
  return { ok: true, message: "PayPal connection verified.", raw: { tokenType: token.tokenType } };
}

async function createMollieCustomerWithConfig(config: Record<string, unknown>, email: string, name: string) {
  const apiKey = requiredConfig(config, "apiKey", "Mollie API key is required.");
  const response = await fetch("https://api.mollie.com/v2/customers", {
    body: JSON.stringify({ email, name }),
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    method: "POST"
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new BadRequestException(gatewayMessage(payload, "Mollie customer creation failed."));
  }
  return { id: String(payload.id), raw: payload as Record<string, unknown> };
}

async function createMolliePayment(
  config: Record<string, unknown>,
  request: PaymentRequest,
  method: string,
  options?: { customerId?: string; sequenceType?: string }
): Promise<PaymentResult> {
  const apiKey = requiredConfig(config, "apiKey", "Mollie API key is required.");
  const body: Record<string, unknown> = {
    amount: { currency: request.currency, value: centsToAmount(request.amountCents) },
    description: request.description ?? `Payment ${request.invoiceId}`,
    method: mollieMethod(method),
    redirectUrl: request.redirectUrl,
    webhookUrl: request.webhookUrl
  };
  if (options?.customerId) {
    body.customerId = options.customerId;
    body.sequenceType = options.sequenceType ?? "first";
    body.metadata = { invoiceId: request.invoiceId };
  }
  const response = await fetch("https://api.mollie.com/v2/payments", {
    body: JSON.stringify(body),
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    method: "POST"
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new BadRequestException(gatewayMessage(payload, "Mollie payment failed."));
  }

  return {
    paymentRedirectUrl: link(payload, "checkout"),
    providerReference: String(payload.id ?? `mollie_${randomUUID()}`),
    raw: { ...(payload as Record<string, unknown>), mollieCustomerId: options?.customerId } as Record<string, unknown>,
    status: "PENDING"
  };
}

async function createMollieFirstPayment(config: Record<string, unknown>, input: {
  currency: string;
  customerId: string;
  method: string;
  redirectUrl: string;
  webhookUrl?: string;
}): Promise<PaymentResult> {
  const apiKey = requiredConfig(config, "apiKey", "Mollie API key is required.");
  const response = await fetch("https://api.mollie.com/v2/payments", {
    body: JSON.stringify({
      amount: { currency: input.currency, value: "0.00" },
      customerId: input.customerId,
      description: "Automatic payment authorization",
      method: mollieMethod(input.method),
      redirectUrl: input.redirectUrl,
      sequenceType: "first",
      webhookUrl: input.webhookUrl
    }),
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    method: "POST"
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new BadRequestException(gatewayMessage(payload, "Mollie authorization failed."));
  }
  return {
    paymentRedirectUrl: link(payload, "checkout"),
    providerReference: String(payload.id ?? `mollie_setup_${randomUUID()}`),
    raw: payload as Record<string, unknown>,
    status: "PENDING"
  };
}

async function createMollieDirectDebitMandate(config: Record<string, unknown>, input: {
  consumerAccount?: string;
  consumerName: string;
  customerId: string;
}) {
  if (!input.consumerAccount) {
    throw new BadRequestException("IBAN is required for SEPA automatic payments.");
  }
  const apiKey = requiredConfig(config, "apiKey", "Mollie API key is required.");
  const response = await fetch(`https://api.mollie.com/v2/customers/${input.customerId}/mandates`, {
    body: JSON.stringify({
      consumerAccount: input.consumerAccount,
      consumerName: input.consumerName,
      method: "directdebit"
    }),
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    method: "POST"
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new BadRequestException(gatewayMessage(payload, "Mollie mandate creation failed."));
  }
  return { mandateId: String(payload.id), raw: payload as Record<string, unknown>, status: String(payload.status) };
}

async function createMollieRecurringPayment(config: Record<string, unknown>, input: {
  amountCents: number;
  currency: string;
  customerId?: string | null;
  description: string;
  invoiceId: string;
  mandateId?: string | null;
  method: string;
  webhookUrl?: string;
}): Promise<PaymentResult> {
  const apiKey = requiredConfig(config, "apiKey", "Mollie API key is required.");
  const response = await fetch("https://api.mollie.com/v2/payments", {
    body: JSON.stringify({
      amount: { currency: input.currency, value: centsToAmount(input.amountCents) },
      customerId: input.customerId,
      description: input.description,
      mandateId: input.mandateId,
      metadata: { invoiceId: input.invoiceId },
      method: mollieMethod(input.method),
      sequenceType: "recurring",
      webhookUrl: input.webhookUrl
    }),
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    method: "POST"
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new BadRequestException(gatewayMessage(payload, "Mollie recurring payment failed."));
  }
  const status = String(payload.status).toLowerCase();
  return {
    providerReference: String(payload.id ?? `mollie_recurring_${randomUUID()}`),
    raw: payload as Record<string, unknown>,
    status: status === "paid" ? "SUCCEEDED" : ["failed", "expired", "canceled"].includes(status) ? "FAILED" : "PENDING"
  };
}

async function latestMollieMandate(config: Record<string, unknown>, customerId: string, method: string) {
  const apiKey = requiredConfig(config, "apiKey", "Mollie API key is required.");
  const response = await fetch(`https://api.mollie.com/v2/customers/${customerId}/mandates`, {
    headers: { Authorization: `Bearer ${apiKey}` }
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new BadRequestException(gatewayMessage(payload, "Mollie mandates lookup failed."));
  }
  const mandates = Array.isArray(payload._embedded?.mandates) ? payload._embedded.mandates : [];
  const target = mandates.find((mandate: unknown) =>
    isRecord(mandate) && ["valid", "pending"].includes(String(mandate.status)) && String(mandate.method) === mollieMethod(method)
  ) ?? mandates.find((mandate: unknown) => isRecord(mandate) && ["valid", "pending"].includes(String(mandate.status)));
  if (!isRecord(target)) {
    throw new BadRequestException("No valid Mollie mandate found.");
  }
  return { id: String(target.id), raw: target as Record<string, unknown>, status: String(target.status) };
}

async function createPayPalOrder(config: Record<string, unknown>, request: PaymentRequest): Promise<PaymentResult> {
  const token = await paypalAccessToken(config);
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
  const response = await fetch(`${paypalBaseUrl(config)}/v2/checkout/orders`, {
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

async function capturePayPalOrder(config: Record<string, unknown>, providerReference: string): Promise<PaymentResult> {
  const token = await paypalAccessToken(config);
  const response = await fetch(`${paypalBaseUrl(config)}/v2/checkout/orders/${providerReference}/capture`, {
    headers: { Authorization: `Bearer ${token.accessToken}`, "Content-Type": "application/json", "PayPal-Request-Id": `capture_${providerReference}` },
    method: "POST"
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    // PayPal returns 422 ORDER_ALREADY_CAPTURED when the order was captured by a concurrent
    // request (e.g., the webhook beat the browser's payment-return confirm call).  Treat this as
    // SUCCEEDED by fetching the completed order rather than propagating an error to the caller.
    if (String(isRecord(payload) ? payload.name : "").toUpperCase() === "ORDER_ALREADY_CAPTURED") {
      const orderResp = await fetch(`${paypalBaseUrl(config)}/v2/checkout/orders/${providerReference}`, {
        headers: { Authorization: `Bearer ${token.accessToken}` }
      }).catch(() => null);
      if (orderResp?.ok) {
        const orderPayload = await orderResp.json().catch(() => ({})) as Record<string, unknown>;
        if (String(orderPayload.status ?? "").toUpperCase() === "COMPLETED") {
          const ppSrc = isRecord(orderPayload.payment_source) && isRecord((orderPayload.payment_source as Record<string, unknown>).paypal)
            ? (orderPayload.payment_source as Record<string, unknown>).paypal as Record<string, unknown>
            : undefined;
          const vaultAttr = isRecord(ppSrc?.attributes) && isRecord((ppSrc!.attributes as Record<string, unknown>).vault)
            ? (ppSrc!.attributes as Record<string, unknown>).vault as Record<string, unknown>
            : undefined;
          return {
            providerReference,
            raw: { ...orderPayload, paypalVaultId: vaultAttr?.id, paypalCustomerId: isRecord(vaultAttr?.customer) ? (vaultAttr!.customer as Record<string, unknown>).id : undefined },
            status: "SUCCEEDED"
          };
        }
      }
    }
    throw new BadRequestException(gatewayMessage(payload, "PayPal capture failed."));
  }
  const completed = String(payload.status).toUpperCase() === "COMPLETED";
  const vault = isRecord(payload.payment_source) && isRecord(payload.payment_source.paypal)
    ? isRecord((payload.payment_source.paypal as Record<string, unknown>).attributes)
      ? isRecord(((payload.payment_source.paypal as Record<string, unknown>).attributes as Record<string, unknown>).vault)
        ? (((payload.payment_source.paypal as Record<string, unknown>).attributes as Record<string, unknown>).vault as Record<string, unknown>)
        : undefined
      : undefined
    : undefined;
  return {
    providerReference,
    raw: { ...(payload as Record<string, unknown>), paypalVaultId: vault?.id, paypalCustomerId: vault?.customer && isRecord(vault.customer) ? vault.customer.id : undefined },
    status: completed ? "SUCCEEDED" : "PENDING"
  };
}

async function fetchMolliePayment(config: Record<string, unknown>, providerReference: string): Promise<PaymentResult> {
  const apiKey = requiredConfig(config, "apiKey", "Mollie API key is required.");
  const response = await fetch(`https://api.mollie.com/v2/payments/${providerReference}`, {
    headers: { Authorization: `Bearer ${apiKey}` }
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new BadRequestException(gatewayMessage(payload, "Mollie payment lookup failed."));
  }
  const status = String(payload.status).toLowerCase();
  return {
    providerReference,
    raw: payload as Record<string, unknown>,
    status: status === "paid" ? "SUCCEEDED" : ["failed", "expired", "canceled"].includes(status) ? "FAILED" : "PENDING"
  };
}

async function paypalAccessToken(config: Record<string, unknown>) {
  const clientId = requiredConfig(config, "clientId", "PayPal client ID is required.");
  const clientSecret = requiredConfig(config, "clientSecret", "PayPal client secret is required.");
  const response = await fetch(`${paypalBaseUrl(config)}/v1/oauth2/token`, {
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

function paypalBaseUrl(config: Record<string, unknown>) {
  return stringConfig(config, "mode") === "live" ? "https://api-m.paypal.com" : "https://api-m.sandbox.paypal.com";
}


function approvalUrl(payload: unknown) {
  if (!isRecord(payload) || !Array.isArray(payload.links)) {
    return undefined;
  }
  // PayPal returns "approve" for basic orders and "payer-action" when payment_source.paypal is set
  const approve = payload.links.find((item) => isRecord(item) && (item.rel === "approve" || item.rel === "payer-action"));
  return isRecord(approve) && typeof approve.href === "string" ? approve.href : undefined;
}

function link(payload: unknown, name: string) {
  if (!isRecord(payload) || !isRecord(payload._links)) {
    return undefined;
  }
  const target = payload._links[name];
  return isRecord(target) && typeof target.href === "string" ? target.href : undefined;
}

function centsToAmount(cents: number) {
  return (cents / 100).toFixed(2);
}

function mollieMethod(method: string) {
  if (method === "CREDIT_CARD") {
    return "creditcard";
  }
  if (method === "SEPA") {
    return "directdebit";
  }
  if (method === "PAYPAL") {
    return "paypal";
  }
  return undefined;
}

function isMollieConfig(config: Record<string, unknown> | null | undefined) {
  return Boolean(config) && typeof (config as Record<string, unknown>).apiKey === "string" && ((config as Record<string, unknown>).apiKey as string).length > 0;
}

function stringValue(input: unknown, key: string) {
  return isRecord(input) && typeof input[key] === "string" ? input[key] : undefined;
}

function requiredConfig(config: Record<string, unknown>, key: string, message: string) {
  const value = stringConfig(config, key);
  if (!value) {
    throw new BadRequestException(message);
  }
  return value;
}

function stringConfig(config: Record<string, unknown>, key: string) {
  const value = config[key];
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function gatewayMessage(payload: unknown, fallback: string) {
  if (!isRecord(payload)) {
    return fallback;
  }
  const detail = payload.detail ?? payload.message ?? payload.error_description ?? payload.error;
  return typeof detail === "string" && detail ? detail : fallback;
}

function isRecord(value: unknown): value is Record<string, any> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
