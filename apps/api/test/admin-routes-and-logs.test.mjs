import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { test } from "node:test";

test("admin detail and storefront order routes point at real pages", async () => {
  const webhosting = await readFile(new URL("../../web/app/[locale]/webhosting/page.tsx", import.meta.url), "utf8");
  const dashboard = await readFile(new URL("../../web/components/admin/admin-dashboard.tsx", import.meta.url), "utf8");

  assert.match(webhosting, /href=\{`\/\$\{locale\}\/order\/\$\{product\.id\}`\}/);
  assert.ok(existsSync(new URL("../../web/app/admin/orders/[orderId]/page.tsx", import.meta.url)));
  assert.ok(existsSync(new URL("../../web/app/admin/invoices/[invoiceId]/page.tsx", import.meta.url)));
  assert.ok(existsSync(new URL("../../web/app/admin/services/[serviceId]/page.tsx", import.meta.url)));
  assert.match(dashboard, /href="\/admin\/logs"/);
});

test("admin logs endpoint and page are wired", async () => {
  const billingController = await readFile(new URL("../src/modules/billing/billing.controller.ts", import.meta.url), "utf8");
  const billingService = await readFile(new URL("../src/modules/billing/billing.service.ts", import.meta.url), "utf8");

  assert.match(billingController, /@Get\("logs"\)/);
  assert.match(billingService, /listLogs\(/);
  assert.ok(existsSync(new URL("../../web/app/admin/logs/page.tsx", import.meta.url)));
});
