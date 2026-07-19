import { BadRequestException, Injectable } from "@nestjs/common";
import { randomUUID } from "crypto";
import { BillingRepository } from "../billing.repository";
import { isRecord } from "./gateway-utils";
import { isMollieConfig } from "./mollie-provider.service";
import type { PaymentProcessor, PaymentRequest, PaymentResult } from "./payment-processor.interface";
import type { GatewayConfig } from "./payment-provider.interface";
import { PaymentRegistryService } from "./payment-registry.service";
import { sandboxResult } from "./sandbox-provider.service";

// Facade over the payment-provider registry (Phase 6.4). Gateway transport lives in the per-module
// provider services (paypal / mollie / sandbox, resolved by PaymentRegistryService from the stored
// PaymentProcessorConfig rows); this class keeps the billing-side ORCHESTRATION that needs the
// database — saved payment methods, SEPA mandate setup, Mollie customer reuse — and the stable
// public API BillingService calls.
@Injectable()
export class AbstractPaymentService {
  constructor(
    private readonly billing: BillingRepository,
    private readonly registry: PaymentRegistryService
  ) {}

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
        return this.registry.mollie.validate(input.config);
      }
      return this.registry.paypal.validate(input.config);
    }
    if (["CREDIT_CARD", "SEPA"].includes(input.method)) {
      return this.registry.mollie.validate(input.config);
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
    const gateway = await this.billing.paymentGateway("PAYPAL");
    const config = gateway?.config && isRecord(gateway.config) ? gateway.config as GatewayConfig : undefined;
    if (!gateway?.enabled || !config || !(await this.registry.moduleActive("paypal"))) {
      return {
        providerReference: `paypal_vault_${randomUUID()}`,
        raw: { invoiceId: input.invoiceId, sandbox: true },
        status: "SUCCEEDED"
      };
    }
    return this.registry.paypal.chargeVault(config, input);
  }

  async createMollieCustomer(input: { email: string; name: string }) {
    const config = await this.registry.mollieConfig("CREDIT_CARD");
    if (!config) {
      return { id: `sandbox_customer_${randomUUID()}`, raw: { sandbox: true } };
    }
    return this.registry.mollie.createCustomer(config, input);
  }

  async setupMollieMandate(input: {
    customerId: string;
    iban?: string;
    method: string;
    name: string;
    redirectUrl: string;
    webhookUrl?: string;
  }) {
    const config = await this.registry.mollieConfig(input.method);
    if (!config) {
      return {
        mandateId: `sandbox_mandate_${randomUUID()}`,
        providerReference: `sandbox_setup_${randomUUID()}`,
        raw: { sandbox: true },
        status: "SUCCEEDED" as const
      };
    }
    if (input.method === "SEPA") {
      const mandate = await this.registry.mollie.createDirectDebitMandate(config, {
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
    return this.registry.mollie.createFirstPayment(config, {
      currency: await this.billing.mainCurrency(),
      customerId: input.customerId,
      method: input.method,
      redirectUrl: input.redirectUrl,
      webhookUrl: input.webhookUrl
    });
  }

  async confirmMollieMandateSetup(input: { customerId?: string | null; method: string; providerReference: string }) {
    const config = await this.registry.mollieConfig(input.method);
    if (!config) {
      return {
        customerId: input.customerId ?? `sandbox_customer_${randomUUID()}`,
        mandateId: `sandbox_mandate_${randomUUID()}`,
        raw: { sandbox: true },
        status: "SUCCEEDED" as const
      };
    }
    const payment = await this.registry.mollie.fetchPayment(config, input.providerReference);
    if (payment.status !== "SUCCEEDED") {
      return { raw: payment.raw ?? {}, status: payment.status };
    }
    const customerId = stringValue(payment.raw, "customerId") ?? input.customerId;
    if (!customerId) {
      throw new BadRequestException("Mollie setup payment has no customer.");
    }
    const mandate = await this.registry.mollie.latestMandate(config, customerId, input.method);
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
    const config = await this.registry.mollieConfig(input.method);
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
    return this.registry.mollie.createRecurringPayment(config, input);
  }

  async getMollieMandateForCustomer(customerId: string, method: string): Promise<{ mandateId: string; raw: Record<string, unknown> } | undefined> {
    const config = await this.registry.mollieConfig(method);
    if (!config) {
      return undefined;
    }
    try {
      const mandate = await this.registry.mollie.latestMandate(config, customerId, method);
      return { mandateId: mandate.id, raw: mandate.raw };
    } catch {
      return undefined;
    }
  }

  private async charge(method: string, request: PaymentRequest): Promise<PaymentResult> {
    if (request.paymentMethodId === "sandbox") {
      return sandboxResult(method, request);
    }

    const { provider, config } = await this.registry.resolve(method);
    if (provider.name === "sandbox") {
      return sandboxResult(method, request);
    }

    if (provider.name === "paypal") {
      // paymentMethodId="paypal" signals JS SDK mode — omit redirectUrl so PayPal popup works.
      const sdkMode = request.paymentMethodId === "paypal";
      return provider.charge(config, { ...request, redirectUrl: sdkMode ? undefined : request.redirectUrl }, method);
    }

    if (provider.name === "mollie" && method === "SEPA") {
      return this.chargeSepa(config, request);
    }

    if (provider.name === "mollie" && method === "CREDIT_CARD") {
      let mollieCustomerId: string | undefined;
      if (request.userId) {
        const existing = await this.billing.findUserPaymentMethodByProvider(request.userId, "mollie");
        if (existing?.providerCustomerId) {
          mollieCustomerId = existing.providerCustomerId;
        } else {
          const user = await this.billing.findUserForPaymentSetup(request.userId);
          if (user) {
            const customer = await this.registry.mollie.createCustomer(config, { email: user.email, name: user.name ?? user.email });
            mollieCustomerId = customer.id;
          }
        }
      }
      const opts = mollieCustomerId
        ? { customerId: mollieCustomerId, sequenceType: "first" }
        : undefined;
      return this.registry.mollie.charge(config, request, method, opts);
    }

    return provider.charge(config, request, method);
  }

  // SEPA Direct Debit workflow:
  //   1. If the user already has a saved valid mandate → charge via sequenceType=recurring immediately.
  //   2. Otherwise the caller must supply an IBAN so we can create a mandate directly via the
  //      Mollie mandates API and then charge via sequenceType=recurring in the same request.
  //      (The sequenceType=first redirect flow requires the Mollie Recurring add-on; direct mandate
  //      creation is supported by all Mollie accounts that have SEPA DD activated.)
  private async chargeSepa(config: GatewayConfig, request: PaymentRequest): Promise<PaymentResult> {
    if (request.userId) {
      // Reuse only a SEPA mandate — a Credit Card mandate (same provider "mollie") cannot be charged
      // as a SEPA direct debit, which previously made SEPA checkout fail for clients who had a card on file.
      const existing = await this.billing.findUserPaymentMethodByProvider(request.userId, "mollie", "SEPA");
      if (existing?.providerCustomerId && existing?.mandateId && existing?.status === "VALID") {
        return this.registry.mollie.createRecurringPayment(config, {
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
    const customer = await this.registry.mollie.createCustomer(config, {
      email: user?.email ?? `sepa-${request.invoiceId}@dezhost.internal`,
      name: user?.name ?? "Customer"
    });
    const mandate = await this.registry.mollie.createDirectDebitMandate(config, {
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

    return this.registry.mollie.createRecurringPayment(config, {
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

  private async confirm(method: string, providerReference: string): Promise<PaymentResult> {
    const { provider, config } = await this.registry.resolve(method);
    if (provider.name === "sandbox") {
      // A PayPal payment may have been created through a Mollie config that has since been
      // disabled at the method level — the CC/SEPA fallback chain can still confirm it.
      if (method === "PAYPAL") {
        const mollieConfig = await this.registry.mollieConfig(method);
        if (mollieConfig) {
          return this.registry.mollie.fetchPayment(mollieConfig, providerReference);
        }
      }
      return { providerReference, status: "SUCCEEDED", raw: { sandbox: true } };
    }
    return provider.confirm(config, providerReference, method);
  }
}

function stringValue(input: unknown, key: string) {
  return isRecord(input) && typeof input[key] === "string" ? input[key] : undefined;
}
