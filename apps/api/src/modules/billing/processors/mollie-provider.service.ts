import { BadRequestException, Injectable } from "@nestjs/common";
import { randomUUID } from "crypto";
import { centsToAmount, gatewayMessage, isRecord, requiredConfig } from "./gateway-utils";
import type { PaymentRequest, PaymentResult } from "./payment-processor.interface";
import type { GatewayConfig, GatewayValidation, PaymentProvider } from "./payment-provider.interface";

// Mollie drives CREDIT_CARD and SEPA, and can also drive PAYPAL when the admin stored a Mollie
// API key on the PayPal gateway row. Also owns the customer/mandate machinery that saved payment
// methods (automatic renewals) are built on.
@Injectable()
export class MollieProviderService implements PaymentProvider {
  readonly name = "mollie";

  handles(method: string, config: GatewayConfig): boolean {
    if (["CREDIT_CARD", "SEPA"].includes(method)) {
      // These methods are Mollie-only: an enabled gateway routes here even with an incomplete
      // config, so the admin gets the explicit "API key is required" error instead of sandbox.
      return true;
    }
    return method === "PAYPAL" && isMollieConfig(config);
  }

  async charge(config: GatewayConfig, request: PaymentRequest, method: string, options?: { customerId?: string; sequenceType?: string }): Promise<PaymentResult> {
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

  confirm(config: GatewayConfig, providerReference: string): Promise<PaymentResult> {
    return this.fetchPayment(config, providerReference);
  }

  async validate(config: GatewayConfig): Promise<GatewayValidation> {
    const apiKey = requiredConfig(config, "apiKey", "Mollie API key is required.");
    const response = await fetch("https://api.mollie.com/v2/methods", {
      headers: { Authorization: `Bearer ${apiKey}` }
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new BadRequestException(gatewayMessage(payload, "Mollie validation failed."));
    }
    return { ok: true, message: "Mollie connection verified.", raw: payload };
  }

  async fetchPayment(config: GatewayConfig, providerReference: string): Promise<PaymentResult> {
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

  async createCustomer(config: GatewayConfig, input: { email: string; name: string }) {
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

  // A €0.00 sequenceType=first payment that vaults the payment method for future recurring charges.
  async createFirstPayment(config: GatewayConfig, input: {
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

  async createDirectDebitMandate(config: GatewayConfig, input: {
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

  async createRecurringPayment(config: GatewayConfig, input: {
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

  async latestMandate(config: GatewayConfig, customerId: string, method: string) {
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
}

export function isMollieConfig(config: Record<string, unknown> | null | undefined) {
  return Boolean(config) && typeof (config as Record<string, unknown>).apiKey === "string" && ((config as Record<string, unknown>).apiKey as string).length > 0;
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

function link(payload: unknown, name: string) {
  if (!isRecord(payload) || !isRecord(payload._links)) {
    return undefined;
  }
  const target = payload._links[name];
  return isRecord(target) && typeof target.href === "string" ? target.href : undefined;
}
