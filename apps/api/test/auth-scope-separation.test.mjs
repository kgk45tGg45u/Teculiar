import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import { hash } from "bcryptjs";
import { AuthService } from "../dist/modules/auth/auth.service.js";

// Admin (STAFF) and client (CLIENT) portals are separate credential worlds: the same email can
// hold one independent account per scope, and a login only ever sees its own world.

const password = "correct-horse-battery";

function usersStub(accounts) {
  const lookups = [];
  return {
    lookups,
    findByEmail: async (email, scope) => {
      lookups.push([email, scope]);
      return accounts.find((account) => account.email === email && account.scope === scope) ?? null;
    },
    findAuthById: async (id) => accounts.find((account) => account.id === id) ?? null,
    createAuditLog: async () => ({}),
    createRefreshSession: async () => ({}),
    createClient: async (input) => ({ id: "new-client", email: input.email, name: input.name }),
    adminExists: async () => true
  };
}

function service(users) {
  return new AuthService({ signAsync: async () => "signed-jwt" }, users);
}

async function account(overrides) {
  return {
    id: "user-1",
    passwordHash: await hash(password, 4),
    totpEnabled: false,
    totpSecret: null,
    userRoles: [{ role: { slug: "client" } }],
    scope: "CLIENT",
    ...overrides
  };
}

test("admin credentials are rejected on the client portal login", async () => {
  const admin = await account({ email: "boss@example.com", scope: "STAFF", userRoles: [{ role: { slug: "admin" } }] });
  const users = usersStub([admin]);
  const auth = service(users);

  await assert.rejects(
    () => auth.login({ email: admin.email, password, scope: "client" }),
    /Invalid credentials/
  );
  assert.deepEqual(users.lookups, [[admin.email, "CLIENT"]], "client login must only search the CLIENT world");

  const result = await auth.login({ email: admin.email, password, scope: "admin" });
  assert.equal(result.user.roles.includes("admin"), true);
});

test("client credentials are rejected on the admin portal login", async () => {
  const client = await account({ email: "customer@example.com" });
  const users = usersStub([client]);
  const auth = service(users);

  await assert.rejects(
    () => auth.login({ email: client.email, password, scope: "admin" }),
    /Invalid credentials/
  );

  const result = await auth.login({ email: client.email, password, scope: "client" });
  assert.equal(result.user.roles.includes("client"), true);
});

test("omitted scope defaults to the client world (storefront checkout compatibility)", async () => {
  const admin = await account({ email: "boss@example.com", scope: "STAFF", userRoles: [{ role: { slug: "admin" } }] });
  const users = usersStub([admin]);
  const auth = service(users);

  await assert.rejects(() => auth.login({ email: admin.email, password }), /Invalid credentials/);
  assert.deepEqual(users.lookups, [[admin.email, "CLIENT"]]);
});

test("an email registered as admin can sign up as an independent client", async () => {
  const admin = await account({ email: "boss@example.com", scope: "STAFF", userRoles: [{ role: { slug: "admin" } }] });
  const users = usersStub([admin]);
  const auth = service(users);

  const result = await auth.register({ email: admin.email, name: "Same Email, Client World", password: "long-enough-password" });
  assert.equal(result.user.email, admin.email);
  assert.deepEqual(result.user.roles, ["client"]);
  assert.deepEqual(users.lookups, [[admin.email, "CLIENT"]], "signup must only check the CLIENT world");
});

test("emergency admin login only answers on the admin portal", async () => {
  process.env.EMERGENCY_ADMIN_EMAIL = "emergency@example.com";
  process.env.EMERGENCY_ADMIN_PASSWORD = "emergency-password";
  try {
    const users = usersStub([]);
    const auth = service(users);
    await assert.rejects(
      () => auth.login({ email: "emergency@example.com", password: "emergency-password", scope: "client" }),
      /Invalid credentials/
    );
    const result = await auth.login({ email: "emergency@example.com", password: "emergency-password", scope: "admin" });
    assert.equal(result.user.id, "emergency-admin");
  } finally {
    delete process.env.EMERGENCY_ADMIN_EMAIL;
    delete process.env.EMERGENCY_ADMIN_PASSWORD;
  }
});

test("both dashboards send their scope with login and password-reset requests", async () => {
  const form = await readFile(new URL("../../web/components/auth/login-form.tsx", import.meta.url), "utf8");
  assert.match(form, /scope: admin \? "admin" : "client"/);

  const schema = await readFile(new URL("../../../prisma/schema.prisma", import.meta.url), "utf8");
  assert.match(schema, /@@unique\(\[email, scope\]\)/);
});
