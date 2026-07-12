import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import { OrdersService } from "../dist/modules/orders/orders.service.js";
import { BillingService } from "../dist/modules/billing/billing.service.js";
import { AbstractPaymentService } from "../dist/modules/billing/processors/abstract-payment.service.js";
import { DomainPricingService } from "../dist/modules/orders/domain-pricing.service.js";

const customer = {
  address: { city: "Berlin", line1: "Example Str. 1", postalCode: "10115" },
  email: "bijans@test.com",
  name: "Bijan Test",
  password: "secret-password",
  countryCode: "DE"
};

test("new storefront checkout stores order under pending checkout user, not client email", async () => {
  const calls = [];
  const pendingUser = { id: "pending-user", email: "pending-checkout@dezhost.local" };
  const item = pricedHostingItem();
  const orders = {
    // Order creation is deferred to payment confirmation — checkout must NOT create it.
    createOrder: async () => {
      throw new Error("checkout created an order before payment");
    },
    createPendingEntitiesForOrder: async () => {
      throw new Error("checkout created pending entities before payment");
    },
    findActiveDomainRecord: async () => null,
    findActiveHostingServiceByDomain: async () => null
  };
  const billing = {
    createInvoice: async (input) => {
      calls.push(["createInvoice", input.userId, input.orderSnapshot.pendingCheckout?.email]);
      return { id: "invoice-1", subtotalCents: 1200, taxAmountCents: 0, totalCents: 1200 };
    },
    vatPercent: async () => 0,
    vatForBuyer: async () => ({ rate: 0, reverseCharge: false })
  };
  const users = {
    findByEmail: async () => null,
    findOrCreatePendingCheckoutUser: async () => pendingUser,
    createUser: async () => {
      throw new Error("new checkout created a real client before payment");
    }
  };

  const service = new OrdersService(orders, billing, {}, users, domainPricing());
  service.priceItems = async () => [item];

  const result = await service.checkout({ customer, items: [{ productId: "hosting" }] });

  assert.deepEqual(calls, [["createInvoice", "pending-user", "bijans@test.com"]]);
  // The invoice id doubles as the checkout session id until payment succeeds.
  assert.equal(result.order.id, "invoice-1");
});

test("new storefront checkout normalizes email before user lookup and snapshot", async () => {
  const calls = [];
  const pendingUser = { id: "pending-user", email: "pending-checkout@dezhost.local" };
  const item = pricedHostingItem();
  const orders = {
    createOrder: async () => {
      throw new Error("checkout created an order before payment");
    },
    createPendingEntitiesForOrder: async () => undefined,
    findActiveDomainRecord: async () => null,
    findActiveHostingServiceByDomain: async () => null
  };
  const billing = {
    createInvoice: async (input) => {
      calls.push(["createInvoice", input.userId, input.orderSnapshot.pendingCheckout?.email]);
      return { id: "invoice-1", subtotalCents: 1200, taxAmountCents: 0, totalCents: 1200 };
    },
    vatPercent: async () => 0,
    vatForBuyer: async () => ({ rate: 0, reverseCharge: false })
  };
  const users = {
    findByEmail: async (email) => {
      calls.push(["findByEmail", email]);
      return null;
    },
    findOrCreatePendingCheckoutUser: async () => pendingUser
  };

  const service = new OrdersService(orders, billing, {}, users, domainPricing());
  service.priceItems = async () => [item];

  await service.checkout({ customer: { ...customer, email: "  Bijans+New@Test.COM  " }, items: [{ productId: "hosting" }] });

  assert.deepEqual(calls, [
    ["findByEmail", "bijans+new@test.com"],
    ["createInvoice", "pending-user", "bijans+new@test.com"]
  ]);
});

