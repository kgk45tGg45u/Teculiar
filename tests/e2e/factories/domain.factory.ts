/**
 * DomainFactory — unique registrable domains for each scenario. Only real TLDs,
 * never subdomains. `.de` is intentionally avoided because the platform routes
 * `.de` to manual registration (apps/api orders.service.ts), which would never
 * reach ACTIVE through the registrar.
 */
import { env } from "../config/env";
import { uniqueDomain } from "../helpers/unique";

/**
 * Backend-distinct domain handling for an order:
 *  - none      : hosting provisions on Virtualmin only; no registrar, no DomainRecord.
 *  - external  : customer points an existing domain's DNS; same backend path as none.
 *  - register  : new registration via Resell.biz test API (creates a DomainRecord).
 *  - transfer  : transfer via Resell.biz test API (needs an auth code).
 */
export type DomainScenario = "none" | "external" | "register" | "transfer";

export type GeneratedDomain = { name: string; tld: string; scenario: DomainScenario; transferAuthCode?: string };

export const DomainFactory = {
  build(scenario: DomainScenario): GeneratedDomain {
    const tld =
      scenario === "register" ? env.domains.registerTld :
      scenario === "transfer" ? env.domains.transferTld :
      env.domains.externalTld;
    const name = uniqueDomain(env.domains.rootForUnique, tld);
    return {
      name,
      tld,
      scenario,
      // Resell.biz test API accepts any non-empty auth code for test transfers.
      transferAuthCode: scenario === "transfer" ? `e2e-auth-${Date.now().toString(36)}` : undefined
    };
  },

  /** Just a unique hosting domain name (used when the scenario needs only a name). */
  hostingName(): string {
    return uniqueDomain(env.domains.rootForUnique, env.domains.externalTld);
  }
};
