/**
 * Caddy on-demand-TLS `ask` endpoint (Phase 4.6d): only registered ACTIVE tenant hosts may get a cert,
 * so the edge never mints certificates for arbitrary hostnames pointed at its IP.
 *
 * Run with:  npm --workspace @teculiar/api run build && node --test test/tls-allowed.test.mjs
 */
import assert from "node:assert/strict";
import { test, before } from "node:test";

let TenancyController;

before(async () => {
  ({ TenancyController } = await import("../dist/tenancy/tenancy.controller.js"));
});

function controllerWith(activeHosts) {
  const controlPlane = { isActiveTenantHost: async (host) => activeHosts.includes(host.toLowerCase()) };
  return new TenancyController(controlPlane);
}

test("allows a registered active tenant host (Caddy issues the cert)", async () => {
  const controller = controllerWith(["admin.acmehost.com"]);
  assert.deepEqual(await controller.tlsAllowed("admin.acmehost.com"), { ok: true });
  // Caddy passes ?domain=; matching is case-insensitive.
  assert.deepEqual(await controller.tlsAllowed("ADMIN.Acmehost.com"), { ok: true });
});

test("rejects unknown, empty, or missing hosts (Caddy declines)", async () => {
  const controller = controllerWith(["admin.acmehost.com"]);
  await assert.rejects(() => controller.tlsAllowed("evil.attacker.com"));
  await assert.rejects(() => controller.tlsAllowed(""));
  await assert.rejects(() => controller.tlsAllowed(undefined, undefined));
});

test("also accepts the host passed as ?host= (fallback param)", async () => {
  const controller = controllerWith(["client.acmehost.com"]);
  assert.deepEqual(await controller.tlsAllowed(undefined, "client.acmehost.com"), { ok: true });
});