test("logged-in storefront checkout can reuse the account email without password re-registration", async () => {
  const calls = [];
  const existingUser = { customerNumber: 123, id: "real-user", email: "bijans@test.com", passwordHash: "stored-hash" };
  const item = pricedHostingItem();
  const orders = {
    createOrder: async () => {
      throw new Error("checkout created an order before payment");
    },
    createPendingEntitiesForOrder: async () => undefined,
    findActiveDomainRecord: async () => null,
    findActiveHostingServiceByDomain: async () => null
  };
  const billing = {
    createInvoice: async (input) => {
      calls.push(["createInvoice", input.userId, input.orderSnapshot.pendingCheckout]);
      return { id: "invoice-1", subtotalCents: 1200, taxAmountCents: 0, totalCents: 1200 };
    },
    vatPercent: async () => 0,
    vatForBuyer: async () => ({ rate: 0, reverseCharge: false })
  };
  const users = {
    findById: async (id) => {
      calls.push(["findById", id]);
      return existingUser;
    },
    findByEmail: async () => {
      throw new Error("logged-in checkout looked up submitted email");
    },
    findOrCreatePendingCheckoutUser: async () => {
      throw new Error("logged-in checkout used pending checkout user");
    }
  };

  const service = new OrdersService(orders, billing, {}, users, domainPricing());
  service.priceItems = async () => [item];

  await service.checkout(
    { customer: { ...customer, password: "not-the-current-password" }, items: [{ productId: "hosting" }] },
    { sub: "real-user" }
  );

  assert.deepEqual(calls, [
    ["findById", "real-user"],
    ["createInvoice", "real-user", undefined]
  ]);
});

test("logged-in storefront checkout does not require a password", async () => {
  const existingUser = { customerNumber: 123, id: "real-user", email: "bijans@test.com", passwordHash: "stored-hash" };
  const item = pricedHostingItem();
  const orders = {
    createOrder: async (input) => ({ id: "order-1", items: [{ ...item, id: "order-item-1" }], userId: input.userId }),
    createPendingEntitiesForOrder: async () => undefined,
    findActiveDomainRecord: async () => null,
    findActiveHostingServiceByDomain: async () => null
  };
  const billing = {
    createInvoice: async () => ({ id: "invoice-1", subtotalCents: 1200, taxAmountCents: 0, totalCents: 1200 }),
    vatPercent: async () => 0,
    vatForBuyer: async () => ({ rate: 0, reverseCharge: false })
  };
  const users = {
    findById: async () => existingUser,
    findByEmail: async () => {
      throw new Error("logged-in checkout looked up submitted email");
    },
    findOrCreatePendingCheckoutUser: async () => {
      throw new Error("logged-in checkout used pending checkout user");
    }
  };

  const service = new OrdersService(orders, billing, {}, users, domainPricing());
  service.priceItems = async () => [item];

  await assert.doesNotReject(
    service.checkout(
      { customer: { ...customer, password: "" }, items: [{ productId: "hosting" }] },
      { sub: "real-user" }
    )
  );
});

test("logged-in storefront checkout uses token account over autofilled email", async () => {
  const calls = [];
  const authUser = { customerNumber: 777, email: "new-client@example.test", id: "new-user" };
  const wrongUser = { customerNumber: 111, email: "bijans@gmail.com", id: "wrong-user", passwordHash: "wrong-hash" };
  const item = pricedHostingItem();
  const orders = {
    createOrder: async () => {
      throw new Error("checkout created an order before payment");
    },
    createPendingEntitiesForOrder: async () => undefined,
    findActiveDomainRecord: async () => null,
    findActiveHostingServiceByDomain: async () => null
  };
  const billing = {
    createInvoice: async (input) => {
      calls.push(["createInvoice", input.userId, input.customerSnapshot.email, input.customerSnapshot.customerNumber]);
      return { id: "invoice-1", subtotalCents: 1200, taxAmountCents: 0, totalCents: 1200 };
    },
    vatPercent: async () => 0,
    vatForBuyer: async () => ({ rate: 0, reverseCharge: false })
  };
  const users = {
    findById: async (id) => {
      calls.push(["findById", id]);
      return authUser;
    },
    findByEmail: async () => wrongUser,
    findOrCreatePendingCheckoutUser: async () => {
      throw new Error("logged-in checkout used pending checkout user");
    }
  };

  const service = new OrdersService(orders, billing, {}, users, domainPricing());
  service.priceItems = async () => [item];

  await service.checkout(
    { customer: { ...customer, email: "bijans@gmail.com", password: "autofilled-old-password" }, items: [{ productId: "hosting" }] },
    { sub: "new-user" }
  );

  assert.deepEqual(calls, [
    ["findById", "new-user"],
    ["createInvoice", "new-user", "new-client@example.test", 777]
  ]);
});

