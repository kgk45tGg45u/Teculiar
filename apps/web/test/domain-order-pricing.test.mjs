import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

// Domain products carry a 0 list price (every TLD/term is priced live from resell.biz at checkout), so
// the dashboards must show the captured *order* price (recurringAmountCents), never productPrice.amountCents.
const api = readFileSync(new URL("../lib/api.ts", import.meta.url), "utf8");
const clientDashboard = readFileSync(new URL("../components/portal/client-dashboard.tsx", import.meta.url), "utf8");
const adminDashboard = readFileSync(new URL("../components/admin/admin-dashboard.tsx", import.meta.url), "utf8");
const serviceDetail = readFileSync(new URL("../app/admin/services/[serviceId]/page.tsx", import.meta.url), "utf8");

test("api exposes order-price helpers that prefer recurringAmountCents over the list price", () => {
  assert.match(api, /recurringAmountCents\?: number;/);
  assert.match(api, /firstPaymentAmountCents\?: number/);
  assert.match(api, /export function serviceUnitPriceCents/);
  assert.match(api, /export function domainUnitPriceCents/);
  // Prefer the captured order price, fall back to the list price only for legacy records.
  assert.match(api, /service\.recurringAmountCents > 0 \? service\.recurringAmountCents : service\.productPrice\.amountCents/);
});

test("client dashboard prices services and domains from the order price", () => {
  assert.match(clientDashboard, /serviceUnitPriceCents,/);
  assert.match(clientDashboard, /domainUnitPriceCents,/);
  assert.match(clientDashboard, /money\(serviceUnitPriceCents\(service\)/);
  assert.match(clientDashboard, /amountCents: domainUnitPriceCents\(record, service\)/);
  // The service/domain price must no longer be read straight from the (0) product list price.
  assert.doesNotMatch(clientDashboard, /money\(service\.productPrice\.amountCents/);
});

test("admin dashboard and service detail price services from the order price", () => {
  assert.match(adminDashboard, /money\(serviceUnitPriceCents\(service\)/);
  assert.match(serviceDetail, /money\(serviceUnitPriceCents\(service\)/);
});
