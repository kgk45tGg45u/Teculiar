/**
 * Tecreator platform-provisioning module (Phase 4.3).
 *
 * Tecreator is the module that lets Teculiar sell itself: buying a Teculiar plan provisions a whole
 * new TENANT via the 4.1 `createTenant` primitive, through the SAME HostingProvider interface + order
 * pipeline as Virtualmin/Hetzner. These tests prove the wiring + behaviour in isolation (no Nest boot,
 * no DB): the catalog registers it under the new `platform` kind, ExternalService routes the
 * "tecreator" module name to it, and the provider delegates to createTenant / degrades gracefully.
 *
 * Run with:  npm --workspace @teculiar/api run build && node --test test/tecreator-module.test.mjs
 */

import assert from "node:assert/strict";
import { test, before } from "node:test";

let TecreatorProviderService;
let ExternalService;
let MODULE_KINDS;
let MODULE_CATALOG;
let moduleDefinition;
let runWithTenant;
let assertTenantActive;

before(async () => {
  const provider = await import("../dist/modules/external/tecreator-provider.service.js");
  const external = await import("../dist/modules/external/external.service.js");
  const catalog = await import("../dist/modules/module-registry/module-catalog.js");
  const ctx = await import("../dist/tenancy/tenant-context.js");
  const guard = await import("../dist/modules/auth/guards/jwt-auth.guard.js");
  TecreatorProviderService = provider.TecreatorProviderService;
  ExternalService = external.ExternalService;
  MODULE_KINDS = catalog.MODULE_KINDS;
  MODULE_CATALOG = catalog.MODULE_CATALOG;
  moduleDefinition = catalog.moduleDefinition;
  runWithTenant = ctx.runWithTenant;
  assertTenantActive = guard.assertTenantActive;
});

// ── Catalog ──────────────────────────────────────────────────────────────────

test("catalog registers the platform kind + the tecreator module", () => {
  assert.ok(MODULE_KINDS.includes("platform"), "MODULE_KINDS should include 'platform'");
  const def = moduleDefinition("tecreator");
  assert.ok(def, "tecreator module should exist in the catalog");
  assert.equal(def.kind, "platform");
  assert.ok(Array.isArray(def.fields));
});

// ── Provider selection ─────────────────────────────────────────────────────────

test("ExternalService routes the 'tecreator' module name to the Tecreator provider", () => {
  const tecreator = { marker: "tecreator" };
  const virtualmin = { marker: "virtualmin" };
  const hetzner = { marker: "hetzner" };
  const svc = new ExternalService(virtualmin, { marker: "resellbiz" }, hetzner, tecreator);
  assert.equal(svc.hostingProvider("tecreator", "TENANT").marker, "tecreator");
  // Unrelated modules/types still resolve as before — no regression.
  assert.equal(svc.hostingProvider(null, "VPS").marker, "hetzner");
  assert.equal(svc.hostingProvider(null, "SHARED_HOSTING").marker, "virtualmin");
});

// ── Provider behaviour ───────────────────────────────────────────────────────

function makeProvider({ enabled = true, createTenant, findBySubdomain } = {}) {
  const calls = { createTenant: [] };
  const tenants = {
    async createTenant(input) {
      calls.createTenant.push(input);
      if (createTenant) return createTenant(input);
      return { subdomain: input.subdomain, dbName: `db_${input.subdomain}`, url: `https://${input.subdomain}.teculiar.net`, adminEmail: input.adminEmail ?? `admin@${input.subdomain}.teculiar.net`, adminPassword: "secret-pw" };
    }
  };
  const controlPlane = {
    enabled,
    async findBySubdomain(sub) {
      return findBySubdomain ? findBySubdomain(sub) : null;
    },
    async setStatus(subdomain, status) {
      calls.setStatus.push({ subdomain, status });
      return { subdomain, status };
    }
  };
  calls.setStatus = [];
  return { provider: new TecreatorProviderService(tenants, controlPlane), calls };
}

const req = (options) => ({ serviceId: "svc_1", productType: "teculiar", options });

