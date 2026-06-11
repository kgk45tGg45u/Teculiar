/**
 * OrderFactory — builds the `items[]` payloads accepted by POST /orders/checkout
 * and POST /orders/admin, mirroring exactly how apps/web's checkout-form composes
 * them (hosting item + optional domain item; VPS item; domain-only item).
 */
import type { OrderItem, Product } from "../helpers/api-client";
import { planConfigValue, pickPrice } from "../helpers/catalog";
import type { DomainScenario, GeneratedDomain } from "./domain.factory";

function virtualminConfig(product: Product): Record<string, unknown> {
  return {
    virtualminPlan: planConfigValue(product, "virtualmin_plan"),
    virtualminTemplate: planConfigValue(product, "virtualmin_template")
  };
}

export const OrderFactory = {
  /**
   * Hosting order. For `register`/`transfer` a separate DOMAIN item is appended
   * for the same name (the platform allows one domain + one hosting per name).
   */
  hosting(input: {
    hostingProduct: Product;
    billingCycle?: string;
    hostingDomain: string;
    scenario: DomainScenario;
    domainProduct?: Product;
    domainBillingCycle?: string;
    transferAuthCode?: string;
  }): OrderItem[] {
    const price = pickPrice(input.hostingProduct, input.billingCycle);
    const domainUse = input.scenario === "register" ? "register" : input.scenario === "transfer" ? "transfer" : "external";

    const items: OrderItem[] = [
      {
        productId: input.hostingProduct.id,
        productPriceId: price.id,
        quantity: 1,
        configuration: { domainName: input.hostingDomain, domainUse, ...virtualminConfig(input.hostingProduct) }
      }
    ];

    if ((input.scenario === "register" || input.scenario === "transfer") && input.domainProduct) {
      const domainPrice = pickPrice(input.domainProduct, input.domainBillingCycle ?? "YEAR_1");
      items.push({
        productId: input.domainProduct.id,
        productPriceId: domainPrice.id,
        domainName: input.hostingDomain,
        quantity: 1,
        configuration: {
          billingCycle: domainPrice.billingCycle,
          domainAction: input.scenario,
          transferAuthCode: input.transferAuthCode ?? ""
        }
      });
    }
    return items;
  },

  /** VPS order (no domain; Hetzner module is a stub so it settles at PROVISIONING). */
  vps(input: { vpsProduct: Product; billingCycle?: string }): OrderItem[] {
    const price = pickPrice(input.vpsProduct, input.billingCycle);
    return [{ productId: input.vpsProduct.id, productPriceId: price.id, quantity: 1, configuration: {} }];
  },

  /** Domain-only order (register or transfer). */
  domainOnly(input: { domainProduct: Product; domain: GeneratedDomain; billingCycle?: string; nameServers?: string[] }): OrderItem[] {
    const price = pickPrice(input.domainProduct, input.billingCycle ?? "YEAR_1");
    return [
      {
        productId: input.domainProduct.id,
        productPriceId: price.id,
        domainName: input.domain.name,
        quantity: 1,
        configuration: {
          billingCycle: price.billingCycle,
          domainAction: input.domain.scenario === "transfer" ? "transfer" : "register",
          transferAuthCode: input.domain.transferAuthCode ?? "",
          nameServers: input.nameServers ?? []
        }
      }
    ];
  }
};
