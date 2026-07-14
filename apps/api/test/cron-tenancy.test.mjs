/**
 * Tenant-aware cron (Phase 3.1) — the 2-DB no-spill proof.
 *
 * A fleet trigger (no tenant host, control-plane on) must iterate every ACTIVE tenant and run
 * each tenant's jobs inside runWithTenant(ctx), so every job — and every due-clock read/write —
 * lands in that tenant's OWN store. These tests fake two tenant "databases" as per-tenant sinks
 * and assert zero bleed between them, per-tenant due clocks, suspended tenants skipped, and the
 * compact {ran, failed, skipped, perTenant} summary of Phase 3.2.
 *
 * Run with:  npm --workspace @teculiar/api run build && node --test test/cron-tenancy.test.mjs
 */
import assert from "node:assert/strict";
import { before, test } from "node:test";

let CronService;
let getTenantContext;
let runWithTenant;

before(async () => {
  ({ CronService } = await import("../dist/modules/cron/cron.service.js"));
  ({ getTenantContext, runWithTenant } = await import("../dist/tenancy/tenant-context.js"));
});

// One fake "database" per tenant: job calls, audit rows and cron due-clocks all live here, keyed
// by the subdomain the ALS context reports — exactly how the real services fan out via PrismaService.
function makeTenantStores(subdomains) {
  const stores = new Map(subdomains.map((sub) => [sub, { calls: [], audit: [], lastRuns: new Map() }]));
  const current = () => {
    const sub = getTenantContext()?.tenant?.subdomain ?? "default";
    if (!stores.has(sub)) {
      stores.set(sub, { calls: [], audit: [], lastRuns: new Map() });
    }
    return stores.get(sub);
  };
  return { stores, current };
}

function makeCron(current, { controlPlane, registry } = {}) {
  const billing = {
    cronSettings: async () => ({}),
    cronLastRun: async (key) => current().lastRuns.get(key),
    markCronRun: async (key, date) => current().lastRuns.set(key, date),
    recordAction: async (input) => current().audit.push(input.action),
    runAdminMaintenance: async () => {
      current().calls.push("billingMaintenance");
      return { generatedInvoices: 1 };
    },
    sendInvoiceReminders: async () => {
      current().calls.push("invoiceReminders");
      return { invoiceReminders: 1 };
    },
    notifyPendingActivations: async () => {
      current().calls.push("activationEmails");
      return { notified: 0 };
    }
  };
  const orders = { syncDomainPrices: async () => current().calls.push("domainPrices") };
  const products = {
    refreshAllDomainExpirations: async () => current().calls.push("domainExpirations"),
    refreshAllDomainStatuses: async () => current().calls.push("domainStatuses"),
    refreshAllHostingStatuses: async () => current().calls.push("hostingStatuses")
  };
  const tickets = {
    closeAnsweredTickets: async () => {
      current().calls.push("ticketsClose");
      return { count: 0 };
    },
    importMailboxTickets: async () => current().calls.push("mailboxes")
  };
  const theme = { storefrontTheme: async () => null };
  const cms = { listPosts: async () => [] };
  return new CronService(billing, cms, orders, products, theme, tickets, controlPlane, registry);
}

function fleetFixture() {
  const tenants = [
    { id: "t-a", subdomain: "alpha", dbUrl: "mysql://a", status: "active" },
    { id: "t-b", subdomain: "beta", dbUrl: "mysql://b", status: "active" },
    { id: "t-c", subdomain: "gamma", dbUrl: "mysql://c", status: "suspended" }
  ];
  const controlPlane = {
    enabled: true,
    list: async () => tenants,
    surfaceHosts: async () => ({ apex: null, admin: null, client: null })
  };
  const registry = {
    clientFor: (dbUrl) => ({ marker: dbUrl }),
    secretsFor: async () => ({ access: "", refresh: "" })
  };
  return { controlPlane, registry, tenants };
}