test("provision degrades to QUEUED when the control-plane is not configured", async () => {
  const { provider, calls } = makeProvider({ enabled: false });
  const result = await provider.provision(req({ subdomain: "acme" }));
  assert.equal(result.status, "QUEUED");
  assert.match(String(result.metadata.reason), /control-plane/i);
  assert.equal(calls.createTenant.length, 0, "must not attempt to create a tenant when disabled");
});

test("provision creates the tenant and returns ACTIVE + credentials for the email", async () => {
  const { provider, calls } = makeProvider();
  const result = await provider.provision(req({ subdomain: "Acme", adminEmail: "buyer@example.com", brand: "Acme Inc" }));
  assert.equal(result.status, "ACTIVE");
  assert.equal(result.externalId, "acme");
  assert.equal(result.metadata.credentials.username, "buyer@example.com");
  assert.equal(result.metadata.credentials.password, "secret-pw");
  assert.match(result.metadata.credentials.controlPanelUrl, /\/admin$/);
  // Delegated to createTenant with the normalised subdomain + buyer email + brand.
  assert.equal(calls.createTenant.length, 1);
  assert.equal(calls.createTenant[0].subdomain, "acme");
  assert.equal(calls.createTenant[0].adminEmail, "buyer@example.com");
});

test("provision auto-generates a subdomain when the buyer chose none", async () => {
  const { provider, calls } = makeProvider();
  const result = await provider.provision(req({ subdomainPrefix: "user" }));
  assert.equal(result.status, "ACTIVE");
  assert.match(calls.createTenant[0].subdomain, /^user\d+$/);
});

test("provision surfaces a FAILED result (not a throw) when createTenant fails", async () => {
  const { provider } = makeProvider({ createTenant: () => { throw new Error("Tenant \"acme\" already exists."); } });
  const result = await provider.provision(req({ subdomain: "acme" }));
  assert.equal(result.status, "FAILED");
  assert.match(String(result.metadata.reason), /already exists/);
});

test("status reflects control-plane presence", async () => {
  const found = makeProvider({ findBySubdomain: (sub) => ({ subdomain: sub, plan: "teculiar", status: "active" }) });
  const active = await found.provider.status("acme");
  assert.equal(active.status, "ACTIVE");
  assert.equal(active.externalId, "acme");

  const missing = makeProvider({ findBySubdomain: () => null });
  const queued = await missing.provider.status("ghost");
  assert.equal(queued.status, "QUEUED");
});

// ── Licensing lifecycle: suspend / reactivate flips the tenant's control-plane status ─────────────

test("disable suspends the tenant, enable reactivates it (the subscription IS the license)", async () => {
  const { provider, calls } = makeProvider();
  const suspended = await provider.disable("Acme");
  assert.equal(suspended.accepted, true);
  assert.deepEqual(calls.setStatus.at(-1), { subdomain: "acme", status: "suspended" });

  const reactivated = await provider.enable("acme");
  assert.equal(reactivated.accepted, true);
  assert.deepEqual(calls.setStatus.at(-1), { subdomain: "acme", status: "active" });
});

test("disable/enable are inert when the control-plane is off", async () => {
  const { provider, calls } = makeProvider({ enabled: false });
  assert.equal((await provider.disable("acme")).accepted, false);
  assert.equal(calls.setStatus.length, 0);
});

// ── Suspended-tenant gate (authenticated dashboard/API access) ────────────────────────────────────

test("assertTenantActive blocks a suspended tenant but allows active / single-tenant fallback", () => {
  const withTenant = (tenant, fn) => runWithTenant({ tenant, prisma: {}, jwtSecrets: { access: "", refresh: "" } }, fn);

  // Suspended → refused (the JwtAuthGuard turns this into a 403 for every authed request).
  assert.throws(() => withTenant({ status: "suspended" }, () => assertTenantActive()), /suspended/i);
  // Active tenant, and single-tenant fallback (no tenant) → allowed.
  assert.doesNotThrow(() => withTenant({ status: "active" }, () => assertTenantActive()));
  assert.doesNotThrow(() => withTenant(null, () => assertTenantActive()));
  // Outside any request context → allowed (e.g. boot / cron).
  assert.doesNotThrow(() => assertTenantActive());
});
