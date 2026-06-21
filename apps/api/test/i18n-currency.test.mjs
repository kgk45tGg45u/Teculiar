import assert from "node:assert/strict";
import { test } from "node:test";
import { BillingService } from "../dist/modules/billing/billing.service.js";
import { OrdersService } from "../dist/modules/orders/orders.service.js";
import { formatDate, formatMoney, t } from "../dist/common/i18n.js";
import { readMainCurrency, readMainLanguage } from "../dist/common/currency.js";

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

test("createInvoice freezes the main language as the invoice locale", async () => {
  let captured;
  const repo = billingRepoMock({ createInvoice: async (input) => { captured = input; return { id: "inv-1", ...input }; } });
  const service = new BillingService(repo, engineMock, {});

  await service.createInvoice(invoiceDto);

  assert.equal(captured.locale, "de");
});

test("createInvoice freezes the configured main language when the admin changes it", async () => {
  let captured;
  const repo = billingRepoMock({
    settingJson: async (key, fallback) => (key === "i18n.languages" ? { main: "en", others: ["de"] } : fallback),
    createInvoice: async (input) => { captured = input; return { id: "inv-1", ...input }; }
  });
  const service = new BillingService(repo, engineMock, {});

  await service.createInvoice(invoiceDto);

  assert.equal(captured.locale, "en");
});

test("mark-paid keeps the invoice's own currency + locale (immutable once issued)", async () => {
  // The final-invoice rebuild copies the stored currency and frozen locale from the source invoice.
  const source = await import("node:fs").then((fs) => fs.promises.readFile(new URL("../src/modules/billing/billing.repository.ts", import.meta.url), "utf8"));
  assert.match(source, /currency: invoice\.currency,/);
  assert.match(source, /locale: invoice\.locale,/);
});

test("previewOrder returns the configured main currency", async () => {
  const billing = { vatForBuyer: async () => ({ rate: 0, reverseCharge: false }), mainCurrency: async () => "USD" };
  const service = new OrdersService({}, billing, {}, {}, { priceFor: async (_d, amountCents) => ({ amountCents }) });
  service.priceItems = async () => [{ unitAmountCents: 1000, quantity: 1, setupFeeCents: 0 }];

  const preview = await service.previewOrder({ items: [{ productId: "p" }] });

  assert.equal(preview.currency, "USD");
});

test("previewOrder falls back to EUR when no currency config is wired", async () => {
  const billing = { vatForBuyer: async () => ({ rate: 0, reverseCharge: false }) };
  const service = new OrdersService({}, billing, {}, {}, { priceFor: async (_d, amountCents) => ({ amountCents }) });
  service.priceItems = async () => [{ unitAmountCents: 1000, quantity: 1, setupFeeCents: 0 }];

  const preview = await service.previewOrder({ items: [{ productId: "p" }] });

  assert.equal(preview.currency, "EUR");
});

test("previewOrder taxes the buyer country at its configured rate", async () => {
  const billing = { vatForBuyer: async ({ countryCode }) => ({ rate: countryCode === "AT" ? 20 : 19, reverseCharge: false }), mainCurrency: async () => "EUR" };
  const service = new OrdersService({}, billing, {}, {}, { priceFor: async (_d, amountCents) => ({ amountCents }) });
  service.priceItems = async () => [{ unitAmountCents: 1000, quantity: 1, setupFeeCents: 0 }];

  const preview = await service.previewOrder({ items: [{ productId: "p" }], customer: { countryCode: "AT" } });

  assert.equal(preview.vatPercent, 20);
  assert.equal(preview.taxAmountCents, 200);
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

test("order email money uses the invoice's frozen currency and recipient locale", async () => {
  const dispatched = [];
  const emails = { dispatch: async (key, payload) => { dispatched.push([key, payload]); return []; } };
  const billing = { i18nLanguages: async () => ({ main: "de", others: ["en"] }), mainCurrency: async () => "EUR" };
  const service = new OrdersService({}, billing, {}, {}, {}, undefined, emails);

  await service.dispatchOrderEmail(
    { items: [{ description: "Starter Hosting" }], orderNumber: "123456", userId: "u1" },
    { currency: "USD", invoiceNumber: "N-100001", totalCents: 11900, user: { locale: "en" } },
    { email: "client@example.test", name: "Ada" }
  );

  assert.equal(dispatched.length, 1);
  const [key, payload] = dispatched[0];
  assert.equal(key, "order_confirmation");
  assert.equal(payload.user.locale, "en");
  assert.match(payload.context.invoice_total_amount, /\$119\.00/); // frozen USD, English format
});

test("order email falls back to main language + main currency when none are stored", async () => {
  const dispatched = [];
  const emails = { dispatch: async (key, payload) => { dispatched.push([key, payload]); return []; } };
  const billing = { i18nLanguages: async () => ({ main: "de", others: [] }), mainCurrency: async () => "EUR" };
  const service = new OrdersService({}, billing, {}, {}, {}, undefined, emails);

  await service.dispatchOrderEmail(
    { items: [], orderNumber: "123456", userId: "u1" },
    { invoiceNumber: "N-100002", totalCents: 2900 }, // no currency, no user locale
    { email: "client@example.test" }
  );

  const [, payload] = dispatched[0];
  assert.equal(payload.user.locale, undefined);
  assert.match(payload.context.invoice_total_amount, /29,00/); // German format, EUR fallback
});

test("readMainCurrency reads currency.config.main with an EUR fallback", async () => {
  assert.equal(await readMainCurrency(null), "EUR");
  assert.equal(await readMainCurrency({ systemSetting: { findUnique: async () => null } }), "EUR");
  assert.equal(await readMainCurrency({ systemSetting: { findUnique: async () => ({ value: { main: "USD", others: [] } }) } }), "USD");
});

test("readMainLanguage reads i18n.languages.main with a de fallback", async () => {
  assert.equal(await readMainLanguage(null), "de");
  assert.equal(await readMainLanguage({ systemSetting: { findUnique: async () => null } }), "de");
  assert.equal(await readMainLanguage({ systemSetting: { findUnique: async () => ({ value: { main: "en", others: ["de"] } }) } }), "en");
});
