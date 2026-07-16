import assert from "node:assert/strict";
import { test } from "node:test";
import { AgentWriteBlockGuard } from "../dist/common/guards/agent-write-block.guard.js";

function contextFor({ method, path, roles }) {
  const headers = roles ? { authorization: "Bearer stub-token" } : {};
  const request = { method, path, headers };
  return { switchToHttp: () => ({ getRequest: () => request }) };
}

function guardWithRoles(roles) {
  return new AgentWriteBlockGuard({ verify: () => ({ roles }) });
}

test("agent is blocked from writing to a customer-linked resource", () => {
  const guard = guardWithRoles(["agent"]);
  assert.throws(() => guard.canActivate(contextFor({ method: "POST", path: "/api/v1/users", roles: ["agent"] })), /read-only/);
  assert.throws(() => guard.canActivate(contextFor({ method: "PATCH", path: "/api/v1/orders/123/status", roles: ["agent"] })), /read-only/);
  assert.throws(() => guard.canActivate(contextFor({ method: "DELETE", path: "/api/v1/billing/invoices/1", roles: ["agent"] })), /read-only/);
  assert.throws(() => guard.canActivate(contextFor({ method: "POST", path: "/api/v1/tickets/1/replies", roles: ["agent"] })), /read-only/);
  assert.throws(() => guard.canActivate(contextFor({ method: "PATCH", path: "/api/v1/admin/dev/services/1/status", roles: ["agent"] })), /read-only/);
  assert.throws(() => guard.canActivate(contextFor({ method: "POST", path: "/api/v1/services/1/restart", roles: ["agent"] })), /read-only/);
  assert.throws(() => guard.canActivate(contextFor({ method: "POST", path: "/api/v1/services/1/hosting-panel", roles: ["agent"] })), /read-only/);
  assert.throws(() => guard.canActivate(contextFor({ method: "PATCH", path: "/api/v1/admin/dev/emails", roles: ["agent"] })), /read-only/);
  assert.throws(() => guard.canActivate(contextFor({ method: "POST", path: "/api/v1/admin/dev/emails/test", roles: ["agent"] })), /read-only/);
  assert.throws(() => guard.canActivate(contextFor({ method: "POST", path: "/api/v1/cron/admin/run", roles: ["agent"] })), /read-only/);
});

test("agent may still GET a customer-linked resource", () => {
  const guard = guardWithRoles(["agent"]);
  assert.equal(guard.canActivate(contextFor({ method: "GET", path: "/api/v1/users", roles: ["agent"] })), true);
  assert.equal(guard.canActivate(contextFor({ method: "GET", path: "/api/v1/services/1", roles: ["agent"] })), true);
  assert.equal(guard.canActivate(contextFor({ method: "GET", path: "/api/v1/admin/dev/emails", roles: ["agent"] })), true);
  assert.equal(guard.canActivate(contextFor({ method: "GET", path: "/api/v1/admin/dev/logs", roles: ["agent"] })), true);
});

test("agent may write to a non-customer-linked resource (e.g. CMS/products)", () => {
  const guard = guardWithRoles(["agent"]);
  assert.equal(guard.canActivate(contextFor({ method: "POST", path: "/api/v1/products", roles: ["agent"] })), true);
  assert.equal(guard.canActivate(contextFor({ method: "PATCH", path: "/api/v1/cms/pages/1", roles: ["agent"] })), true);
});

test("non-agent roles are never blocked by this guard", () => {
  const guard = guardWithRoles(["admin"]);
  assert.equal(guard.canActivate(contextFor({ method: "POST", path: "/api/v1/users", roles: ["admin"] })), true);
  assert.equal(guard.canActivate(contextFor({ method: "DELETE", path: "/api/v1/tickets/1", roles: ["admin"] })), true);
});

test("requests with no/invalid token are left for JwtAuthGuard to reject", () => {
  const guard = new AgentWriteBlockGuard({
    verify: () => {
      throw new Error("invalid token");
    }
  });
  assert.equal(guard.canActivate(contextFor({ method: "POST", path: "/api/v1/users" })), true);
  assert.equal(
    guard.canActivate({ switchToHttp: () => ({ getRequest: () => ({ method: "POST", path: "/api/v1/users", headers: { authorization: "Bearer x" } }) }) }),
    true
  );
});
