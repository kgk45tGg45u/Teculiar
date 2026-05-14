import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import { BillingService } from "../dist/modules/billing/billing.service.js";

test("add funds uses profile snapshot and sandbox token for sandbox gateway", async () => {
  const calls = [];
  const service = new BillingService({
    findUserBillingProfile: async () => ({
      contacts: [{ address: { city: "Berlin", line1: "Main 1", postalCode: "10115", state: "BE" }, phone: "+49 30 123" }],
      countryCode: "DE",
      customerType: "BUSINESS",
      email: "client@example.test",
      id: "user-1",
      name: "Client GmbH",
      vatId: "DE123"
    })
  }, {}, {});
  service.createInvoice = async (input) => {
    calls.push(["invoice", input]);
    return { id: "invoice-1", status: "UNPAID" };
  };
  service.payInvoice = async (id, dto, options) => {
    calls.push(["pay", id, dto, options]);
    return { id: "paid-invoice", status: "PAID" };
  };

  const result = await service.addFunds("user-1", { amountCents: 2500, method: "SANDBOX" });

  assert.equal(result.invoiceId, "paid-invoice");
  assert.deepEqual(calls[0][1].customerSnapshot, {
    address: { city: "Berlin", line1: "Main 1", postalCode: "10115", state: "BE" },
    countryCode: "DE",
    customerType: "BUSINESS",
    email: "client@example.test",
    name: "Client GmbH",
    phone: "+49 30 123",
    userId: "user-1",
    vatId: "DE123"
  });
  assert.deepEqual(calls[1][2], { method: "CREDIT_CARD", paymentMethodId: "sandbox" });
  assert.deepEqual(calls[1][3], { processLifecycle: false });
});

test("admin invoice page mirrors client invoice detail and exposes admin-only actions", async () => {
  const adminInvoicePage = await readFile(new URL("../../web/app/admin/invoices/[invoiceId]/page.tsx", import.meta.url), "utf8");
  const adminForms = await readFile(new URL("../../web/components/admin/admin-forms.tsx", import.meta.url), "utf8");

  assert.match(adminInvoicePage, /const customer = invoice\.customerSnapshot \?\? \{\}/);
  assert.match(adminInvoicePage, /customer\.companyName \|\| customer\.name/);
  assert.match(adminInvoicePage, /invoice\.footerLines/);
  assert.match(adminInvoicePage, /AdminInvoiceActions invoice=\{invoice\}/);
  assert.match(adminForms, /refundInvoice/);
  assert.match(adminForms, /\/billing\/invoices\/\$\{invoice\.id\}\/refund/);
});

test("sandbox gateway and reusable logo uploader are wired", async () => {
  const billingService = await readFile(new URL("../src/modules/billing/billing.service.ts", import.meta.url), "utf8");
  const billingController = await readFile(new URL("../src/modules/billing/billing.controller.ts", import.meta.url), "utf8");
  const checkout = await readFile(new URL("../../web/components/checkout/checkout-form.tsx", import.meta.url), "utf8");
  const adminForms = await readFile(new URL("../../web/components/admin/admin-forms.tsx", import.meta.url), "utf8");
  const siteHeader = await readFile(new URL("../../web/components/layout/site-header.tsx", import.meta.url), "utf8");

  assert.match(billingService, /method: "SANDBOX"/);
  assert.match(checkout, /paymentMethod === "SANDBOX"/);
  assert.match(billingController, /uploadSiteLogo/);
  assert.ok(existsSync(new URL("../../web/components/ui/image-uploader.tsx", import.meta.url)));
  assert.match(adminForms, /ImageUploader/);
  assert.match(siteHeader, /brandLogo/);
});
