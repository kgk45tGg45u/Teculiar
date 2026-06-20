import assert from "node:assert/strict";
import { test } from "node:test";
import { BillingService } from "../dist/modules/billing/billing.service.js";
import { OrdersService } from "../dist/modules/orders/orders.service.js";
import { formatDate, formatMoney, t } from "../dist/common/i18n.js";
import { readMainCurrency } from "../dist/common/currency.js";

// A billing repository mock whose settings all return their fallbacks, so createInvoice runs
// without a database. Override individual methods per test.
function billingRepoMock(overrides = {}) {
  return {
    findCoupon: async () => null,
    settingNumber: async (_key, fallback) => fallback,
    settingString: async (_key, fallback = "") => fallback,
    settingJson: async (_key, fallback) => fallback,
    createInvoice: async (input) => ({ id: "inv-1", status: input.status, totalCents: input.totalCents, currency: input.currency }),
    ...overrides
  };
}

const engineMock = {
  createDraft: () => ({ subtotalCents: 1000, discountCents: 0, taxAmountCents: 0, totalCents: 1000, reverseCharge: false, taxReason: "", lines: [] })
};

const invoiceDto = { userId: "u1", dueAt: new Date("2026-07-01").toISOString(), lines: [], customerSnapshot: {}, suppressNewInvoiceEmail: true };

test("createInvoice stamps the default main currency (EUR) on new invoices", async () => {
  let captured;
  const repo = billingRepoMock({ createInvoice: async (input) => { captured = input; return { id: "inv-1", ...input }; } });
  const service = new BillingService(repo, engineMock, {});

  await service.createInvoice(invoiceDto);

  assert.equal(captured.currency, "EUR");
});

test("createInvoice stamps the configured main currency when the admin changes it", async () => {
  let captured;
  const repo = billingRepoMock({
    settingJson: async (key, fallback) => (key === "currency.config" ? { main: "USD", others: ["EUR"], rates: {} } : fallback),
    createInvoice: async (input) => { captured = input; return { id: "inv-1", ...input }; }
  });
  const service = new BillingService(repo, engineMock, {});

  await service.createInvoice(invoiceDto);

  assert.equal(captured.currency, "USD");
});

test("mark-paid keeps the invoice's own currency (immutable once issued)", async () => {
  // markInvoicePaid recreates the final invoice from the existing one, preserving its currency.
  const source = await import("node:fs").then((fs) => fs.promises.readFile(new URL("../src/modules/billing/billing.repository.ts", import.meta.url), "utf8"));
  assert.match(source, /currency: invoice\.currency,/); // markInvoicePaid copies the stored currency
});

test("previewOrder returns the configured main currency", async () => {
  const billing = { vatPercent: async () => 0, mainCurrency: async () => "USD" };
  const service = new OrdersService({}, billing, {}, {}, { priceFor: async (_d, amountCents) => ({ amountCents }) });
  service.priceItems = async () => [{ unitAmountCents: 1000, quantity: 1, setupFeeCents: 0 }];

  const preview = await service.previewOrder({ items: [{ productId: "p" }] });

  assert.equal(preview.currency, "USD");
});

test("previewOrder falls back to EUR when no currency config is wired", async () => {
  const billing = { vatPercent: async () => 0 };
  const service = new OrdersService({}, billing, {}, {}, { priceFor: async (_d, amountCents) => ({ amountCents }) });
  service.priceItems = async () => [{ unitAmountCents: 1000, quantity: 1, setupFeeCents: 0 }];

  const preview = await service.previewOrder({ items: [{ productId: "p" }] });

  assert.equal(preview.currency, "EUR");
});

test("backend i18n helper looks up keys with English fallback and formats by locale", () => {
  assert.equal(t("de", "invoice.title"), "Rechnung");
  assert.equal(t("en", "invoice.title"), "Invoice");
  assert.equal(t("fr", "invoice.title"), "Invoice"); // no fr pack -> English fallback
  assert.equal(t("de", "common.billingCycle.YEAR_1"), "Jährlich");

  assert.match(formatMoney(11900, "USD", "en"), /\$119\.00/);
  assert.match(formatMoney(11900, "EUR", "de"), /119,00/);

  assert.equal(formatDate(null, "en"), "-");
  assert.equal(formatDate("not-a-date", "en"), "-");
  assert.match(formatDate("2026-06-20", "en"), /Jun/);
});

test("readMainCurrency reads currency.config.main with an EUR fallback", async () => {
  assert.equal(await readMainCurrency(null), "EUR");
  assert.equal(await readMainCurrency({ systemSetting: { findUnique: async () => null } }), "EUR");
  assert.equal(await readMainCurrency({ systemSetting: { findUnique: async () => ({ value: { main: "USD", others: [] } }) } }), "USD");
});
