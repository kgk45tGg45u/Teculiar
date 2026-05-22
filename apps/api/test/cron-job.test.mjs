import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";

test("cron runs due timed actions only and always runs idempotent due-date checks", async () => {
  const { CronService } = await import("../dist/modules/cron/cron.service.js");
  const now = new Date("2026-05-20T10:00:00.000Z");
  const calls = [];
  const lastRuns = new Map([
    ["domainPrices", new Date("2026-05-20T09:30:00.000Z")],
    ["domainExpirations", new Date("2026-05-20T03:00:00.000Z")],
    ["domainStatuses", new Date("2026-05-20T09:40:00.000Z")],
    ["hostingStatuses", new Date("2026-05-20T09:50:00.000Z")],
    ["mailboxes", new Date("2026-05-20T09:30:00.000Z")],
    ["invoiceReminders", new Date("2026-05-19T00:00:00.000Z")]
  ]);
  const billing = {
    cronSettings: async () => ({
      cronSecret: "secret",
      domainExpirationUpdateHours: 6,
      domainPriceUpdateHours: 2,
      domainStatusUpdateMinutes: 15,
      hostingStatusUpdateMinutes: 30,
      invoiceDaysAhead: 7,
      invoiceReminderDaysBeforeDue: 3,
      mailboxCheckMinutes: 15,
      ticketAutoCloseHours: 24
    }),
    cronLastRun: async (key) => lastRuns.get(key),
    markCronRun: async (key, date) => {
      calls.push(["mark", key, date.toISOString()]);
      lastRuns.set(key, date);
    },
    recordAction: async (input) => calls.push(["audit", input.action]),
    runAdminMaintenance: async (date) => {
      calls.push(["billing", date.toISOString()]);
      return { generatedInvoices: 1 };
    },
    sendInvoiceReminders: async (date, days) => {
      calls.push(["reminders", date.toISOString(), days]);
      return { invoiceReminders: 2 };
    }
  };
  const orders = { syncDomainPrices: async () => calls.push(["domainPrices"]) };
  const products = {
    refreshAllDomainExpirations: async () => calls.push(["domainExpirations"]),
    refreshAllDomainStatuses: async () => calls.push(["domainStatuses"]),
    refreshAllHostingStatuses: async () => calls.push(["hostingStatuses"])
  };
  const tickets = {
    closeAnsweredTickets: async (hours, date) => {
      calls.push(["ticketsClose", hours, date.toISOString()]);
      return { count: 1 };
    },
    importMailboxTickets: async () => calls.push(["mailboxes"])
  };

  const result = await new CronService(billing, orders, products, tickets).run(now);

  assert.deepEqual(
    calls.filter((call) => !["mark", "audit"].includes(call[0])).map((call) => call[0]),
    ["domainExpirations", "domainStatuses", "billing", "reminders", "ticketsClose", "mailboxes"]
  );
  assert.equal(result.ran.some((item) => item.name === "domainPrices"), false);
  assert.equal(result.ran.some((item) => item.name === "hostingStatuses"), false);
  assert.equal(result.skipped.some((item) => item.name === "domainPrices"), true);
  assert.equal(result.skipped.some((item) => item.name === "hostingStatuses"), true);
});

test("cron secret is not JWT auth but must match configured secret", async () => {
  const { CronService } = await import("../dist/modules/cron/cron.service.js");
  const service = new CronService(
    {
      cronSettings: async () => ({ cronSecret: "top-secret" }),
      recordAction: async () => undefined
    },
    {},
    {},
    {}
  );
  service.run = async () => ({ ok: true, ran: [], skipped: [] });

  await assert.rejects(() => service.runAuthorized(undefined), /Cron secret missing/);
  await assert.rejects(() => service.runAuthorized("wrong"), /Cron secret invalid/);
  assert.deepEqual(await service.runAuthorized("top-secret"), { ok: true, ran: [], skipped: [] });
});

test("admin cron endpoint is role protected and runs without cron secret", async () => {
  const cronController = await readFile(new URL("../src/modules/cron/cron.controller.ts", import.meta.url), "utf8");

  assert.match(cronController, /UseGuards\(JwtAuthGuard, RolesGuard\)/);
  assert.match(cronController, /@Roles\("admin", "staff"\)/);
  assert.match(cronController, /@Post\("admin\/run"\)/);
  assert.match(cronController, /runAdmin\(\)/);
  assert.match(cronController, /this\.cron\.run\(\)/);
});

test("admin/client dashboards no longer trigger maintenance or provider refresh on page load", async () => {
  const adminDashboard = await readFile(new URL("../../web/components/admin/admin-dashboard.tsx", import.meta.url), "utf8");
  const clientDashboard = await readFile(new URL("../../web/components/portal/client-dashboard.tsx", import.meta.url), "utf8");

  assert.doesNotMatch(adminDashboard, /runMaintenance\(/);
  assert.doesNotMatch(adminDashboard, /billing\/maintenance/);
  assert.doesNotMatch(adminDashboard, /tickets\/maintenance/);
  assert.doesNotMatch(clientDashboard, /setInterval\(loadServices/);
  assert.match(clientDashboard, /view === "services" && !serviceId/);
  assert.match(adminDashboard, /href="\/admin\/settings">Settings<\/a>/);
  assert.match(adminDashboard, /settings: "Settings"/);
});

test("settings page exposes every cron timing and IMAP mailbox field", async () => {
  const adminForms = await readFile(new URL("../../web/components/admin/admin-forms.tsx", import.meta.url), "utf8");
  const billingService = await readFile(new URL("../src/modules/billing/billing.service.ts", import.meta.url), "utf8");

  for (const field of [
    "domainPriceUpdateHours",
    "domainExpirationUpdateHours",
    "domainStatusUpdateMinutes",
    "hostingStatusUpdateMinutes",
    "invoiceReminderDaysBeforeDue",
    "mailboxCheckMinutes",
    "supportImapHost",
    "supportImapUsername",
    "supportImapPassword",
    "supportMailboxAddress",
    "salesImapHost",
    "salesImapUsername",
    "salesImapPassword",
    "salesMailboxAddress",
    "cronSecret"
  ]) {
    assert.match(adminForms, new RegExp(field));
    assert.match(billingService, new RegExp(field));
  }
});

test("settings page has a manual cron run button", async () => {
  const adminForms = await readFile(new URL("../../web/components/admin/admin-forms.tsx", import.meta.url), "utf8");

  assert.match(adminForms, /runCron/);
  assert.match(adminForms, /\/cron\/admin\/run/);
  assert.match(adminForms, /Run Cron Now/);
  assert.match(adminForms, /lastCronRun/);
});
