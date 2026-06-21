import { Injectable } from "@nestjs/common";
import type { InvoiceLineInput, TaxContext, TaxCountryConfig } from "@dezhost/shared";
import { TaxService } from "./tax.service";

type Coupon =
  | { type: "FIXED"; amountCents: number; percent?: never }
  | { type: "PERCENTAGE"; amountCents?: never; percent: number };

type InvoiceDraftInput = {
  lines: InvoiceLineInput[];
  coupon?: Coupon;
  taxContext: TaxContext;
  taxConfig: TaxCountryConfig;
};

@Injectable()
export class BillingEngineService {
  constructor(private readonly taxes: TaxService) {}

  createDraft(input: InvoiceDraftInput) {
    const vat = this.taxes.resolveVat(input.taxContext, input.taxConfig);
    const subtotalCents = input.lines.reduce(
      (sum, line) => sum + line.quantity * line.unitAmountCents,
      0
    );
    const discountCents = this.calculateDiscount(subtotalCents, input.coupon);
    const taxableBaseCents = subtotalCents - discountCents;

    const lines = input.lines.map((line) => {
      const lineSubtotalCents = line.quantity * line.unitAmountCents;
      const lineShare = subtotalCents > 0 ? lineSubtotalCents / subtotalCents : 0;
      const lineDiscountCents = Math.round(discountCents * lineShare);
      const lineTaxableCents = lineSubtotalCents - lineDiscountCents;
      const taxRate = line.taxRate ?? vat.rate;
      const taxAmountCents = Math.round((lineTaxableCents * taxRate) / 100);

      return {
        ...line,
        subtotalCents: lineSubtotalCents,
        discountCents: lineDiscountCents,
        taxRate,
        taxAmountCents,
        totalCents: lineTaxableCents + taxAmountCents
      };
    });

    const taxAmountCents = lines.reduce((sum, line) => sum + line.taxAmountCents, 0);

    return {
      subtotalCents,
      discountCents,
      taxableBaseCents,
      taxAmountCents,
      totalCents: taxableBaseCents + taxAmountCents,
      reverseCharge: vat.reverseCharge,
      taxReason: vat.reason,
      lines
    };
  }

  private calculateDiscount(subtotalCents: number, coupon?: Coupon) {
    if (!coupon) {
      return 0;
    }

    if (coupon.type === "FIXED") {
      return Math.min(subtotalCents, coupon.amountCents);
    }

    return Math.round(subtotalCents * (coupon.percent / 100));
  }
}
