import { Injectable } from "@nestjs/common";
import { randomUUID } from "crypto";
import type { PaymentProcessor, PaymentRequest } from "./payment-processor.interface";

class Processor implements PaymentProcessor {
  constructor(readonly method: PaymentProcessor["method"]) {}

  async charge(request: PaymentRequest) {
    return {
      providerReference: `${this.method.toLowerCase()}_${randomUUID()}`,
      status: request.amountCents > 0 ? ("PENDING" as const) : ("FAILED" as const),
      raw: {
        abstracted: true,
        invoiceId: request.invoiceId
      }
    };
  }
}

@Injectable()
export class AbstractPaymentService {
  private readonly processors = new Map<PaymentProcessor["method"], PaymentProcessor>([
    ["CREDIT_CARD", new Processor("CREDIT_CARD")],
    ["PAYPAL", new Processor("PAYPAL")],
    ["SEPA", new Processor("SEPA")],
    ["CRYPTO", new Processor("CRYPTO")]
  ]);

  get(method: string) {
    const processor = this.processors.get(method as PaymentProcessor["method"]);
    if (!processor) {
      throw new Error(`Unsupported payment method: ${method}`);
    }
    return processor;
  }
}
