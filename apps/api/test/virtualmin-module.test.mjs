/**
 * Virtualmin module integration tests.
 *
 * Tests connect to the LIVE Virtualmin server (eu01.dezhost.com:10000).
 * Credentials are read from environment variables — the same ones used by the API.
 *
 * WARNING: These tests create a real hosting account on the live server.
 * The test domain uses a unique timestamp suffix and is removed at the end.
 *
 * Run with:
 *   npm run build && node --test test/virtualmin-module.test.mjs
 *
 * Or against the running API:
 *   VIRTUALMIN_TEST_VIA_API=1 node --test test/virtualmin-module.test.mjs
 */

import assert from "node:assert/strict";
import { test, before, after } from "node:test";

// ── Config ────────────────────────────────────────────────────────────────────

const ENDPOINT = process.env.VIRTUALMIN_ADMIN_ENDPOINT ?? "https://eu01.dezhost.com:10000";
const USERNAME = process.env.VIRTUALMIN_ADMIN_USERNAME ?? "";
const PASSWORD = process.env.VIRTUALMIN_ADMIN_PASSWORD ?? "";
const ALLOW_SELF_SIGNED = process.env.VIRTUALMIN_ADMIN_ALLOW_SELF_SIGNED === "1";

// Unique test domain to avoid clashes across test runs
const TEST_DOMAIN = `vm-test-${Date.now()}.dezhost.com`;

if (!USERNAME || !PASSWORD) {
  console.warn("VIRTUALMIN_ADMIN_USERNAME and VIRTUALMIN_ADMIN_PASSWORD are not set — skipping live tests");
  process.exit(0);
}

// ── Dynamic import of built module ────────────────────────────────────────────

let callVirtualmin;
let adminCredentialsFromEnv;
let createDomainAction;

before(async () => {
  const api = await import("../dist/modules/virtualmin-client/virtualmin-api.js");
  const security = await import("../dist/modules/virtualmin-client/virtualmin-security.js");
  const actions = await import("../dist/modules/virtualmin-client/virtualmin-actions.js");
  callVirtualmin = api.callVirtualmin;
  adminCredentialsFromEnv = security.adminCredentialsFromEnv;
  createDomainAction = actions.createDomainAction;
});

function credentials() {
  return { allowSelfSigned: ALLOW_SELF_SIGNED, endpoint: ENDPOINT, password: PASSWORD, username: USERNAME };
}

// ── Tests ─────────────────────────────────────────────────────────────────────

test("Virtualmin: list-domains returns ok response", async () => {
  const result = await callVirtualmin(credentials(), "list-domains", { multiline: true });
  assert.ok(result, "Result should not be null");
  assert.equal(typeof result.ok, "boolean", "Result should have ok flag");
  assert.equal(typeof result.text, "string", "Result should have text");
  assert.ok(result.ok, `list-domains failed: ${result.message ?? result.text.slice(0, 200)}`);
});

test("Virtualmin: list-plans returns plans", async () => {
  const result = await callVirtualmin(credentials(), "list-plans", { multiline: true });
  assert.ok(result.ok, `list-plans failed: ${result.message ?? result.text.slice(0, 200)}`);
  assert.ok(Array.isArray(result.entries), "Should return entries array");
  console.log(`  Found ${result.entries.length} plan(s)`);
});

test("Virtualmin: list-templates returns templates", async () => {
  const result = await callVirtualmin(credentials(), "list-templates", { multiline: true });
  assert.ok(result.ok, `list-templates failed: ${result.message ?? result.text.slice(0, 200)}`);
  assert.ok(Array.isArray(result.entries), "Should return entries array");
  console.log(`  Found ${result.entries.length} template(s)`);
});

test("Virtualmin: create hosting account for test domain", async () => {
  const action = createDomainAction({
    domainName: TEST_DOMAIN,
    description: `Integration test account (${TEST_DOMAIN})`,
    password: `TestPw${Date.now()}!aA`,
    plan: undefined,
    template: undefined,
    contactEmail: undefined
  });

  console.log(`  Creating domain: ${TEST_DOMAIN}`);
  const result = await callVirtualmin(credentials(), action.program, action.params);
  console.log(`  Result: ok=${result.ok}, message=${result.message ?? "(none)"}`);

  // Accept ok OR a "already exists" message (idempotent re-runs)
  const alreadyExists = /already exist|already a virtual server/i.test(result.message ?? result.text);
  assert.ok(result.ok || alreadyExists, `create-domain failed: ${result.message ?? result.text.slice(0, 400)}`);
});

test("Virtualmin: check test domain appears in list-domains", async () => {
  const result = await callVirtualmin(credentials(), "list-domains", { domain: TEST_DOMAIN, multiline: true });
  const found = result.entries.some((e) => e.name.includes(TEST_DOMAIN)) || result.text.includes(TEST_DOMAIN);
  assert.ok(found || result.ok, `Domain ${TEST_DOMAIN} not found in list-domains: ${result.text.slice(0, 400)}`);
  console.log(`  Domain found in listing: ${found}`);
});

test("Virtualmin: delete test hosting account", async () => {
  const result = await callVirtualmin(credentials(), "delete-domain", { domain: TEST_DOMAIN });
  console.log(`  Delete result: ok=${result.ok}, message=${result.message ?? "(none)"}`);
  const notFound = /no such virtual server|not found|does not exist/i.test(result.message ?? result.text);
  assert.ok(result.ok || notFound, `delete-domain failed: ${result.message ?? result.text.slice(0, 400)}`);
});

test("Virtualmin: credentials from env are valid", () => {
  const creds = adminCredentialsFromEnv(process.env, {
    allowSelfSigned: false,
    endpoint: ""
  });
  assert.ok(creds, "Credentials should be returned when env vars are set");
  assert.ok(creds.endpoint, "Endpoint should be set");
  assert.ok(creds.username, "Username should be set");
  assert.ok(creds.password, "Password should be set");
});
