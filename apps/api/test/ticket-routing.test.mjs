import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { test } from "node:test";
import { stripDeadLinks } from "../dist/modules/email/email.service.js";

// Phase 7.3 — sales vs support ticket routing. A clients-only department rejects mail from
// unknown senders; sales auto-creates a guest; guest replies carry no client-portal button.

test("stripDeadLinks removes empty-href buttons (guest ticket_url) but keeps real links", () => {
  const button = '<p><a href="" style="padding:11px 20px">View ticket</a></p>';
  assert.equal(stripDeadLinks(button), "");
  // A real link is untouched.
  const real = '<p>See <a href="https://x.test/tickets/1">your ticket</a> now.</p>';
  assert.equal(stripDeadLinks(real), real);
  // Only the dead anchor is stripped; surrounding text stays.
  const mixed = '<p>Hi.</p><p><a href="">Dead</a></p><p>Bye.</p>';
  assert.equal(stripDeadLinks(mixed), "<p>Hi.</p><p>Bye.</p>");
});

test("Department.openToNonClients flag + re-runnable migration exist", async () => {
  const schema = await readFile(new URL("../../../prisma/schema.prisma", import.meta.url), "utf8");
  assert.match(schema, /model Department[\s\S]*?openToNonClients\s+Boolean\s+@default\(false\)/);
  const migration = new URL("../../../prisma/migrations/20260722120000_department_open_to_nonclients/migration.sql", import.meta.url);
  assert.ok(existsSync(migration), "migration dir exists");
  const sql = await readFile(migration, "utf8");
  assert.match(sql, /ADD COLUMN IF NOT EXISTS `openToNonClients`/);
  assert.match(sql, /SET `openToNonClients` = true WHERE `slug` = 'sales'/);
});

test("import guard rejects unknown senders for clients-only departments", async () => {
  const service = await readFile(new URL("../src/modules/tickets/tickets.service.ts", import.meta.url), "utf8");
  // Routing resolves the whole department (needs the flag), not just its id.
  assert.match(service, /departmentForSlug/);
  // A registered client is one that exists and is not a guest.
  assert.match(service, /const knownClient = Boolean\(existing && !existing\.isGuest\)/);
  // Clients-only + not a known client → no ticket, logged SKIPPED_NOT_CLIENT.
  assert.match(service, /if \(!department\.openToNonClients && !knownClient\)/);
  assert.match(service, /SKIPPED_NOT_CLIENT/);
  // Sales (open) still auto-creates a guest.
  assert.match(service, /existing \?\? \(await this\.tickets\.findOrCreateGuestUser\(sender, sender\)\)/);
});

test("findUserByEmail exposes isGuest so the guard can tell clients from guests", async () => {
  const repo = await readFile(new URL("../src/modules/tickets/tickets.repository.ts", import.meta.url), "utf8");
  assert.match(repo, /findUserByEmail[\s\S]*?select: \{ email: true, id: true, name: true, isGuest: true \}/);
});

test("guest recipients get no portal link (empty ticket_url, stripped button)", async () => {
  const service = await readFile(new URL("../src/modules/tickets/tickets.service.ts", import.meta.url), "utf8");
  const emailService = await readFile(new URL("../src/modules/email/email.service.ts", import.meta.url), "utf8");
  assert.match(service, /const ticketUrl = user\.isGuest \? "" : tenantClientUrl/);
  assert.match(service, /ticket_url: ticketUrl/);
  assert.match(emailService, /stripDeadLinks\(renderEmailLayout/);
});

test("admin departments UI has the sales/clients-only toggle + create checkbox", async () => {
  const panel = await readFile(new URL("../../web/components/admin/admin-departments.tsx", import.meta.url), "utf8");
  assert.match(panel, /openToNonClients: !department\.openToNonClients/);
  assert.match(panel, /name="openToNonClients"/);
  assert.match(panel, /c\.accessSales : c\.accessSupport/);
});

test("department access + currency-guard locale keys exist in en + de", async () => {
  for (const lang of ["en", "de"]) {
    const admin = JSON.parse(await readFile(new URL(`../../../packages/locales/${lang}/admin.json`, import.meta.url), "utf8"));
    for (const key of ["openToNonClients", "accessHint", "accessSales", "accessSupport", "makeOpenSales", "makeClientsOnly"]) {
      assert.ok(admin.dept[key], `${lang} admin.dept.${key}`);
    }
    for (const key of ["currencyChangeTitle", "currencyChangeWarning", "currencyChangeConfirm", "currencyChangeCancel"]) {
      assert.ok(admin.langCur[key], `${lang} admin.langCur.${key}`);
    }
  }
});
