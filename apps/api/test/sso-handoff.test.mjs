/**
 * Cross-origin SSO handoff (Phase 4.6e): one-time-code store semantics + the exchange/redeem flow
 * (PKCE binding, target-host binding, tenant binding, single-use).
 *
 * Run with:  npm --workspace @teculiar/api run build && node --test test/sso-handoff.test.mjs
 */
import assert from "node:assert/strict";
import { test, before } from "node:test";

let SsoHandoffStore;
let sha256Base64Url;
let originHostname;
let AuthService;
let runWithTenant;

before(async () => {
  ({ SsoHandoffStore, sha256Base64Url, originHostname } = await import("../dist/modules/auth/sso-handoff.js"));
  ({ AuthService } = await import("../dist/modules/auth/auth.service.js"));
  ({ runWithTenant } = await import("../dist/tenancy/tenant-context.js"));
});

test("store: codes are single-use and expire", () => {
  const store = new SsoHandoffStore();
  const grant = { userId: "u1", email: "a@b.c", tenantId: "t1", targetHost: "client.acme.com", codeChallenge: "x" };
  const code = store.mint(grant, 1000);
  assert.ok(code.length > 20);
  assert.equal(store.consume("wrong", 1001), null);
  assert.equal(store.consume(code, 1001)?.userId, "u1");
  assert.equal(store.consume(code, 1002), null, "second consume is refused (burned)");
  const expired = store.mint(grant, 1000);
  assert.equal(store.consume(expired, 40_000), null, "past TTL is refused");
});

test("originHostname parses origins, rejects junk", () => {
  assert.equal(originHostname("https://client.acme.com"), "client.acme.com");
  assert.equal(originHostname("https://Client.ACME.com/path?q=1"), "client.acme.com");
  assert.equal(originHostname("not a url"), null);
});

function makeService({ tenantDomains = {}, users = {} } = {}) {
  const audit = [];
  const sessions = [];
  const usersRepo = {
    findByEmail: async (email) => users[email] ?? null,
    // Redeem looks users up by id now — email is only unique per scope (admin/client separation).
    findAuthById: async (id) => Object.values(users).find((user) => user.id === id) ?? null,
    createAuditLog: async (entry) => audit.push(entry),
    createRefreshSession: async (s) => sessions.push(s)
  };
  const jwt = { signAsync: async (payload) => `signed:${payload.sub}` };
  const controlPlane = {
    findDomainByHost: async (host) => tenantDomains[host] ?? null
  };
  const svc = new AuthService(jwt, usersRepo, undefined, controlPlane);
  return { svc, audit, sessions };
}

const TENANT = { id: "t-dez", subdomain: "dezhost" };
const ctx = { tenant: TENANT, prisma: {}, jwtSecrets: { access: "s", refresh: "s" } };
const inTenant = (fn) => runWithTenant(ctx, fn);

test("exchange: allows the tenant's own hosts, rejects foreign/invalid ones", async () => {
  const { svc } = makeService({
    tenantDomains: {
      "client.acme.com": { status: "active", tenantId: "t-dez" },
      "client.other.com": { status: "active", tenantId: "t-OTHER" },
      "pending.acme.com": { status: "pending", tenantId: "t-dez" }
    }
  });
  const user = { id: "u1", email: "a@b.c", roles: ["client"] };
  const challenge = sha256Base64Url("verifier-123");

  await inTenant(async () => {
    const ok = await svc.ssoExchange(user, "https://client.acme.com", challenge);
    assert.ok(ok.code && ok.expiresIn === 30);
    const sub = await svc.ssoExchange(user, "https://dezhost.teculiar.net", challenge);
    assert.ok(sub.code, "the tenant's own *.teculiar.net host is always allowed");
    await assert.rejects(() => svc.ssoExchange(user, "https://client.other.com", challenge), /does not belong/);
    await assert.rejects(() => svc.ssoExchange(user, "https://pending.acme.com", challenge), /does not belong/);
    await assert.rejects(() => svc.ssoExchange(user, "junk", challenge));
    await assert.rejects(() => svc.ssoExchange({ ...user, id: "emergency-admin" }, "https://client.acme.com", challenge));
  });
});

test("redeem: full happy path + every binding is enforced", async () => {
  const dbUser = {
    id: "u1",
    email: "a@b.c",
    userRoles: [{ role: { slug: "client" } }]
  };
  const { svc, audit } = makeService({
    tenantDomains: { "client.acme.com": { status: "active", tenantId: "t-dez" } },
    users: { "a@b.c": dbUser }
  });
  const user = { id: "u1", email: "a@b.c", roles: ["client"] };
  const verifier = "verifier-123";
  const challenge = sha256Base64Url(verifier);

  await inTenant(async () => {
    // happy path
    const { code } = await svc.ssoExchange(user, "https://client.acme.com", challenge);
    const payload = await svc.ssoRedeem(code, verifier, "client.acme.com:443");
    assert.equal(payload.user.id, "u1");
    assert.ok(payload.accessToken && payload.refreshToken);
    assert.equal(audit.at(-1)?.action, "user.sso_handoff_redeemed");

    // single-use: same code again fails
    await assert.rejects(() => svc.ssoRedeem(code, verifier, "client.acme.com"), /Invalid or expired/);

    // wrong verifier
    const two = await svc.ssoExchange(user, "https://client.acme.com", challenge);
    await assert.rejects(() => svc.ssoRedeem(two.code, "wrong-verifier", "client.acme.com"), /Verification failed/);

    // wrong host
    const three = await svc.ssoExchange(user, "https://client.acme.com", challenge);
    await assert.rejects(() => svc.ssoRedeem(three.code, verifier, "evil.com"), /different origin/);
  });

  // tenant mismatch: redeem outside the tenant context (fallback/no tenant)
  const four = await inTenant(() => svc.ssoExchange(user, "https://client.acme.com", challenge));
  await assert.rejects(() => svc.ssoRedeem(four.code, verifier, "client.acme.com"), /Tenant mismatch/);
});
