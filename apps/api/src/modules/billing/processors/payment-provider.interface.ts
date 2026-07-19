import type { PaymentRequest, PaymentResult } from "./payment-processor.interface";

export type GatewayConfig = Record<string, unknown>;
export type GatewayValidation = { ok: boolean; message: string; raw?: unknown };

// A payment gateway integration — the `payment` kind in the module catalog. Providers are
// STATELESS transports: every call receives the gateway config the registry resolved from
// PaymentProcessorConfig. Adding a gateway = a catalog entry + one provider implementing this,
// registered in PaymentRegistryService — no edits to the billing flow.
export interface PaymentProvider {
  /** Module-catalog name ("paypal", "mollie", "sandbox"). */
  readonly name: string;
  /** Whether this provider can drive the given checkout method with the given stored config. */
  handles(method: string, config: GatewayConfig): boolean;
  charge(config: GatewayConfig, request: PaymentRequest, method: string): Promise<PaymentResult>;
  confirm(config: GatewayConfig, providerReference: string, method: string): Promise<PaymentResult>;
  validate(config: GatewayConfig, method: string): Promise<GatewayValidation>;
}
