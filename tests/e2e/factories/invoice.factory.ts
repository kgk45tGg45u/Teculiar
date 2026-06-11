/**
 * InvoiceFactory — admin-created invoices for the billing-automation tests.
 * Uses a CUSTOM line with 0% VAT so the total is exactly the amount we set
 * (no tax maths, no service/domain side effects) — keeping balance assertions exact.
 */

export const InvoiceFactory = {
  /** A standalone custom line (no service/provisioning attached). */
  customLine(amountCents: number, description = "E2E automation charge"): Record<string, unknown> {
    return { description, quantity: 1, unitAmountCents: amountCents, type: "CUSTOM", vatRate: 0 };
  },

  /** Full POST /billing/invoices body. `dueAt` defaults to now so cron picks it up. */
  build(input: { userId: string; amountCents: number; dueAt?: string; description?: string }): {
    userId: string;
    dueAt: string;
    status: string;
    buyerCountryCode: string;
    lines: Array<Record<string, unknown>>;
  } {
    return {
      userId: input.userId,
      dueAt: input.dueAt ?? new Date().toISOString(),
      status: "PENDING",
      buyerCountryCode: "DE",
      lines: [InvoiceFactory.customLine(input.amountCents, input.description)]
    };
  }
};
