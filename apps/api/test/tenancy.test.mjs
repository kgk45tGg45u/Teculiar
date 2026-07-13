/**
 * Multi-tenant core (Phase 4.1) — the tenant choke point + host resolution.
 *
 * The crux of the SaaS separation is that a request routed to tenant A must NEVER
 * read or write tenant B's database. These tests prove the choke point in isolation:
 *  - the tenant-aware Prisma proxy forwards to the AsyncLocalStorage-scoped client;
 *  - interleaved concurrent requests keep their own tenant client (no ALS bleed);
 *  - outside any request it falls back to the single-tenant default client;
 *  - JWT secrets follow the tenant context, with an env fallback;
 *  - Host → subdomain resolution matches *.teculiar.net / *.localhost / apex rules.
 *
 * Run with:  npm --workspace @teculiar/api run build && node --test test/tenancy.test.mjs
 */

import assert from "node:assert/strict";
import { test, before } from "node:test";

let createTenantAwarePrisma;
let runWithTenant;
let getTenantContext;
let subdomainFromHost;
let hostnameOf;
let accessSecret;
let refreshSecret;

before(async () => {
  const prismaSvc = await import("../dist/modules/prisma/prisma.service.js");
  const ctx = await import("../dist/tenancy/tenant-context.js");
  const mw = await import("../dist/tenancy/tenant.middleware.js");
  const jwt = await import("../dist/tenancy/jwt-secrets.js");
  const urls = await import("../dist/tenancy/tenant-urls.js");
  createTenantAwarePrisma = prismaSvc.createTenantAwarePrisma;
  runWithTenant = ctx.runWithTenant;
  getTenantContext = ctx.getTenantContext;
  subdomainFromHost = mw.subdomainFromHost;
  hostnameOf = mw.hostnameOf;
  accessSecret = jwt.accessSecret;
  refreshSecret = jwt.refreshSecret;
  tenantWebBaseUrl = urls.tenantWebBaseUrl;
});

let tenantWebBaseUrl;

// A fake Prisma client that only carries an identifying marker + a query method that
// records which client it ran against, so we can observe exactly where a call landed.
function fakeClient(name, sink) {
  return {
    marker: name,
    systemSetting: {
      async findMany() {
        sink.push(name);
        return [{ key: "who", value: name }];
      }
    }
  };
}

function tick(ms = 5) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

test("proxy routes each request to its own tenant client (no cross-tenant bleed)", async () => {
  const sink = [];
  const clientA = fakeClient("A", sink);
  const clientB = fakeClient("B", sink);
  const defaultClient = fakeClient("DEFAULT", sink);
  const registry = { defaultClient: () => defaultClient };
  const prisma = createTenantAwarePrisma(registry);

  const ctx = (client) => ({ tenant: null, prisma: client, jwtSecrets: { access: "", refresh: "" } });

  const inA = runWithTenant(ctx(clientA), () => prisma.marker);
  const inB = runWithTenant(ctx(clientB), () => prisma.marker);
  assert.equal(inA, "A");
  assert.equal(inB, "B");

  // A query issued inside tenant A's context must run against A's client only.
  await runWithTenant(ctx(clientA), () => prisma.systemSetting.findMany());
  assert.deepEqual(sink, ["A"], "the query hit only tenant A's database");
});

test("interleaved concurrent requests keep their own tenant client", async () => {
  const sink = [];
  const clientA = fakeClient("A", sink);
  const clientB = fakeClient("B", sink);
  const registry = { defaultClient: () => fakeClient("DEFAULT", sink) };
  const prisma = createTenantAwarePrisma(registry);
  const ctx = (client) => ({ tenant: null, prisma: client, jwtSecrets: { access: "", refresh: "" } });

  const [a, b] = await Promise.all([
    runWithTenant(ctx(clientA), async () => {
      await tick(8);
      return prisma.marker;
    }),
    runWithTenant(ctx(clientB), async () => {
      await tick(2);
      return prisma.marker;
    })
  ]);
  assert.equal(a, "A", "tenant A context survived the await");
  assert.equal(b, "B", "tenant B context survived the await");
});

test("outside a request the proxy falls back to the default (single-tenant) client", () => {
  const sink = [];
  const defaultClient = fakeClient("DEFAULT", sink);
  const prisma = createTenantAwarePrisma({ defaultClient: () => defaultClient });
  assert.equal(getTenantContext(), undefined);
  assert.equal(prisma.marker, "DEFAULT");
});

test("JWT secrets follow the tenant context, with an env fallback", () => {
  process.env.JWT_ACCESS_SECRET = "env-access";
  process.env.JWT_REFRESH_SECRET = "env-refresh";
  assert.equal(accessSecret(), "env-access");
  assert.equal(refreshSecret(), "env-refresh");

  const ctx = { tenant: null, prisma: {}, jwtSecrets: { access: "tenant-access", refresh: "tenant-refresh" } };
  runWithTenant(ctx, () => {
    assert.equal(accessSecret(), "tenant-access");
    assert.equal(refreshSecret(), "tenant-refresh");
  });
});

test("Host → subdomain resolution", () => {
  assert.equal(subdomainFromHost("dezhost.teculiar.net"), "dezhost");
  assert.equal(subdomainFromHost("user0003.teculiar.net:443"), "user0003");
  assert.equal(subdomainFromHost("t1.localhost"), "t1");
  assert.equal(subdomainFromHost("t2.localhost:4000"), "t2");
  assert.equal(subdomainFromHost("teculiar.net"), null, "apex has no tenant");
  assert.equal(subdomainFromHost("www.teculiar.net"), null, "www is not a tenant");
  assert.equal(subdomainFromHost("localhost"), null);
  assert.equal(subdomainFromHost(undefined), null);
  // A tenant's OWN domain is NOT resolvable by the first-label heuristic — it needs a TenantDomain
  // row (Phase 4.6). This is exactly the gap the full-host resolver closes.
  assert.equal(subdomainFromHost("dezhost.com"), null, "custom apex domain is not a *.teculiar.net subdomain");
});

test("tenantWebBaseUrl: tenant's white-label base in context, env fallback outside (Phase 4.6)", () => {
  process.env.PUBLIC_WEB_URL = "https://www.dezhost.com";
  // No tenant context → single-tenant env base (today's behaviour, unchanged).
  assert.equal(tenantWebBaseUrl(), "https://www.dezhost.com");
  // Inside a tenant context → that tenant's registered white-label root.
  const ctx = { tenant: null, prisma: {}, jwtSecrets: { access: "", refresh: "" }, webBaseUrl: "https://dezhost.com" };
  runWithTenant(ctx, () => {
    assert.equal(tenantWebBaseUrl(), "https://dezhost.com");
    assert.equal(`${tenantWebBaseUrl()}/reset-password`, "https://dezhost.com/reset-password");
  });
  // Back outside the context → env base again (no bleed).
  assert.equal(tenantWebBaseUrl(), "https://www.dezhost.com");
});

test("hostnameOf normalizes a Host header (strip port, lowercase)", () => {
  assert.equal(hostnameOf("Dezhost.com:443"), "dezhost.com");
  assert.equal(hostnameOf("client.acmehost.com"), "client.acmehost.com");
  assert.equal(hostnameOf("ADMIN.Acme.COM:3010"), "admin.acme.com");
  assert.equal(hostnameOf(""), null);
  assert.equal(hostnameOf(undefined), null);
});
