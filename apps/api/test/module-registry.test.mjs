/**
 * Module-registry unit tests — pure helpers that drive the pluggable module system:
 *  - resolveNameServers: how the registrar picks name servers (customer → module default → platform)
 *  - parseNameServers:   CSV/whitespace parsing of the configured default name servers
 *  - canonicalModuleName: maps stored registrar identifiers onto catalog module names
 *
 * Run with:  npm --workspace @dezhost/api run build && node --test test/module-registry.test.mjs
 */

import assert from "node:assert/strict";
import { test, before } from "node:test";

let resolveNameServers;
let parseNameServers;
let canonicalModuleName;
let DEFAULT_NAME_SERVERS;
let RESELLBIZ_TEST_BASE_URL;
let RESELLBIZ_LIVE_BASE_URL;

before(async () => {
  const svc = await import("../dist/modules/module-registry/module-registry.service.js");
  const cat = await import("../dist/modules/module-registry/module-catalog.js");
  resolveNameServers = svc.resolveNameServers;
  parseNameServers = svc.parseNameServers;
  canonicalModuleName = cat.canonicalModuleName;
  DEFAULT_NAME_SERVERS = cat.DEFAULT_NAME_SERVERS;
  RESELLBIZ_TEST_BASE_URL = cat.RESELLBIZ_TEST_BASE_URL;
  RESELLBIZ_LIVE_BASE_URL = cat.RESELLBIZ_LIVE_BASE_URL;
});

test("platform default name servers are ns5/ns6.dezhost.com (never ns1/ns2.domain.com)", () => {
  assert.deepEqual(DEFAULT_NAME_SERVERS, ["ns5.dezhost.com", "ns6.dezhost.com"]);
});

test("resolveNameServers keeps the customer's name servers when they supply two or more", () => {
  const customer = ["a.ns.example", "b.ns.example"];
  assert.deepEqual(resolveNameServers(customer, ["ns5.dezhost.com", "ns6.dezhost.com"]), customer);
});

test("resolveNameServers uses the module default when the customer supplies none", () => {
  const moduleDefault = ["ns1.host.test", "ns2.host.test"];
  assert.deepEqual(resolveNameServers(undefined, moduleDefault), moduleDefault);
  assert.deepEqual(resolveNameServers([], moduleDefault), moduleDefault);
});

test("resolveNameServers falls back to the platform default ns5/ns6 when nothing is configured", () => {
  assert.deepEqual(resolveNameServers([], []), ["ns5.dezhost.com", "ns6.dezhost.com"]);
  assert.deepEqual(resolveNameServers(undefined, ["only.one.ns"]), ["ns5.dezhost.com", "ns6.dezhost.com"]);
});

test("resolveNameServers always returns at least two name servers, topping up a single one", () => {
  const result = resolveNameServers(["custom.ns.example"], ["ns5.dezhost.com", "ns6.dezhost.com"]);
  assert.ok(result.length >= 2, `expected >= 2 name servers, got ${result.length}`);
  assert.equal(result[0], "custom.ns.example");
});

test("parseNameServers splits comma- and whitespace-separated lists and trims blanks", () => {
  assert.deepEqual(parseNameServers("ns5.dezhost.com, ns6.dezhost.com"), ["ns5.dezhost.com", "ns6.dezhost.com"]);
  assert.deepEqual(parseNameServers("  a.ns   b.ns ,, c.ns "), ["a.ns", "b.ns", "c.ns"]);
  assert.deepEqual(parseNameServers(""), []);
});

test("canonicalModuleName maps legacy registrar identifiers and rejects manual/none", () => {
  assert.equal(canonicalModuleName("resell.biz"), "resellbiz");
  assert.equal(canonicalModuleName("resellbiz"), "resellbiz");
  assert.equal(canonicalModuleName(undefined), undefined);
  assert.equal(canonicalModuleName(""), undefined);
  assert.equal(canonicalModuleName("none"), undefined);
  assert.equal(canonicalModuleName("manual"), undefined);
});

test("resell.biz test/live base URLs are the expected LogicBoxes hosts", () => {
  assert.equal(RESELLBIZ_TEST_BASE_URL, "https://test.httpapi.com");
  assert.equal(RESELLBIZ_LIVE_BASE_URL, "https://httpapi.com");
});