test("domain checkout requires registrant contact data before payment", async () => {
  const users = { findByEmail: async () => null };
  const service = new OrdersService({}, { vatPercent: async () => 0, vatForBuyer: async () => ({ rate: 0, reverseCharge: false }) }, {}, users, domainPricing());
  service.priceItems = async () => [{ ...pricedHostingItem(), type: "DOMAIN", domainName: "bijans-test.com" }];

  await assert.rejects(
    service.checkout({ customer, items: [{ domainName: "bijans-test.com", productId: "domain" }] }),
    /Phone number is required/
  );
});

test("successful order payment materializes checkout client before provisioning", async () => {
  const calls = [];
  const billing = {
    payInvoice: async () => ({ id: "paid-invoice", status: "PAID" }),
    materializePaidCheckoutUser: async (invoiceId) => {
      calls.push(["materialize", invoiceId]);
      return { id: "real-user", email: customer.email };
    },
    onInvoicePaid: async (invoiceId) => calls.push(["provision", invoiceId])
  };
  const orders = {
    findOrderForActivation: async () => ({ id: "order-1", invoiceId: "invoice-1", items: [], userId: "pending-user" }),
    markOrderPaid: async () => calls.push(["paid"]),
    markOrderInProgress: async () => calls.push(["in-progress"])
  };

  const service = new OrdersService(orders, billing, {}, {}, domainPricing());
  await service.payOrder("order-1", { method: "PAYPAL", paymentMethodId: "pm_1" });

  assert.deepEqual(calls, [
    ["materialize", "invoice-1"],
    ["paid"],
    ["in-progress"],
    ["provision", "invoice-1"]
  ]);
});

test("billing finalization materializes paid checkout before lifecycle modules", async () => {
  const calls = [];
  const billingRepo = {
    findCoupon: async () => null,
    findInvoice: async () => ({
      id: "invoice-1",
      invoiceNumber: "N-100001",
      orderSnapshot: { pendingCheckout: { email: customer.email, passwordHash: "hash" } },
      status: "PENDING",
      totalCents: 1200,
      transactions: []
    }),
    markInvoicePaid: async () => {
      calls.push("mark-paid");
      return { id: "invoice-1", status: "PAID" };
    },
    materializePaidCheckoutUser: async () => {
      calls.push("materialize");
      return { id: "real-user" };
    },
    createTransaction: async () => undefined
  };
  const payments = {
    get: () => ({
      charge: async () => ({ providerReference: "tx-1", raw: {}, status: "SUCCEEDED" })
    })
  };
  const service = new BillingService(billingRepo, {}, payments);
  service.onInvoicePaid = async () => calls.push("lifecycle");

  await service.payInvoice("invoice-1", { method: "PAYPAL", paymentMethodId: "pm_1" });

  assert.deepEqual(calls, ["mark-paid", "materialize", "lifecycle"]);
});

test("sandbox checkout payment bypasses configured external gateway", async () => {
  const billingRepo = {
    paymentGateway: async () => ({
      enabled: true,
      config: { apiKey: "test_should_not_be_used", provider: "mollie" },
      method: "CREDIT_CARD"
    })
  };
  const payments = new AbstractPaymentService(billingRepo);

  const result = await payments.get("CREDIT_CARD").charge({
    amountCents: 1200,
    currency: "EUR",
    description: "Invoice N-1",
    invoiceId: "invoice-1",
    paymentMethodId: "sandbox",
    redirectUrl: "http://localhost:3000/client/billing/payment-return?invoiceId=invoice-1",
    webhookUrl: "http://localhost:4000/api/v1/billing/webhooks/credit_card"
  });

  assert.equal(result.status, "SUCCEEDED");
  assert.equal(result.raw.sandbox, true);
});

