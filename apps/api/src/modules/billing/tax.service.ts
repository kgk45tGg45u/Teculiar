import { Injectable } from "@nestjs/common";
import type { TaxContext } from "@crimson/shared";

const euCountries = new Set([
  "AT",
  "BE",
  "BG",
  "HR",
  "CY",
  "CZ",
  "DK",
  "EE",
  "FI",
  "FR",
  "DE",
  "GR",
  "HU",
  "IE",
  "IT",
  "LV",
  "LT",
  "LU",
  "MT",
  "NL",
  "PL",
  "PT",
  "RO",
  "SK",
  "SI",
  "ES",
  "SE"
]);

@Injectable()
export class TaxService {
  resolveVat(context: TaxContext, overrideRate?: number) {
    if (overrideRate !== undefined) {
      return {
        rate: Math.max(0, overrideRate),
        reverseCharge: false,
        reason: overrideRate > 0 ? "Admin VAT" : "No VAT"
      };
    }

    const buyer = context.buyerCountryCode.toUpperCase();

    if (buyer === "DE") {
      return {
        rate: 19,
        reverseCharge: false,
        reason: "German VAT"
      };
    }

    if (euCountries.has(buyer) && context.isBusinessCustomer && context.buyerVatId) {
      return {
        rate: 0,
        reverseCharge: true,
        reason: "EU reverse charge"
      };
    }

    if (!euCountries.has(buyer)) {
      return {
        rate: 0,
        reverseCharge: false,
        reason: "Non-EU export"
      };
    }

    return {
      rate: 19,
      reverseCharge: false,
      reason: "EU consumer VAT fallback"
    };
  }
}
