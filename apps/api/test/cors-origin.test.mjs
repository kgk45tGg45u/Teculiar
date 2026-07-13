/**
 * CORS origin decision (Phase 4.1 suffixes + 4.6 tenant-domain allowlist).
 *
 * Run with:  npm --workspace @teculiar/api run build && node --test test/cors-origin.test.mjs
 */
import assert from "node:assert/strict";
import { test, before, beforeEach } from "node:test";

let corsStaticDecision;

before(async () => {
  ({ corsStaticDecision } = await import("../dist/cors-origin.js"));
});

beforeEach(() => {
  delete process.env.CORS_ORIGINS;
  delete process.env.CORS_TENANT_SUFFIXES;
  delete process.env.APP_URL;
  delete process.env.PUBLIC_WEB_URL;
  delete process.env.NEXT_PUBLIC_WEB_URL;
});

test("same-origin / server-to-server (no Origin) is allowed", () => {
  assert.equal(corsStaticDecision(undefined), true);
});

test("tenant suffix hosts are allowed (apex + subdomain)", () => {
  assert.equal(corsStaticDecision("https://teculiar.net"), true);
  assert.equal(corsStaticDecision("https://dezhost.teculiar.net"), true);
  assert.equal(corsStaticDecision("https://teculiar.com"), true);
});

test("an explicit env origin is allowed", () => {
  process.env.PUBLIC_WEB_URL = "https://www.dezhost.com";
  assert.equal(corsStaticDecision("https://www.dezhost.com"), true);
});

test("CORS_TENANT_SUFFIXES adds buyer domains", () => {
  process.env.CORS_TENANT_SUFFIXES = "acmehost.com";
  assert.equal(corsStaticDecision("https://client.acmehost.com"), true);
  assert.equal(corsStaticDecision("https://acmehost.com"), true);
});

test("an unknown host defers to the control-plane lookup", () => {
  assert.equal(corsStaticDecision("https://api.someones-store.com"), "check");
});

test("a malformed origin is rejected outright", () => {
  assert.equal(corsStaticDecision("not a url"), false);
});
