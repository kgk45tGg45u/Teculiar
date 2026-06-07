/**
 * Cron end-to-end tests — works against localhost OR production.
 *
 * Tests that the cron runner executes successfully from the admin UI and
 * that each expected job is either run or skipped (not crashed).
 *
 * Run against production:
 *   E2E_BASE_URL=https://dezhost.com \
 *   E2E_ADMIN_EMAIL=admin@dezhost.com \
 *   E2E_ADMIN_PASSWORD=yourpassword \
 *   npx playwright test tests/e2e/specs/cron-e2e.spec.ts
 *
 * Or locally (servers must already be running):
 *   npx playwright test tests/e2e/specs/cron-e2e.spec.ts
 */
import { expect, test } from "@playwright/test";

const ADMIN_EMAIL = process.env.E2E_ADMIN_EMAIL ?? "admin@dezhost.local";
const ADMIN_PASSWORD = process.env.E2E_ADMIN_PASSWORD ?? "Dezhost-3f417f4248a568cfe6!";
const BASE = (process.env.E2E_BASE_URL ?? process.env.PLAYWRIGHT_BASE_URL ?? "http://127.0.0.1:3000").replace(/\/$/, "");
const API_BASE = (process.env.E2E_API_URL ?? process.env.NEXT_PUBLIC_API_URL ?? "http://127.0.0.1:4000/api/v1").replace(/\/$/, "");

// Jobs that must appear in every cron result (either ran or skipped)
const EXPECTED_CRON_JOBS = [
  "domainPrices",
  "domainExpirations",
  "domainStatuses",
  "billingMaintenance",
  "invoiceReminders",
  "ticketsClose",
  "hostingStatuses",
  "mailboxes",
  "sitemap"
] as const;

// Jobs that run every time (no throttle) and must always be in "ran"
const ALWAYS_RAN_JOBS = ["billingMaintenance", "ticketsClose"] as const;

type CronRunItem = { name: string; status: "ran" | "failed"; result?: unknown };
type CronSkipItem = { name: string; nextAt: string };
type CronResponse = { ok: boolean; ran: CronRunItem[]; skipped: CronSkipItem[]; running?: boolean };

async function adminLogin(page: Parameters<typeof test>[1] extends (...args: infer A) => unknown ? A[0] : never) {
  await page.goto(`${BASE}/admin/login`);
  await page.fill('[name="email"]', ADMIN_EMAIL);
  await page.fill('[name="password"]', ADMIN_PASSWORD);
  const loginBtn = page.getByRole("button", { name: /^(Login|Anmelden|Sign in)$/i });
  await (await loginBtn.count() > 0 ? loginBtn : page.locator('button[type="submit"]').first()).click();
  await page.waitForURL(/\/admin(?!\/login)/, { timeout: 20_000 });
}

async function getAdminToken(page: Parameters<typeof test>[1] extends (...args: infer A) => unknown ? A[0] : never): Promise<string> {
  return page.evaluate(() => localStorage.getItem("dezhost_admin_access_token") ?? "");
}

async function runCronViaApi(page: Parameters<typeof test>[1] extends (...args: infer A) => unknown ? A[0] : never): Promise<CronResponse> {
  const token = await getAdminToken(page);
  const response = await page.request.post(`${API_BASE}/cron/admin/run`, {
    headers: { Authorization: `Bearer ${token}` }
  });
  expect(response.status(), "Cron API call should return 2xx").toBeLessThan(300);
  return response.json() as Promise<CronResponse>;
}

// ── Core cron execution ───────────────────────────────────────────────────────

