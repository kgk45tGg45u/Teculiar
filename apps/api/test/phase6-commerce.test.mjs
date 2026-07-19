import assert from "node:assert/strict";
import { test } from "node:test";
import {
  MODULE_CATALOG,
  effectiveProductModule,
  effectiveServiceModule
} from "../dist/modules/module-registry/module-catalog.js";
import { OrdersService } from "../dist/modules/orders/orders.service.js";
import { BillingService } from "../dist/modules/billing/billing.service.js";
import { PaymentRegistryService } from "../dist/modules/billing/processors/payment-registry.service.js";
import { PayPalProviderService } from "../dist/modules/billing/processors/paypal-provider.service.js";
import { MollieProviderService } from "../dist/modules/billing/processors/mollie-provider.service.js";
import { SandboxPaymentProviderService } from "../dist/modules/billing/processors/sandbox-provider.service.js";

// ── 6.2 product-first provisioning-module precedence ─────────────────────────────────────────────

test("effectiveProductModule: product module wins over category; 'none' means manual", () => {
  const category = { provisioningModule: "virtualmin" };
  assert.equal(effectiveProductModule({ provisioningModule: "hetzner", category, type: "SHARED_HOSTING" }), "hetzner");
  // Explicit manual on the product stops the chain even with a category module present.
  assert.equal(effectiveProductModule({ provisioningModule: "none", category, type: "SHARED_HOSTING" }), undefined);
  // Unset product falls back to the category.
  assert.equal(effectiveProductModule({ provisioningModule: null, category, type: "SHARED_HOSTING" }), "virtualmin");
  // Category 'none' (written by the 6.2 backfill for manual categories) is manual too.
  assert.equal(effectiveProductModule({ provisioningModule: "", category: { provisioningModule: "none" }, type: "SHARED_HOSTING" }), undefined);
  // Nothing set anywhere → type default.
  assert.equal(effectiveProductModule({ provisioningModule: null, category: null, type: "VPS" }), "hetzner");
  assert.equal(effectiveProductModule({ provisioningModule: null, category: null, type: "SHARED_HOSTING" }), "virtualmin");
  // Legacy spelling canonicalized.
  assert.equal(effectiveProductModule({ provisioningModule: "Resell.biz", category, type: "DOMAIN" }), "resellbiz");
});

test("effectiveServiceModule: product > stored snapshot > category > type default", () => {
  const service = {
    moduleName: "virtualmin",
    product: { provisioningModule: "hetzner", category: { provisioningModule: "resellbiz" }, type: "VPS" }
  };
  assert.equal(effectiveServiceModule(service), "hetzner");
  assert.equal(effectiveServiceModule({ moduleName: "virtualmin", product: { provisioningModule: null, category: { provisioningModule: "resellbiz" } } }), "virtualmin");
  assert.equal(effectiveServiceModule({ moduleName: null, product: { provisioningModule: null, category: { provisioningModule: "resellbiz" } } }), "resellbiz");
  assert.equal(effectiveServiceModule({ moduleName: null, product: null }), "virtualmin");
  // Explicit manual on the product wins over a stored snapshot.
  assert.equal(effectiveServiceModule({ moduleName: "virtualmin", product: { provisioningModule: "none", category: null } }), undefined);
});

test("module catalog lists the payment gateways", () => {
  const payment = MODULE_CATALOG.filter((module) => module.kind === "payment").map((module) => module.name);
  assert.deepEqual(payment.sort(), ["mollie", "paypal"]);
});

// ── 6.1 addon pricing through previewOrder ──────────────────────────────────────────────────────

function ordersServiceWithProduct(product) {
  const orders = { findProduct: async () => product };
  const billing = {
    vatForBuyer: async () => ({ rate: 19, reverseCharge: false }),
    mainCurrency: async () => "EUR"
  };
  return new OrdersService(orders, billing, {}, {}, {});
}

const hostingProduct = {
  id: "prod-1",
  name: "Web Hosting M",
  slug: "web-hosting-m",
  type: "SHARED_HOSTING",
  provisioningModule: "virtualmin",
  freeDomainBillingCycle: null,
  prices: [{ id: "price-1", billingCycle: "MONTHLY", amountCents: 1000, setupFeeCents: 0 }],
  addOns: [
    { addOnId: "addon-1", addOn: { id: "addon-1", active: true, amountCents: 300, setupFeeCents: 200, name: "Daily Backup", recurring: true, slug: "daily-backup" } },
    { addOnId: "addon-2", addOn: { id: "addon-2", active: true, amountCents: 900, setupFeeCents: 0, name: "Nextcloud Setup", recurring: false, slug: "nextcloud-setup" } }
  ]
};

test("previewOrder prices chosen addons into subtotal/setup and snapshots them on the item", async () => {
  const service = ordersServiceWithProduct(hostingProduct);
  const preview = await service.previewOrder({
    items: [{ productId: "prod-1", productPriceId: "price-1", quantity: 1, addOnIds: ["addon-1", "addon-2"] }]
  });

  // 1000 product + 300 + 900 addon recurring amounts → subtotal; addon setup fee → setup bucket.
  assert.equal(preview.subtotalCents, 1000 + 300 + 900);
  assert.equal(preview.setupFeeCents, 200);
  assert.equal(preview.taxAmountCents, Math.round((1000 + 300 + 900 + 200) * 0.19));

  const item = preview.items[0];
  assert.equal(item.totalCents, 1000 + 300 + 200 + 900);
  assert.equal(item.addOns.length, 2);
  // The snapshot also rides on configuration — the only field persisted onto the OrderItem row.
  assert.equal(item.configuration.addOns.length, 2);
  assert.deepEqual(item.configuration.addOns.map((a) => a.addOnId).sort(), ["addon-1", "addon-2"]);
});