test("client dashboard does not ship sample client data", async () => {
  const source = await readFile(new URL("../../web/components/portal/client-dashboard.tsx", import.meta.url), "utf8");

  assert.match(source, /useState<ApiService\[]>\(\[]\)/);
  assert.match(source, /useState<ApiInvoice\[]>\(\[]\)/);
  assert.match(source, /useState<ApiTicket\[]>\(\[]\)/);
  assert.doesNotMatch(source, /const sampleServices/);
  assert.doesNotMatch(source, /svc_1|inv_1|Emails not working/);
});

test("checkout form pays new-client order before trying client login", async () => {
  const source = await readFile(new URL("../../storefront/components/checkout/checkout-form.tsx", import.meta.url), "utf8");
  const checkoutIndex = source.indexOf('postJson<{ order: { id: string } }>("/orders/checkout"');
  const checkoutOrderIdIndex = source.indexOf("checkoutOrderId = checkoutResponse.order.id", checkoutIndex);
  const payIndex = source.indexOf("`/orders/${checkoutOrderId}/pay`", checkoutOrderIdIndex);
  const loginIndex = source.indexOf('postJson<AuthPayload>("/auth/login"', checkoutIndex);

  assert.ok(checkoutIndex > 0);
  assert.ok(checkoutOrderIdIndex > checkoutIndex);
  assert.ok(payIndex > checkoutOrderIdIndex);
  assert.ok(loginIndex > payIndex);
});

test("checkout form locks logged-in checkout to profile email", async () => {
  const source = await readFile(new URL("../../storefront/components/checkout/checkout-form.tsx", import.meta.url), "utf8");

  assert.match(source, /const customerEmail = profile\?\.email \?\? String\(formData\.get\("email"\) \?\? ""\)\.trim\(\)\.toLowerCase\(\)/);
  assert.match(source, /email: customerEmail/);
  assert.match(source, /profileCheckoutCustomer\(profile, formData\)/);
});

test("checkout API requests include auth headers when present", async () => {
  const source = await readFile(new URL("../../storefront/components/checkout/checkout-form.tsx", import.meta.url), "utf8");

  assert.match(source, /headers: \{ \.\.\.authHeaders\("client"\), "Content-Type": "application\/json" \}/);
});

test("site header swaps account link for signed-in account menu with logout", async () => {
  const header = await readFile(new URL("../../../packages/web-core/src/components/layout/site-header.tsx", import.meta.url), "utf8");
  const menu = await readFile(new URL("../../../packages/web-core/src/components/layout/account-menu.tsx", import.meta.url), "utf8");

  assert.match(header, /<AccountMenu clientBaseUrl=\{clientBaseUrl\} \/>/); // Phase 2.3
  assert.match(menu, /Dashboard/);
  assert.match(menu, /Log out/);
  assert.match(menu, /clearAuth\("client"\)/);
});

test("portal and admin dashboards expose logout actions", async () => {
  const client = await readFile(new URL("../../web/components/portal/client-dashboard.tsx", import.meta.url), "utf8");
  const admin = await readFile(new URL("../../web/components/admin/admin-dashboard.tsx", import.meta.url), "utf8");
  const accountMenu = await readFile(new URL("../../../packages/web-core/src/components/layout/account-menu.tsx", import.meta.url), "utf8");

  assert.match(accountMenu, /clearAuth\("client"\)/);
  assert.match(client, /href=\{href\("\/client\/profile"\)\}/); // Phase 2.2: surface-mapped href
  assert.match(admin, /<LogoutButton scope="admin"/);
});

