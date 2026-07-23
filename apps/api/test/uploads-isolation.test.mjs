import assert from "node:assert/strict";
import { test } from "node:test";
import { uploadPathAllowed, tenantSubdomainForHost } from "../dist/common/uploads-guard.js";

// Phase 8.2 — multi-tenant upload isolation. A scoped /uploads/<tenant>/… file is served only to its
// owning tenant; legacy flat paths stay readable; the owning tenant is resolved from the request host.

test("scoped uploads are readable only by their owning tenant", () => {
  assert.equal(uploadPathAllowed("/dezhost/tickets/1-abc.png", "dezhost"), true);
  // Tenant B cannot read tenant A's scoped file.
  assert.equal(uploadPathAllowed("/dezhost/tickets/1-abc.png", "teculiar"), false);
  // No resolved tenant → deny scoped paths.
  assert.equal(uploadPathAllowed("/dezhost/tickets/1-abc.png", null), false);
  // Case-insensitive scope match (host + subdomain are lowercased upstream).
  assert.equal(uploadPathAllowed("/Dezhost/avatars/x.png", "dezhost"), true);
});

test("legacy flat uploads (2 segments, pre-8.2) stay world-readable", () => {
  assert.equal(uploadPathAllowed("/tickets/1-abc.png", null), true);
  assert.equal(uploadPathAllowed("/avatars/x.png", "teculiar"), true);
});

test("host resolution prefers an ACTIVE custom-domain match, else the subdomain heuristic", async () => {
  const controlPlane = {
    enabled: true,
    async findDomainByHost(host) {
      if (host === "dezhost.com") {
        return { status: "active", tenant: { subdomain: "Dezhost" } };
      }
      return null;
    }
  };
  // Custom apex → owning tenant subdomain (lowercased).
  assert.equal(await tenantSubdomainForHost("dezhost.com", controlPlane), "dezhost");
  // Unregistered <sub>.teculiar.net → first-label heuristic.
  assert.equal(await tenantSubdomainForHost("acme.teculiar.net", controlPlane), "acme");
  // Apex / no tenant.
  assert.equal(await tenantSubdomainForHost("teculiar.net", controlPlane), null);
  assert.equal(await tenantSubdomainForHost(undefined, controlPlane), null);
});

test("single-tenant fallback (control-plane disabled) resolves via the host heuristic only", async () => {
  assert.equal(await tenantSubdomainForHost("t1.localhost", { enabled: false }), "t1");
  assert.equal(await tenantSubdomainForHost("t1.localhost", null), "t1");
});
