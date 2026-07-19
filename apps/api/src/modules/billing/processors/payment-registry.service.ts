import { Injectable, Optional } from "@nestjs/common";
import { ModuleRegistryService } from "../../module-registry/module-registry.service";
import { BillingRepository } from "../billing.repository";
import { isRecord } from "./gateway-utils";
import { MollieProviderService, isMollieConfig } from "./mollie-provider.service";
import type { GatewayConfig, PaymentProvider } from "./payment-provider.interface";
import { PayPalProviderService } from "./paypal-provider.service";
import { SandboxPaymentProviderService } from "./sandbox-provider.service";

export type ResolvedGateway = { provider: PaymentProvider; config: GatewayConfig };

// Resolves a checkout method to the payment provider that should handle it. Config comes from the
// stored PaymentProcessorConfig row (Admin → Payment Gateways); the module-registry active flag
// (module.paypal.active / module.mollie.active) is a kill switch that forces the sandbox fallback
// without touching stored credentials. Adding a gateway = a catalog entry + a PaymentProvider in
// `this.gateways` — the billing flow never changes.
@Injectable()
export class PaymentRegistryService {
  constructor(
    private readonly billing: BillingRepository,
    readonly paypal: PayPalProviderService,
    readonly mollie: MollieProviderService,
    readonly sandbox: SandboxPaymentProviderService,
    @Optional() private readonly modules?: ModuleRegistryService
  ) {}

  // Order matters: for PAYPAL a stored Mollie config (apiKey) wins over PayPal credentials,
  // mirroring the pre-registry behavior.
  private get gateways(): PaymentProvider[] {
    return [this.mollie, this.paypal];
  }

  providerByName(name: string): PaymentProvider | undefined {
    return [...this.gateways, this.sandbox].find((provider) => provider.name === name);
  }

  async resolve(method: string): Promise<ResolvedGateway> {
    const gateway = await this.billing.paymentGateway(method);
    if (!gateway?.enabled) {
      return { provider: this.sandbox, config: {} };
    }
    const config = isRecord(gateway.config) ? gateway.config as GatewayConfig : {};
    const provider = this.gateways.find((candidate) => candidate.handles(method, config));
    if (!provider || !(await this.moduleActive(provider.name))) {
      return { provider: this.sandbox, config: {} };
    }
    return { provider, config };
  }

  // The Mollie config used for saved-payment (customer/mandate) operations. The method's own
  // gateway row wins; CREDIT_CARD and SEPA act as fallbacks so one stored API key serves all
  // Mollie-driven methods. Returns undefined when no enabled row has a key or Mollie is switched
  // off in the registry.
  async mollieConfig(method: string): Promise<GatewayConfig | undefined> {
    if (!(await this.moduleActive(this.mollie.name))) {
      return undefined;
    }
    for (const candidate of [...new Set([method, "CREDIT_CARD", "SEPA"])]) {
      const gateway = await this.billing.paymentGateway(candidate);
      const config = gateway?.config && isRecord(gateway.config) ? gateway.config as GatewayConfig : undefined;
      if (gateway?.enabled && config && isMollieConfig(config)) {
        return config;
      }
    }
    return undefined;
  }

  async moduleActive(name: string): Promise<boolean> {
    if (name === this.sandbox.name || !this.modules) {
      return true;
    }
    return this.modules.moduleActive(name);
  }
}