test("signed-in checkout uses profile data and hides contact fields", async () => {
  const source = await readFile(new URL("../../storefront/components/checkout/checkout-form.tsx", import.meta.url), "utf8");

  assert.match(source, /getJson<ClientProfile>\("\/users\/me", authToken\("client"\)\)/);
  assert.match(source, /profile \? profileCheckoutCustomer\(profile, formData\)/);
  assert.match(source, /missingProfileFields/);
  assert.match(source, /ProfileCompletionFields/);
  assert.match(source, /\{!profile \? <ContactFields/);
});

test("guest checkout password field has eye visibility toggle", async () => {
  const source = await readFile(new URL("../../storefront/components/checkout/checkout-form.tsx", import.meta.url), "utf8");

  assert.match(source, /showPassword/);
  assert.match(source, /type=\{showPassword \? "text" : "password"\}/);
  assert.match(source, /aria-label=\{showPassword \? copy\.hidePassword : copy\.showPassword\}/);
});

test("client dashboard puts combined feed below services", async () => {
  const source = await readFile(new URL("../../web/components/portal/client-dashboard.tsx", import.meta.url), "utf8");
  const css = await readFile(new URL("../../web/components/portal/client-dashboard.module.css", import.meta.url), "utf8");
  const feedIndex = source.indexOf("<DashboardKnowledgeFeed");
  const servicesIndex = source.indexOf("<ServicesTable");
  // The overview label moved into the localized client pack (copy.dash.overviewAria).
  const overviewIndex = source.indexOf('aria-label={copy.dash.overviewAria}');

  assert.ok(overviewIndex > 0);
  assert.ok(servicesIndex > overviewIndex);
  assert.ok(feedIndex > servicesIndex);
  assert.match(source, /className=\{styles\.balanceCard\}/);
  assert.match(source, /copy\.announcementsAndArticles/);
  assert.match(source, /dashboardFeedItems/);
  assert.match(css, /position:\s*sticky[\s\S]*top:\s*0/);
  assert.match(css, /\.dashboardFeed/);
  assert.match(css, /\.feedItem/);
});

test("client dashboard responsive CSS prevents page-wide overflow", async () => {
  const css = await readFile(new URL("../../web/components/portal/client-dashboard.module.css", import.meta.url), "utf8");

  assert.match(css, /\.page\s*\{[\s\S]*grid-template-columns:\s*24[02]px minmax\(0, 1fr\)/);
  assert.match(css, /\.main\s*\{[\s\S]*min-width:\s*0/);
  assert.match(css, /\.headerActions/);
  assert.match(css, /@media \(max-width: 920px\)[\s\S]*\.headerActions\s*\{[\s\S]*grid-template-columns:\s*repeat\(2, minmax\(0, 1fr\)\)/);
  assert.match(css, /@media \(max-width: 920px\)[\s\S]*\.tableWrap\s*\{[\s\S]*max-width:\s*100%/);
  assert.match(css, /@media \(max-width: 920px\)[\s\S]*\.overviewGrid\s*\{[\s\S]*grid-template-columns:\s*repeat\(2, minmax\(0, 232px\)\)[\s\S]*\.overviewCard\s*\{[\s\S]*min-height:\s*180px/);
  assert.match(css, /@media \(max-width: 700px\)[\s\S]*\.overviewGrid\s*\{[\s\S]*grid-template-columns:\s*repeat\(2, minmax\(0, 1fr\)\)/);
  assert.match(css, /@media \(max-width: 520px\)[\s\S]*\.overviewGrid\s*\{[\s\S]*grid-template-columns:\s*1fr/);
});

test("domain prices use matching year row as yearly unit and multiply by years", async () => {
  const calls = [];
  const orders = {
    findProduct: async () => ({
      id: "domain-product",
      name: "Domain",
      prices: [
        { amountCents: 900, billingCycle: "YEAR_1", id: "domain-year-1", setupFeeCents: 0 },
        { amountCents: 1000, billingCycle: "YEAR_2", id: "domain-year-2", setupFeeCents: 0 }
      ],
      type: "DOMAIN"
    })
  };
  const domainPricing = {
    priceFor: async (domain, fallbackCents, action, years) => {
      calls.push([domain, fallbackCents, action, years]);
      return { amountCents: 1100, source: "live", tld: "com" };
    }
  };
  const service = new OrdersService(orders, { vatPercent: async () => 0, vatForBuyer: async () => ({ rate: 0, reverseCharge: false }) }, {}, {}, domainPricing);

  const preview = await service.previewOrder({
    items: [{
      configuration: { billingCycle: "YEAR_2", domainAction: "register" },
      domainName: "example.com",
      productId: "domain-product",
      productPriceId: "domain-year-2",
      quantity: 1
    }]
  });

  assert.deepEqual(calls, [["example.com", 1000, "register", 2]]);
  assert.equal(preview.items[0].quantity, 2);
  assert.equal(preview.items[0].unitAmountCents, 1100);
  assert.equal(preview.items[0].totalCents, 2200);
  assert.equal(preview.subtotalCents, 2200);
});

test("domain pricing honors requested billing cycle when product price id is only a fallback", async () => {
  const calls = [];
  const orders = {
    findProduct: async () => ({
      id: "domain-product",
      name: "Domain",
      prices: [
        { amountCents: 900, billingCycle: "YEAR_1", id: "domain-year-1", setupFeeCents: 0 }
      ],
      type: "DOMAIN"
    }),
    findDomainProductPrice: async () => null
  };
  const domainPricing = {
    priceFor: async (domain, fallbackCents, action, years) => {
      calls.push([domain, fallbackCents, action, years]);
      return { amountCents: 1200, source: "live", tld: "com" };
    }
  };
  const service = new OrdersService(orders, { vatPercent: async () => 0, vatForBuyer: async () => ({ rate: 0, reverseCharge: false }) }, {}, {}, domainPricing);

  const preview = await service.previewOrder({
    items: [{
      configuration: { billingCycle: "YEAR_3", domainAction: "register" },
      domainName: "example.com",
      productId: "domain-product",
      productPriceId: "domain-year-1",
      quantity: 1
    }]
  });

  assert.deepEqual(calls, [["example.com", 900, "register", 3]]);
  assert.equal(preview.items[0].billingCycle, "YEAR_3");
  assert.equal(preview.items[0].quantity, 3);
  assert.equal(preview.items[0].totalCents, 3600);
});

test("suggested-only domain price markers do not become zero live prices", async () => {
  const prisma = {
    domainTldPrice: {
      findFirst: async () => ({ amountCents: 0 })
    }
  };
  const service = new DomainPricingService(prisma);

  const price = await service.priceFor("example.com", 1500, "register", 1);

  assert.equal(price.amountCents, 1500);
  assert.equal(price.source, "fallback");
});

test("admin can save suggested TLD without manual amount", async () => {
  const calls = [];
  const prisma = {
    domainTldPrice: {
      upsert: async (input) => {
        calls.push(input);
      }
    }
  };
  const service = new DomainPricingService(prisma);

  await service.upsertStoredPrice({ action: "register", suggested: true, tld: "app", years: 1 });

  assert.equal(calls.length, 1);
  assert.equal(calls[0].create.amountCents, 0);
  assert.equal(calls[0].update.suggested, true);
  assert.equal(calls[0].update.amountCents, undefined);
});

test("checkout summary multiplies selected domain year price by selected years", async () => {
  const source = await readFile(new URL("../../storefront/components/checkout/checkout-form.tsx", import.meta.url), "utf8");

  assert.match(source, /function domainUnitPriceCents/);
  assert.match(source, /domainYears \* domainUnitPrice/);
  assert.match(source, /price\.billingCycle === cycle/);
});

test("checkout domain year dropdown comes from positive TLD registration prices", async () => {
  const source = await readFile(new URL("../../storefront/components/checkout/checkout-form.tsx", import.meta.url), "utf8");

  assert.match(source, /getJson<ApiDomainPrice\[\]>\("\/storefront\/domain-prices"\)/);
  assert.match(source, /function domainSelectablePrices/);
  assert.match(source, /price\.amountCents > 0/);
  assert.match(source, /priceKey\(price\)/);
});

function pricedHostingItem() {
  return {
    billingCycle: "YEAR_1",
    configuration: { domainName: "bijans-test.com", bundledDomain: true },
    description: "Hosting",
    productId: "hosting",
    productPriceId: "hosting-year",
    quantity: 1,
    setupFeeCents: 0,
    totalCents: 1200,
    type: "SHARED_HOSTING",
    unitAmountCents: 1200
  };
}

function domainPricing() {
  return { priceFor: async (_domain, amountCents) => ({ amountCents }) };
}
