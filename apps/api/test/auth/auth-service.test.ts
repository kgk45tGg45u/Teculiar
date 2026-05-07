import { strict as assert } from "node:assert";
import test from "node:test";
import { hash } from "bcryptjs";
import { AuthService } from "../../src/modules/auth/auth.service";

test("login returns tokens plus current user roles", async () => {
  const passwordHash = await hash("StrongPass1!", 4);
  const users = {
    createRefreshSession: async () => ({ id: "session_1" }),
    findByEmail: async () => ({
      email: "admin@example.com",
      id: "user_admin",
      passwordHash,
      totpEnabled: false,
      userRoles: [{ role: { slug: "admin" } }]
    })
  };
  const jwt = {
    signAsync: async () => "access_123"
  };
  const auth = new AuthService(jwt as never, users as never);

  const result = await auth.login({ email: "admin@example.com", password: "StrongPass1!" });

  assert.equal(result.accessToken, "access_123");
  assert.equal(result.tokenType, "Bearer");
  assert.equal(result.user.email, "admin@example.com");
  assert.deepEqual(result.user.roles, ["admin"]);
});

test("bootstrapAdmin creates the first admin and then closes", async () => {
  const events: string[] = [];
  const users = {
    adminExists: async () => false,
    createUserWithRole: async (_input: unknown, role: string) => {
      events.push(role);
      return { email: "owner@example.com", id: "admin_1" };
    },
    createRefreshSession: async () => ({ id: "session_1" }),
    findByEmail: async () => null
  };
  const jwt = {
    signAsync: async () => "access_admin"
  };
  const auth = new AuthService(jwt as never, users as never);

  const result = await auth.bootstrapAdmin({ email: "owner@example.com", name: "Owner", password: "StrongPass1!" });

  assert.equal(result.user.email, "owner@example.com");
  assert.deepEqual(result.user.roles, ["admin"]);
  assert.deepEqual(events, ["admin"]);
});
