import assert from "node:assert/strict";
import { test } from "node:test";
import { OrdersService } from "../dist/modules/orders/orders.service.js";

// "Don't email the customer" on the admin new-order form must silence BOTH emails the flow
// fires: the order confirmation AND the new-invoice mail that createInvoice sends itself
// (the bug: skipEmail only guarded the confirmation, so customers still got the invoice mail).

function harness(captured) {
  const orders = {
    findProduct: async () => ({
      id: "host",
      name: "Web Hosting M",
      slug: "web-hosting-m",
      type: "SHARED_HOSTING",
      provisioningModule: null,
      freeDomainBillingCycle: null,
      prices: [{ id: "p-month", billingCycle: "MONTHLY", amountCents: 1000, setupFeeCents: 0 }]
    }),
    findActiveHostingServiceByDomain: async () => null,
    createOrder: async () => ({ id: "ord-1", orderNumber: "100001", items: [], userId: "u1", user: { locale: "en" } }),
    createPendingEntitiesForOrder: async () => undefined
  };
  const billing = {
    vatForBuyer: async () => ({ rate: 19, reverseCharge: false }),
    createInvoice: async (dto) => {
      captured.invoiceDto = dto;
      return { id: "inv-1", subtotalCents: 1000, taxAmountCents: 190, totalCents: 1190, invoiceNumber: "N-1" };
    },
    recordAction: async () => undefined,
    i18nLanguages: async () => ({ main: "de" }),
    mainCurrency: async () => "EUR"
  };
  const users = { findById: async () => ({ id: "u1", email: "c@example.com", name: "C", countryCode: "DE", customerType: "INDIVIDUAL", locale: "en" }) };
  const emails = { dispatch: async (key, payload) => { captured.dispatched.push([key, payload]); return []; } };
  return new OrdersService(orders, billing, {}, users, { priceFor: async (_d, amountCents) => ({ amountCents }) }, undefined, emails);
}

test("createAdminOrder with skipEmail suppresses the new-invoice AND order emails", async () => {
  const captured = { dispatched: [] };
  const service = harness(captured);

  await service.createAdminOrder({ userId: "u1", items: [{ productId: "host", quantity: 1, configuration: {} }], skipEmail: true });
  // dispatchOrderEmail is fired without await — give the microtask queue a beat.
  await new Promise((resolve) => setTimeout(resolve, 10));

  assert.equal(captured.invoiceDto.suppressNewInvoiceEmail, true);
  assert.equal(captured.dispatched.length, 0, "no email of any kind when skipEmail is set");
});

test("createAdminOrder without skipEmail sends the order confirmation in the recipient's locale", async () => {
  const captured = { dispatched: [] };
  const service = harness(captured);

  await service.createAdminOrder({ userId: "u1", items: [{ productId: "host", quantity: 1, configuration: {} }] });
  await new Promise((resolve) => setTimeout(resolve, 10));

  assert.equal(captured.invoiceDto.suppressNewInvoiceEmail, false);
  const confirmation = captured.dispatched.find(([key]) => key === "order_confirmation");
  assert.ok(confirmation, "order confirmation dispatched");
  // Locale resolves from the order's included user — NOT the store main language (de).
  assert.equal(confirmation[1].user.locale, "en");
});
