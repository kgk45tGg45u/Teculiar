import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const api = readFileSync(new URL("../../../packages/web-core/src/lib/api.ts", import.meta.url), "utf8");
const paymentReturn = readFileSync(new URL("../app/client/billing/payment-return/page.tsx", import.meta.url), "utf8");
const clientDashboard = readFileSync(new URL("../components/portal/client-dashboard.tsx", import.meta.url), "utf8");
// Phase 5: the admin invoice list moved from admin-dashboard.tsx into the sortable table.
const adminInvoicesTable = readFileSync(new URL("../components/admin/tables/invoices-table.tsx", import.meta.url), "utf8");

test("payment return sends paid clients to dashboard fast", () => {
  assert.match(paymentReturn, /redirect: `\/client\?invoice=\$\{encodeURIComponent\(id\)\}`/);
  assert.match(paymentReturn, /window\.location\.assign\(action\.redirect\)/);
  assert.doesNotMatch(paymentReturn, /window\.location\.assign\(`\/client\/invoices\//);
});

test("invoice display uses final paid number before temporary number", () => {
  assert.match(api, /export function invoiceDisplayNumber\(invoice: Pick<ApiInvoice, "finalInvoiceNumber" \| "tempInvoiceNumber" \| "invoiceNumber" \| "status">\)/);
  assert.match(api, /invoice\.status === "PAID" \? invoice\.finalInvoiceNumber \?\? invoice\.invoiceNumber/);
  assert.match(clientDashboard, /invoiceDisplayNumber\(invoice\)/);
  assert.match(adminInvoicesTable, /invoiceDisplayNumber\(invoice\)/);
});
