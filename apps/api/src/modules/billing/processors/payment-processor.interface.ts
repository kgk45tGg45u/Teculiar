export type PaymentRequest = {
  invoiceId: string;
  amountCents: number;
  currency: "EUR";
  paymentMethodId: string;
  description?: string;
  redirectUrl?: string;
  userId?: string;
  webhookUrl?: string;
};

export type PaymentResult = {
  providerReference: string;
  status: "PENDING" | "SUCCEEDED" | "FAILED";
  paymentRedirectUrl?: string;
  raw?: Record<string, unknown>;
};

export interface PaymentProcessor {
  method: "CREDIT_CARD" | "PAYPAL" | "SEPA" | "CRYPTO" | "ACCOUNT_BALANCE";
  charge(request: PaymentRequest): Promise<PaymentResult>;
  confirm?(providerReference: string): Promise<PaymentResult>;
}
