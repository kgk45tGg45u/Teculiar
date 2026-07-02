import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { test } from "node:test";

test("admin detail and storefront order routes point at real pages", async () => {
  const webhosting = await readFile(new URL("../../storefront/app/[locale]/webhosting/page.tsx", import.meta.url), "utf8");
  const hostingPackages = await readFile(new URL("../../storefront/app/[locale]/webhosting/hosting-packages.tsx", import.meta.url), "utf8");
  const dashboard = await readFile(new URL("../../web/components/admin/admin-dashboard.tsx", import.meta.url), "utf8");
  const sidebar = await readFile(new URL("../../web/components/admin/admin-sidebar.tsx", import.meta.url), "utf8");

  assert.match(`${webhosting}\n${hostingPackages}`, /href=\{`\/\$\{locale\}\/order\/\$\{product\.id\}`\}/);
  assert.ok(existsSync(new URL("../../web/app/admin/orders/[orderId]/page.tsx", import.meta.url)));
  assert.ok(existsSync(new URL("../../web/app/admin/invoices/[invoiceId]/page.tsx", import.meta.url)));
  assert.ok(existsSync(new URL("../../web/app/admin/services/[serviceId]/page.tsx", import.meta.url)));
  assert.match(dashboard, /view === "logs"/);
  assert.match(sidebar, /href: "\/admin\/logs"/);
});

test("admin logs endpoint and page are wired", async () => {
  const billingController = await readFile(new URL("../src/modules/billing/billing.controller.ts", import.meta.url), "utf8");
  const billingService = await readFile(new URL("../src/modules/billing/billing.service.ts", import.meta.url), "utf8");

  assert.match(billingController, /@Get\("logs"\)/);
  assert.match(billingService, /listLogs\(/);
  assert.ok(existsSync(new URL("../../web/app/admin/logs/page.tsx", import.meta.url)));
});

test("admin product categories are wired end to end", async () => {
  const schema = await readFile(new URL("../../../prisma/schema.prisma", import.meta.url), "utf8");
  const productsController = await readFile(new URL("../src/modules/products/products.controller.ts", import.meta.url), "utf8");
  const productManager = await readFile(new URL("../../web/components/admin/admin-product-manager.tsx", import.meta.url), "utf8");

  assert.match(schema, /model ProductCategory/);
  assert.match(schema, /categoryId\s+String\?/);
  assert.match(productsController, /@Get\("admin\/dev\/product-categories"\)/);
  assert.match(productsController, /@Post\("admin\/dev\/product-categories"\)/);
  assert.match(productsController, /@Patch\("admin\/dev\/product-categories\/:id"\)/);
  assert.match(productsController, /@Delete\("admin\/dev\/product-categories\/:id"\)/);
  assert.match(productManager, /admin\/dev\/product-categories/);
  assert.match(productManager, /name="categoryId"/);
});

test("webhosting storefront uses category products and client billing toggle", async () => {
  const webhosting = await readFile(new URL("../../storefront/app/[locale]/webhosting/page.tsx", import.meta.url), "utf8");
  const hostingPackages = await readFile(new URL("../../storefront/app/[locale]/webhosting/hosting-packages.tsx", import.meta.url), "utf8");

  assert.match(webhosting, /\/storefront\/products\?category=webhosting/);
  assert.match(hostingPackages, /"use client"/);
  assert.match(hostingPackages, /useState<"MONTHLY" \| "YEAR_1">/);
  assert.doesNotMatch(hostingPackages, /billingCycles/);
});

test("storefront product cards and domain results route to order flows", async () => {
  const productGrid = await readFile(new URL("../../../packages/web-core/src/components/marketing/product-grid.tsx", import.meta.url), "utf8");
  const hostingPackages = await readFile(new URL("../../storefront/app/[locale]/webhosting/hosting-packages.tsx", import.meta.url), "utf8");
  const domainSearch = await readFile(new URL("../../storefront/app/[locale]/domains/search/page.tsx", import.meta.url), "utf8");

  assert.match(productGrid, /const fullHref = `\/\$\{locale\}\/\$\{href\}`/);
  assert.match(productGrid, /<Button href=\{fullHref\}/);
  assert.match(hostingPackages, /import Link from "next\/link"/);
  assert.match(hostingPackages, /className=\{`\$\{styles\.packageCard\}/);
  assert.match(domainSearch, /apiGet<ApiProduct\[]>\("\/storefront\/products"\)/);
  assert.match(domainSearch, /domainProduct\?\.id/);
  assert.match(domainSearch, /\/order\/\$\{productId\}\?domain=/);
});
