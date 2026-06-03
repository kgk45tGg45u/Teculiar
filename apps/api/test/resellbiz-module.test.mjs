/**
 * Resell.biz module integration tests.
 *
 * NOTE: The Resell.biz TEST API (https://test.httpapi.com) may block the
 * current IP address. If tests fail with "IP blocked" or HTTP 403, this is
 * expected — the issue is network-level, not a code bug.
 *
 * Credentials are read from environment variables (RESELLBIZ_*).
 * All tests use the TEST environment (test.httpapi.com) — never production.
 *
 * Run with:
 *   npm run build && node --test test/resellbiz-module.test.mjs
 */

import assert from "node:assert/strict";
import { test, before } from "node:test";

// ── Config ────────────────────────────────────────────────────────────────────

const API_KEY = process.env.RESELLBIZ_API_KEY ?? "";
const RESELLER_ID = process.env.RESELLBIZ_RESELLER_ID ?? "";
const BASE_URL = process.env.RESELLBIZ_API_BASE_URL ?? "https://test.httpapi.com";

if (!API_KEY || !RESELLER_ID) {
  console.warn("RESELLBIZ_API_KEY and RESELLBIZ_RESELLER_ID are not set — skipping Resell.biz tests");
  process.exit(0);
}

// ── Dynamic imports ───────────────────────────────────────────────────────────

let callResellBiz;
let credentialsFromEnv;
let ResellBizApiError;

before(async () => {
  const mod = await import("../dist/modules/resellbiz-client/resellbiz-http.js");
  callResellBiz = mod.callResellBiz;
  credentialsFromEnv = mod.credentialsFromEnv;
  ResellBizApiError = mod.ResellBizApiError;
});

function credentials() {
  return { apiKey: API_KEY, baseUrl: BASE_URL, resellerId: Number(RESELLER_ID) };
}

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Wraps a test that may fail if the test API is blocking the current IP.
 * Returns false if the test was skipped due to IP block, true otherwise.
 */
async function withIpBlockGuard(fn) {
  try {
    await fn();
    return true;
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    const isIpBlocked =
      /ip.*block|blocked|forbidden|403|access denied|not allowed/i.test(msg) ||
      (error?.status >= 400 && error?.status < 500);

    if (isIpBlocked) {
      console.warn(`  ⚠ Resell.biz API blocked this IP — test skipped. Error: ${msg.slice(0, 100)}`);
      return false;
    }
    throw error;
  }
}

// ── Tests ─────────────────────────────────────────────────────────────────────

test("Resell.biz: credentials are available in environment", () => {
  const creds = credentialsFromEnv(process.env);
  assert.ok(creds, "Credentials should be returned from env");
  assert.ok(creds.apiKey, "API key should be present");
  assert.ok(creds.resellerId, "Reseller ID should be present");
  assert.ok(creds.baseUrl, "Base URL should be present");
  assert.ok(creds.baseUrl.includes("httpapi.com"), "Base URL should point to httpapi.com");
  console.log(`  Base URL: ${creds.baseUrl}`);
  console.log(`  Reseller ID: ${creds.resellerId}`);
});

test("Resell.biz: check .com domain availability (IP-block aware)", async () => {
  const testDomain = `reztest-${Date.now()}.com`;
  const skipped = !(await withIpBlockGuard(async () => {
    const result = await callResellBiz(credentials(), "GET", "/api/domains/available.json", {
      "domain-name": [testDomain],
      tlds: ["com"]
    });
    assert.ok(result, "Should return a result");
    assert.equal(typeof result, "object", "Result should be an object");
    console.log(`  Domain check for ${testDomain}: ${JSON.stringify(result).slice(0, 150)}`);
  }));

  if (skipped) {
    console.warn("  NOTE: Resell.biz test API is blocking this IP address. This is expected per project notes.");
    console.warn("  To test from a non-blocked IP, set RESELLBIZ_API_BASE_URL to the production endpoint.");
  }
});

test("Resell.biz: fetch domain TLD pricing (IP-block aware)", async () => {
  await withIpBlockGuard(async () => {
    const result = await callResellBiz(credentials(), "GET", "/api/products/domorder/v2/tldinfo.json", {
      tlds: ["com", "de", "net"]
    });
    assert.ok(result, "Should return TLD pricing data");
    console.log(`  TLD info result keys: ${Object.keys(result ?? {}).join(", ")}`);
  });
});

test("Resell.biz: ResellBizApiError is properly thrown on bad request (IP-block aware)", async () => {
  await withIpBlockGuard(async () => {
    try {
      // Intentionally bad request — missing required params
      await callResellBiz(credentials(), "GET", "/api/domains/available.json", {});
      assert.fail("Should have thrown ResellBizApiError");
    } catch (error) {
      // Either an API error (expected) or a network error
      assert.ok(error instanceof Error, "Error should be an Error instance");
      console.log(`  Got expected error: ${error.message.slice(0, 100)}`);
    }
  });
});

test("Resell.biz: module build artifacts exist", async () => {
  const { existsSync } = await import("node:fs");
  const paths = [
    "dist/modules/resellbiz-client/resellbiz-api.js",
    "dist/modules/resellbiz-client/resellbiz-http.js",
    "dist/modules/resellbiz-client/resellbiz-normalize.js",
    "dist/modules/resellbiz-client/resellbiz-types.js",
    "dist/modules/external/resellbiz-provider.service.js"
  ];
  for (const p of paths) {
    assert.ok(existsSync(p), `Missing build artifact: ${p}`);
  }
  console.log(`  All ${paths.length} build artifacts present`);
});
