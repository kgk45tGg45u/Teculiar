import assert from "node:assert/strict";
import { test } from "node:test";
import { BillingService } from "../dist/modules/billing/billing.service.js";

// runAdminMaintenance runs on EVERY cron trigger, so its duplicate-renewal guard is what stops a
// due subscription from being re-invoiced every 5 minutes while its renewal invoice sits unpaid:
// the latest invoice (newest by issuedAt) already covering the upcoming period
// (dueAt >= nextInvoiceAt) means the cycle is billed. Confirmed for Phase 3.5.

function buildMaintenance({ latestInvoice }) {
  const renewed = [];
  const subscription = {
    id: "sub-1",
    nextInvoiceAt: new Date("2026-07-20T00:00:00Z"),
    invoices: latestInvoice ? [latestInvoice] : []
  };
  const billingRepo = {
    settingNumber: async (_key, fallback) => fallback,
    dueSubscriptions: async () => [subscription],
    overdueUnpaidInvoices: async () => [],
    activeServicesByIds: async () => [],
    suspendServices: async () => ({ count: 0 })
  };
  const service = new BillingService(billingRepo, {}, {});
  service.renewSubscription = async (id) => {
    renewed.push(id);
    return { id: "inv-new", invoiceNumber: "T-100", totalCents: 1000 };
  };
  service.payInvoicesAutomatically = async () => ({ paid: 0 });
  return { renewed, service };
}

test("due subscription with an unpaid invoice already covering the period is NOT re-invoiced", async () => {
  const { renewed, service } = buildMaintenance({
    // Same period already billed (dueAt == nextInvoiceAt) — e.g. the invoice generated on the
    // previous cron trigger, still unpaid.
    latestInvoice: { dueAt: new Date("2026-07-20T00:00:00Z") }
  });
  const result = await service.runAdminMaintenance(new Date("2026-07-15T10:00:00Z"));
  assert.deepEqual(renewed, [], "renewSubscription must not run for an already-billed period");
  assert.equal(result.generatedInvoices, 0);
});

test("due subscription whose latest invoice is from a PREVIOUS period gets a renewal invoice", async () => {
  const { renewed, service } = buildMaintenance({
    latestInvoice: { dueAt: new Date("2026-06-20T00:00:00Z") }
  });
  const result = await service.runAdminMaintenance(new Date("2026-07-15T10:00:00Z"));
  assert.deepEqual(renewed, ["sub-1"]);
  assert.equal(result.generatedInvoices, 1);
});

test("due subscription with no invoices at all gets a renewal invoice", async () => {
  const { renewed, service } = buildMaintenance({ latestInvoice: null });
  await service.runAdminMaintenance(new Date("2026-07-15T10:00:00Z"));
  assert.deepEqual(renewed, ["sub-1"]);
});
