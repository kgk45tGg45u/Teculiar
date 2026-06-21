import { Injectable } from "@nestjs/common";
import { resolveVat, type TaxContext, type TaxCountryConfig } from "@dezhost/shared";

@Injectable()
export class TaxService {
  // VAT is resolved from the per-country config (single source of truth shared with the web
  // checkout), then EU reverse-charge / non-EU export rules on top. See @dezhost/shared/tax.
  resolveVat(context: TaxContext, config: TaxCountryConfig) {
    return resolveVat(context, config);
  }
}