test("previewOrder rejects an addon that is not assigned to the product", async () => {
  const service = ordersServiceWithProduct(hostingProduct);
  await assert.rejects(
    () => service.previewOrder({ items: [{ productId: "prod-1", productPriceId: "price-1", addOnIds: ["addon-unknown"] }] }),
    /Addon is not available/
  );
});

test("previewOrder without addons is unchanged", async () => {
  const service = ordersServiceWithProduct(hostingProduct);
  const preview = await service.previewOrder({ items: [{ productId: "prod-1", productPriceId: "price-1" }] });
  assert.equal(preview.subtotalCents, 1000);
  assert.equal(preview.setupFeeCents, 0);
  assert.equal(preview.items[0].addOns, undefined);
  assert.equal(preview.items[0].configuration.addOns, undefined);
});

// ── 6.1 recurring addons on renewal invoices ────────────────────────────────────────────────────

test("renewSubscription adds ADDON_RENEWAL lines for recurring addons only", async () => {
  const nextInvoiceAt = new Date("2026-08-01T00:00:00Z");
  const subscription = {
    id: "sub-1",
    userId: "user-1",
    serviceId: "svc-1",
    billingCycle: "MONTHLY",
    nextInvoiceAt,
    coupon: null,
    user: { countryCode: "DE", vatId: null, customerType: "INDIVIDUAL" },
    productPrice: { amountCents: 500 },
    service: {
      recurringAmountCents: 1000,
      product: { name: "Web Hosting M" },
      productSnapshot: null,
      serviceAddOns: [
        { quantity: 1, addOn: { name: "Daily Backup", amountCents: 300, recurring: true } },
        { quantity: 1, addOn: { name: "Nextcloud Setup", amountCents: 900, recurring: false } }
      ]
    }
  };
  const billing = {
    findSubscription: async () => subscription,
    advanceSubscription: async () => {}
  };
  const service = new BillingService(billing, {}, {});
  let captured;
  service.createInvoice = async (dto) => { captured = dto; return { id: "inv-1", totalCents: 0 }; };

  await service.renewSubscription("sub-1");

  assert.equal(captured.lines.length, 2);
  const [renewal, addOn] = captured.lines;
  assert.equal(renewal.type, "SERVICE_RENEWAL");
  assert.equal(renewal.unitAmountCents, 1000);
  assert.equal(addOn.type, "ADDON_RENEWAL");
  assert.equal(addOn.description, "Daily Backup renewal");
  assert.equal(addOn.unitAmountCents, 300);
  // The addon line must NOT carry a lifecycleAction — only the service line drives provisioning.
  assert.equal(addOn.lifecycleAction, undefined);
});

// ── 6.4 payment registry routing ────────────────────────────────────────────────────────────────

function registry(gateways, activeModules = { paypal: true, mollie: true }) {
  const billing = { paymentGateway: async (method) => gateways[method] ?? null };
  const modules = { moduleActive: async (name) => activeModules[name] !== false };
  return new PaymentRegistryService(
    billing,
    new PayPalProviderService(),
    new MollieProviderService(),
    new SandboxPaymentProviderService(),
    modules
  );
}

test("registry routes PAYPAL to the paypal provider when clientId is stored", async () => {
  const resolved = await registry({ PAYPAL: { enabled: true, config: { clientId: "abc", clientSecret: "s" } } }).resolve("PAYPAL");
  assert.equal(resolved.provider.name, "paypal");
});

test("registry routes PAYPAL to mollie when the row stores a Mollie API key", async () => {
  const resolved = await registry({ PAYPAL: { enabled: true, config: { apiKey: "live_x" } } }).resolve("PAYPAL");
  assert.equal(resolved.provider.name, "mollie");
});

test("registry falls back to sandbox for disabled or credential-less gateways", async () => {
  assert.equal((await registry({}).resolve("PAYPAL")).provider.name, "sandbox");
  assert.equal((await registry({ PAYPAL: { enabled: false, config: { clientId: "abc" } } }).resolve("PAYPAL")).provider.name, "sandbox");
  assert.equal((await registry({ PAYPAL: { enabled: true, config: {} } }).resolve("PAYPAL")).provider.name, "sandbox");
});

test("registry kill switch: disabling the module forces sandbox without touching credentials", async () => {
  const gateways = { PAYPAL: { enabled: true, config: { clientId: "abc", clientSecret: "s" } } };
  assert.equal((await registry(gateways, { paypal: false }).resolve("PAYPAL")).provider.name, "sandbox");
  const cc = { CREDIT_CARD: { enabled: true, config: { apiKey: "live_x" } } };
  assert.equal((await registry(cc, { mollie: false }).resolve("CREDIT_CARD")).provider.name, "sandbox");
  assert.equal((await registry(cc, { mollie: false }).mollieConfig("CREDIT_CARD")), undefined);
});

test("CREDIT_CARD routes to mollie even with an incomplete config (explicit API-key error path)", async () => {
  const resolved = await registry({ CREDIT_CARD: { enabled: true, config: {} } }).resolve("CREDIT_CARD");
  assert.equal(resolved.provider.name, "mollie");
});
