import assert from "node:assert/strict";
import { test } from "node:test";
import { UnauthorizedException } from "@nestjs/common";
import { AuthService } from "../dist/modules/auth/auth.service.js";
import { UsersController } from "../dist/modules/users/users.controller.js";

test("emergency admin env login returns admin access token without DB session", async () => {
  const previous = emergencyEnv();
  const logs = [];
  const jwtCalls = [];
  process.env.EMERGENCY_ADMIN_EMAIL = "Owner@Example.test";
  process.env.EMERGENCY_ADMIN_PASSWORD = "temporary-super-secret";
  process.env.JWT_ACCESS_SECRET = "test-secret";

  const auth = new AuthService(
    { signAsync: async (payload, options) => {
      jwtCalls.push([payload, options]);
      return "emergency-jwt";
    } },
    fakeUsers({ logs })
  );

  try {
    const result = await auth.login({ email: " owner@example.test ", password: "temporary-super-secret", scope: "admin" }, "127.0.0.1", "node-test");

    assert.equal(result.accessToken, "emergency-jwt");
    assert.match(result.refreshToken, /^emergency-/);
    assert.deepEqual(result.user, { id: "emergency-admin", email: "owner@example.test", roles: ["admin"] });
    assert.equal(jwtCalls[0][0].sub, "emergency-admin");
    assert.deepEqual(jwtCalls[0][0].roles, ["admin"]);
    assert.equal(logs[0].action, "user.emergency_admin_login_succeeded");
    assert.equal(logs[0].metadata.email, "owner@example.test");
  } finally {
    restoreEmergencyEnv(previous);
  }
});

test("emergency admin env login rejects wrong password", async () => {
  const previous = emergencyEnv();
  process.env.EMERGENCY_ADMIN_EMAIL = "owner@example.test";
  process.env.EMERGENCY_ADMIN_PASSWORD = "temporary-super-secret";

  const auth = new AuthService({ signAsync: async () => "jwt" }, fakeUsers());

  try {
    await assert.rejects(
      auth.login({ email: "owner@example.test", password: "wrong-password", scope: "admin" }),
      (error) => error instanceof UnauthorizedException && error.message === "Invalid credentials"
    );
  } finally {
    restoreEmergencyEnv(previous);
  }
});

test("emergency admin login stays disabled when env is missing", async () => {
  const previous = emergencyEnv();
  delete process.env.EMERGENCY_ADMIN_EMAIL;
  delete process.env.EMERGENCY_ADMIN_PASSWORD;

  const auth = new AuthService({ signAsync: async () => "jwt" }, fakeUsers());

  try {
    await assert.rejects(
      auth.login({ email: "owner@example.test", password: "temporary-super-secret", scope: "admin" }),
      (error) => error instanceof UnauthorizedException && error.message === "Invalid credentials"
    );
  } finally {
    restoreEmergencyEnv(previous);
  }
});

test("emergency admin token can pass admin dashboard user lookup", async () => {
  let lookedUpId = "";
  const controller = new UsersController({
    getMe: async (id) => {
      lookedUpId = id;
      return null;
    }
  });

  const result = await controller.me({
    user: { email: "owner@example.test", roles: ["admin"], sub: "emergency-admin" }
  });

  assert.equal(lookedUpId, "");
  assert.deepEqual(result, { email: "owner@example.test", id: "emergency-admin", roles: ["admin"] });
});

function fakeUsers({ logs = [] } = {}) {
  return {
    createAuditLog: async (entry) => {
      logs.push(entry);
      return entry;
    },
    createRefreshSession: async () => {
      throw new Error("emergency login must not create refresh sessions");
    },
    findByEmail: async () => null
  };
}

function emergencyEnv() {
  return {
    email: process.env.EMERGENCY_ADMIN_EMAIL,
    jwtSecret: process.env.JWT_ACCESS_SECRET,
    password: process.env.EMERGENCY_ADMIN_PASSWORD
  };
}

function restoreEmergencyEnv(previous) {
  restore("EMERGENCY_ADMIN_EMAIL", previous.email);
  restore("EMERGENCY_ADMIN_PASSWORD", previous.password);
  restore("JWT_ACCESS_SECRET", previous.jwtSecret);
}

function restore(key, value) {
  if (value === undefined) {
    delete process.env[key];
    return;
  }
  process.env[key] = value;
}
