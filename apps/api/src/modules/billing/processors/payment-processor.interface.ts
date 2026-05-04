export type PaymentRequest = {
  invoiceId: string;
  amountCents: number;
  currency: "EUR";
  paymentMethodId: string;
};

export type PaymentResult = {
  providerReference: string;
  status: "PENDING" | "SUCCEEDED" | "FAILED";
  raw?: Record<string, unknown>;
};

export interface PaymentProcessor {
  method: "CREDIT_CARD" | "PAYPAL" | "SEPA" | "CRYPTO";
  charge(request: PaymentRequest): Promise<PaymentResult>;
}
