import { Injectable } from "@nestjs/common";
import { randomUUID } from "crypto";
import type { PaymentRequest, PaymentResult } from "./payment-processor.interface";
import type { GatewayConfig, GatewayValidation, PaymentProvider } from "./payment-provider.interface";

// Fallback provider: used when a gateway is disabled, unconfigured, or its module is switched off
// in the registry — and for the explicit TEST/sandbox checkout method. Always "succeeds" so dev
// and demo flows complete without a real gateway.
@Injectable()
export class SandboxPaymentProviderService implements PaymentProvider {
  readonly name = "sandbox";

  handles(): boolean {
    return true;
  }

  async charge(_config: GatewayConfig, request: PaymentRequest, method: string): Promise<PaymentResult> {
    return sandboxResult(method, request);
  }

  async confirm(_config: GatewayConfig, providerReference: string): Promise<PaymentResult> {
    return { providerReference, status: "SUCCEEDED", raw: { sandbox: true } };
  }

  async validate(): Promise<GatewayValidation> {
    return { ok: true, message: "Gateway uses sandbox fallback." };
  }
}

export function sandboxResult(method: string, request: PaymentRequest): PaymentResult {
  return {
    providerReference: `${method.toLowerCase()}_${randomUUID()}`,
    status: request.amountCents > 0 ? "SUCCEEDED" : "FAILED",
    raw: { invoiceId: request.invoiceId, sandbox: true }
  };
}
