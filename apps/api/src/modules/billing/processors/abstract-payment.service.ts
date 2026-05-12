import { BadRequestException, Injectable } from "@nestjs/common";
import { randomUUID } from "crypto";
import { BillingRepository } from "../billing.repository";
import type { PaymentProcessor, PaymentRequest, PaymentResult } from "./payment-processor.interface";

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
      return validatePayPal(input.config);
    }
    if (["CREDIT_CARD", "SEPA"].includes(input.method)) {
      return validateMollie(input.config);
    }

    return { ok: true, message: "Gateway uses sandbox fallback." };
  }

  private async charge(method: string, request: PaymentRequest): Promise<PaymentResult> {
    const gateway = await this.billing.paymentGateway(method);
    if (!gateway?.enabled) {
      return sandboxResult(method, request);
    }

    if (method === "PAYPAL") {
      return createPayPalOrder(gateway.config as Record<string, unknown>, request);
    }
    if (["CREDIT_CARD", "SEPA"].includes(method)) {
      return createMolliePayment(gateway.config as Record<string, unknown>, request, method);
    }

    return sandboxResult(method, request);
  }

  private async confirm(method: string, providerReference: string): Promise<PaymentResult> {
    const gateway = await this.billing.paymentGateway(method);
    if (!gateway?.enabled) {
      return { providerReference, status: "SUCCEEDED", raw: { sandbox: true } };
    }
    if (method === "PAYPAL") {
      return capturePayPalOrder(gateway.config as Record<string, unknown>, providerReference);
    }
    if (["CREDIT_CARD", "SEPA"].includes(method)) {
      return fetchMolliePayment(gateway.config as Record<string, unknown>, providerReference);
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

async function createMolliePayment(config: Record<string, unknown>, request: PaymentRequest, method: string): Promise<PaymentResult> {
  const apiKey = requiredConfig(config, "apiKey", "Mollie API key is required.");
  const response = await fetch("https://api.mollie.com/v2/payments", {
    body: JSON.stringify({
      amount: { currency: request.currency, value: centsToAmount(request.amountCents) },
      description: request.description ?? `Dezhost payment ${request.invoiceId}`,
      method: mollieMethod(method),
      redirectUrl: request.redirectUrl,
      webhookUrl: request.webhookUrl
    }),
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
    raw: payload as Record<string, unknown>,
    status: "PENDING"
  };
}

async function createPayPalOrder(config: Record<string, unknown>, request: PaymentRequest): Promise<PaymentResult> {
  const token = await paypalAccessToken(config);
  const response = await fetch(`${paypalBaseUrl(config)}/v2/checkout/orders`, {
    body: JSON.stringify({
      intent: "CAPTURE",
      purchase_units: [{
        amount: { currency_code: request.currency, value: centsToAmount(request.amountCents) },
        reference_id: request.invoiceId
      }],
      payment_source: {
        paypal: {
          experience_context: {
            cancel_url: request.redirectUrl,
            return_url: request.redirectUrl,
            user_action: "PAY_NOW"
          }
        }
      }
    }),
    headers: { Authorization: `Bearer ${token.accessToken}`, "Content-Type": "application/json" },
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
    headers: { Authorization: `Bearer ${token.accessToken}`, "Content-Type": "application/json" },
    method: "POST"
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new BadRequestException(gatewayMessage(payload, "PayPal capture failed."));
  }
  return {
    providerReference,
    raw: payload as Record<string, unknown>,
    status: String(payload.status).toUpperCase() === "COMPLETED" ? "SUCCEEDED" : "PENDING"
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
  const approve = payload.links.find((item) => isRecord(item) && item.rel === "approve");
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
  return undefined;
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
