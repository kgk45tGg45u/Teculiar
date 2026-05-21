import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const api = readFileSync(new URL("../lib/api.ts", import.meta.url), "utf8");
const paymentReturn = readFileSync(new URL("../app/client/billing/payment-return/page.tsx", import.meta.url), "utf8");
const clientDashboard = readFileSync(new URL("../components/portal/client-dashboard.tsx", import.meta.url), "utf8");
const adminDashboard = readFileSync(new URL("../components/admin/admin-dashboard.tsx", import.meta.url), "utf8");

test("payment return sends paid clients to dashboard fast", () => {
  assert.match(paymentReturn, /window\.location\.assign\(`\/client\?invoice=\$\{encodeURIComponent\(/);
  assert.doesNotMatch(paymentReturn, /window\.location\.assign\(`\/client\/invoices\//);
});

test("invoice display uses final paid number before temporary number", () => {
  assert.match(api, /export function invoiceDisplayNumber\(invoice: Pick<ApiInvoice, "finalInvoiceNumber" \| "tempInvoiceNumber" \| "invoiceNumber" \| "status">\)/);
  assert.match(api, /invoice\.status === "PAID" \? invoice\.finalInvoiceNumber \?\? invoice\.invoiceNumber/);
  assert.match(clientDashboard, /invoiceDisplayNumber\(invoice\)/);
  assert.match(adminDashboard, /invoiceDisplayNumber\(invoice\)/);
});
