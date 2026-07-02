import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";

test("admin login does not replace the client portal token", async () => {
  const api = await readFile(new URL("../../../packages/web-core/src/lib/api.ts", import.meta.url), "utf8");
  const loginForm = await readFile(new URL("../../web/components/auth/login-form.tsx", import.meta.url), "utf8");
  const serverApi = await readFile(new URL("../../../packages/web-core/src/lib/server-api.ts", import.meta.url), "utf8");
  const middleware = await readFile(new URL("../../web/middleware.ts", import.meta.url), "utf8");
  const clientDashboard = await readFile(new URL("../../web/components/portal/client-dashboard.tsx", import.meta.url), "utf8");

  assert.match(api, /CLIENT_AUTH_COOKIE = "dezhost_client_access_token"/);
  assert.match(api, /ADMIN_AUTH_COOKIE = "dezhost_admin_access_token"/);
  assert.match(loginForm, /storeAuth\(payload as AuthPayload, admin \? "admin" : "client"\)/);
  assert.match(serverApi, /ADMIN_AUTH_COOKIE/);
  assert.match(middleware, /CLIENT_AUTH_COOKIE/);
  assert.match(middleware, /ADMIN_AUTH_COOKIE/);
  assert.match(clientDashboard, /authHeaders\("client"\)/);
});

test("client-facing service and invoice lists stay scoped to the caller", async () => {
  const productsController = await readFile(new URL("../src/modules/products/products.controller.ts", import.meta.url), "utf8");
  const billingController = await readFile(new URL("../src/modules/billing/billing.controller.ts", import.meta.url), "utf8");

  assert.doesNotMatch(productsController, /canSeeAll[\s\S]*listServicesFresh\(userId\)/);
  assert.match(productsController, /const userId = request\.user\.sub/);
  assert.doesNotMatch(billingController, /staff \? userId : request\.user\.sub/);
  assert.match(billingController, /userId: request\.user\.sub/);
});

test("client add funds form is always available", async () => {
  const clientDashboard = await readFile(new URL("../../web/components/portal/client-dashboard.tsx", import.meta.url), "utf8");

  assert.doesNotMatch(clientDashboard, /You must have at least one active order before adding funds\./);
  assert.doesNotMatch(clientDashboard, /activeServices \?/);
  assert.match(clientDashboard, /<Button icon=\{CreditCard\} type="submit">Add Funds<\/Button>/);
});
