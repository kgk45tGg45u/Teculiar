/**
 * Per-surface link building (Phase 2.3): tenantSurfaceOrigin/tenantSurfaceUrl/tenantClientUrl
 * pick the dedicated admin./client. origin when the tenant has one, else fall back to the
 * apex-path form — byte-for-byte the historical links.
 *
 * Run with:  npm --workspace @teculiar/api run build && node --test test/tenant-surface-urls.test.mjs
 */
import assert from "node:assert/strict";
import { test, before } from "node:test";

let urls;
let runWithTenant;

before(async () => {
  urls = await import("../dist/tenancy/tenant-urls.js");
  ({ runWithTenant } = await import("../dist/tenancy/tenant-context.js"));
});

const baseCtx = () => ({
  tenant: null,
  prisma: {},
  jwtSecrets: { access: "a", refresh: "r" },
  webBaseUrl: "https://dezhost.com"
});

test("apex-path tenant (no dedicated hosts): historical /client links, apex origin for both scopes", () => {
  runWithTenant({ ...baseCtx(), surfaceBaseUrls: { admin: null, client: null } }, () => {
    assert.equal(urls.tenantClientUrl("/invoices/42"), "https://dezhost.com/client/invoices/42");
    assert.equal(urls.tenantClientUrl(), "https://dezhost.com/client");
    assert.equal(urls.tenantSurfaceUrl("admin", "/settings"), "https://dezhost.com/admin/settings");
    assert.equal(urls.tenantSurfaceOrigin("client"), "https://dezhost.com");
    assert.equal(urls.tenantSurfaceOrigin("admin"), "https://dezhost.com");
  });
});

test("dedicated per-surface hosts: clean URLs on the surface origin", () => {
  const surfaceBaseUrls = { admin: "https://admin.dezhost.com", client: "https://client.dezhost.com" };
  runWithTenant({ ...baseCtx(), surfaceBaseUrls }, () => {
    assert.equal(urls.tenantClientUrl("/invoices/42"), "https://client.dezhost.com/invoices/42");
    assert.equal(urls.tenantClientUrl(), "https://client.dezhost.com");
    assert.equal(urls.tenantSurfaceUrl("admin", "/settings"), "https://admin.dezhost.com/settings");
    // Root-level pages (reset-password) only swap the ORIGIN.
    assert.equal(urls.tenantSurfaceOrigin("client"), "https://client.dezhost.com");
    assert.equal(urls.tenantSurfaceOrigin("admin"), "https://admin.dezhost.com");
  });
});

test("mixed: only a client host registered — admin stays on the apex path", () => {
  runWithTenant({ ...baseCtx(), surfaceBaseUrls: { admin: null, client: "https://portal.acme.com" } }, () => {
    assert.equal(urls.tenantClientUrl("/tickets/7"), "https://portal.acme.com/tickets/7");
    assert.equal(urls.tenantSurfaceUrl("admin", ""), "https://dezhost.com/admin");
    assert.equal(urls.tenantSurfaceOrigin("admin"), "https://dezhost.com");
  });
});

test("no tenant context (single-tenant fallback): env base + section segment", () => {
  process.env.PUBLIC_WEB_URL = "https://single.example";
  try {
    assert.equal(urls.tenantClientUrl("/domains"), "https://single.example/client/domains");
    assert.equal(urls.tenantSurfaceOrigin("client"), "https://single.example");
  } finally {
    delete process.env.PUBLIC_WEB_URL;
  }
});
