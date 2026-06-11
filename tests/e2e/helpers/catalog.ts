/**
 * Catalogue selectors. Resolve real products/prices from the live store instead
 * of hardcoding IDs, so the suite tracks whatever the admin has published.
 */
import type { Product } from "./api-client";

export function activeProducts(products: Product[], type: string): Product[] {
  return products.filter((p) => p.type === type && p.active && p.prices.length > 0);
}

export function findHostingProduct(products: Product[], namePattern?: RegExp): Product {
  const hosting = activeProducts(products, "SHARED_HOSTING");
  const match = namePattern ? hosting.find((p) => namePattern.test(p.name)) : hosting[0];
  if (!match) throw new Error("No active SHARED_HOSTING product found in catalogue");
  return match;
}

export function findVpsProduct(products: Product[]): Product {
  const vps = activeProducts(products, "VPS");
  if (!vps[0]) throw new Error("No active VPS product found in catalogue");
  return vps[0];
}

export function findDomainProduct(products: Product[]): Product {
  const domain = products.find((p) => p.type === "DOMAIN" && p.active);
  if (!domain) throw new Error("No active DOMAIN product found in catalogue");
  return domain;
}

/** Pick a product price by billing cycle, falling back to the first available. */
export function pickPrice(product: Product, billingCycle?: string): { id: string; billingCycle: string; amountCents: number } {
  const byCycle = billingCycle ? product.prices.find((p) => p.billingCycle === billingCycle) : undefined;
  const price = byCycle ?? product.prices[0];
  if (!price) throw new Error(`Product ${product.name} has no prices`);
  return price;
}

export function planConfigValue(product: Product, key: "virtualmin_plan" | "virtualmin_template"): string | undefined {
  const cfg = product.configs?.find((c) => c.key === key);
  const value = cfg?.values?.[0];
  return typeof value === "string" ? value : undefined;
}