test("fleet trigger runs every ACTIVE tenant in its own context with zero bleed", async () => {
  process.env.CRON_SECRET = "fleet-secret";
  const { controlPlane, registry } = fleetFixture();
  const { stores, current } = makeTenantStores(["alpha", "beta"]);
  const cron = makeCron(current, { controlPlane, registry });

  const now = new Date("2026-07-14T10:00:00.000Z");
  // Tenant alpha ran domainPrices recently → ITS clock must skip it; beta has no clock → runs it.
  stores.get("alpha").lastRuns.set("domainPrices", new Date("2026-07-14T09:30:00.000Z"));

  const summary = await cron.runAuthorized("fleet-secret", now);

  assert.equal(summary.ok, true);
  assert.equal(summary.tenants, 2, "suspended tenant gamma must be skipped entirely");
  assert.deepEqual(summary.perTenant.map((t) => t.tenant), ["alpha", "beta"]);

  const alpha = stores.get("alpha");
  const beta = stores.get("beta");
  // Per-tenant due clocks: alpha skipped domainPrices, beta ran it.
  assert.equal(alpha.calls.includes("domainPrices"), false, "alpha's recent lastRun must skip domainPrices");
  assert.equal(beta.calls.includes("domainPrices"), true);
  // Both tenants ran their own always-on jobs — in their own store only.
  for (const store of [alpha, beta]) {
    assert.equal(store.calls.includes("billingMaintenance"), true);
    assert.equal(store.calls.includes("ticketsClose"), true);
    assert.equal(store.audit.includes("cron.started"), true, "heartbeat lands in the tenant's own DB");
    assert.equal(store.audit.includes("cron.completed"), true);
  }
  // The suspended tenant's store was never created — no reads, no writes.
  assert.equal(stores.has("gamma"), false, "suspended tenant must see no job activity");
  delete process.env.CRON_SECRET;
});

test("fleet trigger authorizes with the env secret ONLY (no tenant DB to read an admin secret from)", async () => {
  process.env.CRON_SECRET = "fleet-secret";
  const { controlPlane, registry } = fleetFixture();
  const { current } = makeTenantStores([]);
  const cron = makeCron(current, { controlPlane, registry });

  await assert.rejects(() => cron.runAuthorized("wrong"), /Cron secret invalid/);
  await assert.rejects(() => cron.runAuthorized(undefined), /Cron secret missing/);
  delete process.env.CRON_SECRET;
});

test("a trigger on a tenant host runs ONLY that tenant (no cross-tenant sweep)", async () => {
  process.env.CRON_SECRET = "fleet-secret";
  const { controlPlane, registry, tenants } = fleetFixture();
  const { stores, current } = makeTenantStores(["alpha", "beta"]);
  const cron = makeCron(current, { controlPlane, registry });

  const ctx = { tenant: tenants[0], prisma: { marker: "a" }, jwtSecrets: { access: "", refresh: "" } };
  const summary = await runWithTenant(ctx, () => cron.runAuthorized("fleet-secret"));

  assert.equal(summary.tenants, 1);
  assert.deepEqual(summary.perTenant.map((t) => t.tenant), ["alpha"]);
  assert.equal(stores.get("alpha").calls.length > 0, true);
  assert.deepEqual(stores.get("beta").calls, [], "the other tenant must be untouched");
  delete process.env.CRON_SECRET;
});

test("one tenant's failure never stops the others and is reported per tenant", async () => {
  process.env.CRON_SECRET = "fleet-secret";
  const { registry } = fleetFixture();
  const tenants = [
    { id: "t-x", subdomain: "broken", dbUrl: "mysql://x", status: "active" },
    { id: "t-y", subdomain: "healthy", dbUrl: "mysql://y", status: "active" }
  ];
  const controlPlane = {
    enabled: true,
    list: async () => tenants,
    surfaceHosts: async (tenantId) => {
      if (tenantId === "t-x") {
        throw new Error("control-plane lookup exploded");
      }
      return { apex: null, admin: null, client: null };
    }
  };
  const { stores, current } = makeTenantStores(["healthy"]);
  const cron = makeCron(current, { controlPlane, registry });

  const summary = await cron.runAuthorized("fleet-secret", new Date("2026-07-14T10:00:00.000Z"));

  assert.equal(summary.ok, false);
  assert.equal(summary.tenants, 2);
  const broken = summary.perTenant.find((t) => t.tenant === "broken");
  assert.equal(broken.ok, false);
  assert.match(broken.error, /exploded/);
  assert.equal(stores.get("healthy").calls.includes("billingMaintenance"), true, "healthy tenant still ran");
  delete process.env.CRON_SECRET;
});
