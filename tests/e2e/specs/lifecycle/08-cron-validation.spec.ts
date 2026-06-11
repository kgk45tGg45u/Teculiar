/**
 * Category 8 — Cron job validation. The cron runner is the platform's automation
 * engine (billing maintenance, status refresh, reminders, sitemap...). We execute
 * it via the authenticated admin endpoint and assert it runs cleanly, that every
 * expected job is accounted for, and that the public endpoint rejects bad secrets.
 */
import { test, expect } from "../../fixtures/test-fixtures";
import { attachJson } from "../../helpers/diagnostics";

const EXPECTED_JOBS = [
  "domainPrices", "domainExpirations", "domainStatuses", "billingMaintenance",
  "invoiceReminders", "ticketsClose", "hostingStatuses", "mailboxes", "sitemap"
] as const;

const ALWAYS_RAN = ["billingMaintenance", "ticketsClose"] as const;

// Cron is a singleton on the server (a second concurrent run returns { running: true }).
// Serialise this file so its repeated cron invocations don't collide with each other.
test.describe.configure({ mode: "serial" });

test.describe("Category 8 — Cron validation", () => {
  test("cron executes successfully and returns valid ran/skipped arrays", async ({ adminApi }, testInfo) => {
    const result = await adminApi.runCron();
    await attachJson(testInfo, "cron-result", result);
    expect(result.ok).toBe(true);
    expect(Array.isArray(result.ran)).toBe(true);
    expect(Array.isArray(result.skipped)).toBe(true);
    expect(result.running).not.toBe(true);
  });

  test("every expected job appears in ran or skipped", async ({ adminApi }) => {
    const result = await adminApi.runCron();
    const seen = new Set([...result.ran.map((j) => j.name), ...result.skipped.map((j) => j.name)]);
    for (const job of EXPECTED_JOBS) {
      expect(seen.has(job), `job "${job}" missing from ran and skipped`).toBe(true);
    }
  });

  test("no cron job reports a failed status", async ({ adminApi }) => {
    const result = await adminApi.runCron();
    const failed = result.ran.filter((j) => j.status === "failed");
    expect(failed, `failed jobs: ${failed.map((j) => `${j.name}=${JSON.stringify(j.result)}`).join(", ")}`).toHaveLength(0);
  });

  test("billingMaintenance and ticketsClose always run (not throttled)", async ({ adminApi }) => {
    const ran = new Set((await adminApi.runCron()).ran.map((j) => j.name));
    for (const job of ALWAYS_RAN) expect(ran.has(job), `"${job}" should always run`).toBe(true);
  });

  test("billingMaintenance result exposes the automation summary keys", async ({ adminApi }) => {
    const result = await adminApi.runCron();
    const billing = result.ran.find((j) => j.name === "billingMaintenance");
    expect(billing?.status).toBe("ran");
    const r = (billing?.result ?? {}) as Record<string, unknown>;
    expect(r).toHaveProperty("automaticPayments");
    expect(r).toHaveProperty("generatedInvoices");
    expect(r).toHaveProperty("overdueInvoices");
  });

  test("public cron endpoint rejects a missing/invalid secret", async ({ api }) => {
    const noSecret = await api.get("/cron");
    expect(noSecret.status, "no secret should be unauthorized").toBe(401);
    const badSecret = await api.get("/cron?token=definitely-not-the-secret");
    expect(badSecret.status, "wrong secret should be unauthorized").toBe(401);
  });
});
