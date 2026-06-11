/**
 * Resolves the live catalogue once and exposes the products the suite needs.
 * Cached per worker so we don't refetch /products for every test.
 */
import type { ApiClient, Product } from "../helpers/api-client";
import { findDomainProduct, findHostingProduct, findVpsProduct } from "../helpers/catalog";

export type Catalog = {
  products: Product[];
  hosting: Product;
  hostingTiers: Product[];
  vps?: Product;
  domain: Product;
};

let cached: Catalog | undefined;

export async function resolveCatalog(api: ApiClient): Promise<Catalog> {
  if (cached) return cached;
  const products = await api.products();
  cached = {
    products,
    hosting: findHostingProduct(products),
    hostingTiers: products.filter((p) => p.type === "SHARED_HOSTING" && p.active && p.prices.length > 0),
    vps: products.find((p) => p.type === "VPS" && p.active && p.prices.length > 0) ? findVpsProduct(products) : undefined,
    domain: findDomainProduct(products)
  };
  return cached;
}