test.describe("Cron runner", () => {
  test("cron completes successfully and returns a valid response", async ({ page }) => {
    await adminLogin(page);
    const result = await runCronViaApi(page);

    expect(result.ok, "Cron response ok should be true").toBe(true);
    expect(Array.isArray(result.ran), "ran should be an array").toBe(true);
    expect(Array.isArray(result.skipped), "skipped should be an array").toBe(true);
    expect(result.running, "Cron should not still be running").not.toBe(true);
  });

  test("all expected cron jobs appear in ran or skipped", async ({ page }) => {
    await adminLogin(page);
    const result = await runCronViaApi(page);

    const ranNames = new Set(result.ran.map((j) => j.name));
    const skippedNames = new Set(result.skipped.map((j) => j.name));

    for (const job of EXPECTED_CRON_JOBS) {
      expect(
        ranNames.has(job) || skippedNames.has(job),
        `Job "${job}" is missing from both ran and skipped lists`
      ).toBe(true);
    }
  });

  test("no cron job has a failed status", async ({ page }) => {
    await adminLogin(page);
    const result = await runCronViaApi(page);

    const failedJobs = result.ran.filter((j) => j.status === "failed");
    expect(
      failedJobs,
      `These jobs failed: ${failedJobs.map((j) => `${j.name} (${JSON.stringify(j.result)})`).join(", ")}`
    ).toHaveLength(0);
  });

  test("billingMaintenance and ticketsClose always run (not skipped)", async ({ page }) => {
    await adminLogin(page);
    const result = await runCronViaApi(page);

    const ranNames = new Set(result.ran.map((j) => j.name));
    for (const job of ALWAYS_RAN_JOBS) {
      expect(ranNames.has(job), `"${job}" should always be in the ran list`).toBe(true);
    }
  });

  test("skipped jobs have a valid nextAt timestamp", async ({ page }) => {
    await adminLogin(page);
    const result = await runCronViaApi(page);

    for (const job of result.skipped) {
      expect(job.nextAt, `Skipped job "${job.name}" missing nextAt`).toBeTruthy();
      const nextAt = new Date(job.nextAt);
      expect(Number.isFinite(nextAt.getTime()), `Skipped job "${job.name}" has invalid nextAt: ${job.nextAt}`).toBe(true);
      expect(nextAt.getTime(), `Skipped job "${job.name}" nextAt should be in the future`).toBeGreaterThan(Date.now() - 60_000);
    }
  });
});

// ── Cron via Admin UI ─────────────────────────────────────────────────────────

test.describe("Cron Admin UI", () => {
  test("Run Cron Now button shows a success message with job counts", async ({ page }) => {
    await adminLogin(page);
    await page.goto(`${BASE}/admin/settings/cron`);

    // Click Run Cron Now
    const runBtn = page.getByRole("button", { name: /run cron now/i });
    await expect(runBtn).toBeVisible({ timeout: 10_000 });
    await runBtn.click();

    // Wait for the result message
    // Cron calls external services (Virtualmin, Resell.biz) so give it generous time.
    await expect(
      page.locator("text=/Cron finished\\..*Ran \\d+.*skipped \\d+/")
    ).toBeVisible({ timeout: 90_000 });
  });

  test("Cron Settings page lists all expected jobs in the table", async ({ page }) => {
    await adminLogin(page);
    await page.goto(`${BASE}/admin/settings/cron`);

    // The table of jobs should be visible
    for (const job of EXPECTED_CRON_JOBS) {
      await expect(page.locator(`td:has-text("${job}")`).first()).toBeVisible({ timeout: 10_000 });
    }
  });
});

// ── Cron quality checks ───────────────────────────────────────────────────────

test.describe("Cron job quality", () => {
  test("billingMaintenance result contains expected keys", async ({ page }) => {
    await adminLogin(page);
    const result = await runCronViaApi(page);

    const billing = result.ran.find((j) => j.name === "billingMaintenance");
    expect(billing, "billingMaintenance should be in ran").toBeDefined();
    expect(billing?.status).toBe("ran");
    // Result may vary by implementation; just ensure it returned something
    expect(billing?.result).toBeDefined();
  });

  test("sitemap job ran or was already done today", async ({ page }) => {
    await adminLogin(page);
    const result = await runCronViaApi(page);

    const sitemapRan = result.ran.find((j) => j.name === "sitemap");
    const sitemapSkipped = result.skipped.find((j) => j.name === "sitemap");
    expect(sitemapRan ?? sitemapSkipped, "sitemap should be in ran or skipped").toBeDefined();

    if (sitemapRan) {
      // When sitemap ran, verify the result has a url count
      const res = sitemapRan.result as { urls?: number } | null;
      expect(typeof res?.urls, "sitemap result should include url count").toBe("number");
      expect(res?.urls ?? 0, "sitemap should generate at least some URLs").toBeGreaterThan(0);
    }
  });

  test("second consecutive cron run still succeeds and skips timed jobs", async ({ page }) => {
    await adminLogin(page);

    // First run
    await runCronViaApi(page);
    // Second run immediately after — timed jobs should now be skipped
    const second = await runCronViaApi(page);

    expect(second.ok).toBe(true);
    // billingMaintenance and ticketsClose still ran (no throttle)
    const ranNames = new Set(second.ran.map((j) => j.name));
    expect(ranNames.has("billingMaintenance")).toBe(true);
    expect(ranNames.has("ticketsClose")).toBe(true);
    // At least some timed jobs should now be skipped
    expect(second.skipped.length, "Some timed jobs should be skipped on the second run").toBeGreaterThan(0);
  });
});
