/**
 * DNS-TXT domain-ownership verification (Phase 4.6f): candidate-name walk-up, token matching with an
 * injected resolver, and the verify-domain endpoint flow (pending → active only on proof).
 *
 * Run with:  npm --workspace @teculiar/api run build && node --test test/domain-verification.test.mjs
 */
import assert from "node:assert/strict";
import { test, before } from "node:test";

let verificationCandidates;
let hasVerificationToken;
let TenancyController;

before(async () => {
  ({ verificationCandidates, hasVerificationToken } = await import("../dist/tenancy/domain-verification.js"));
  ({ TenancyController } = await import("../dist/tenancy/tenancy.controller.js"));
});

test("verificationCandidates walks up from the host to the registrable domain", () => {
  assert.deepEqual(verificationCandidates("admin.acmehost.com"), [
    "_teculiar-verify.admin.acmehost.com",
    "_teculiar-verify.acmehost.com"
  ]);
  assert.deepEqual(verificationCandidates("acmehost.com"), ["_teculiar-verify.acmehost.com"]);
  // One TXT at the apex covers deep subdomains too.
  assert.deepEqual(verificationCandidates("client.shop.acmehost.co.uk").at(-1), "_teculiar-verify.co.uk");
});

test("hasVerificationToken matches on any candidate and joins chunked TXT values", async () => {
  const token = "tok-123";
  const zone = {
    "_teculiar-verify.acmehost.com": [["tok-", "123"]] // chunked long value
  };
  const resolver = async (name) => {
    if (zone[name]) return zone[name];
    const err = new Error("ENOTFOUND");
    throw err;
  };
  assert.equal(await hasVerificationToken("admin.acmehost.com", token, resolver), true, "apex TXT covers the subdomain");
  assert.equal(await hasVerificationToken("admin.other.com", token, resolver), false, "no record → no proof");
  assert.equal(await hasVerificationToken("admin.acmehost.com", "wrong", resolver), false, "wrong token rejected");
});

function controllerWith(domainRow, resolver) {
  const activated = [];
  const controlPlane = {
    findDomainByHost: async () => domainRow,
    activateDomain: async (host) => {
      activated.push(host);
      return { ...domainRow, status: "active" };
    },
    isActiveTenantHost: async () => false
  };
  return { controller: new TenancyController(controlPlane, resolver), activated };
}

test("verify-domain: flips pending → active only when the TXT proof exists", async () => {
  const row = { host: "admin.acmehost.com", status: "pending", verifyToken: "tok-9" };
  const good = async (name) => (name === "_teculiar-verify.acmehost.com" ? [["tok-9"]] : (() => { throw new Error("ENOTFOUND"); })());

  const { controller, activated } = controllerWith(row, good);
  assert.deepEqual(await controller.verifyDomain("admin.acmehost.com"), { ok: true, status: "active" });
  assert.deepEqual(activated, ["admin.acmehost.com"]);
});

test("verify-domain: no proof → ok:false with the exact TXT record to publish; nothing activated", async () => {
  const row = { host: "admin.acmehost.com", status: "pending", verifyToken: "tok-9" };
  const none = async () => {
    throw new Error("ENOTFOUND");
  };
  const { controller, activated } = controllerWith(row, none);
  const result = await controller.verifyDomain("admin.acmehost.com");
  assert.equal(result.ok, false);
  assert.equal(result.status, "pending");
  assert.match(result.txtRecord, /_teculiar-verify\.admin\.acmehost\.com TXT "tok-9"/);
  assert.deepEqual(activated, []);
});

test("verify-domain: already-active is idempotent; unknown host 404s; missing host 400s", async () => {
  const active = controllerWith({ host: "a.b.com", status: "active", verifyToken: null }, async () => []);
  assert.deepEqual(await active.controller.verifyDomain("a.b.com"), { ok: true, status: "active" });
  assert.deepEqual(active.activated, []);

  const missing = controllerWith(null, async () => []);
  await assert.rejects(() => missing.controller.verifyDomain("nope.example.com"));
  await assert.rejects(() => missing.controller.verifyDomain(""));
});
