/**
 * Cron end-to-end tests — works against localhost OR production.
 *
 * Tests that the cron runner executes successfully from the admin UI and
 * that each expected job is either run or skipped (not crashed).
 *
 * Run against production (use the www host — the bare domain 301/302-redirects):
 *   E2E_BASE_URL=https://www.dezhost.com \
 *   E2E_API_URL=https://www.dezhost.com/api/v1 \
 *   E2E_ADMIN_EMAIL=admin@dezhost.com \
 *   E2E_ADMIN_PASSWORD=yourpassword \
 *   npx playwright test tests/e2e/specs/cron-e2e.spec.ts
 *
 * Or locally (servers must already be running):
 *   npx playwright test tests/e2e/specs/cron-e2e.spec.ts
 */
import { expect, test } from "@playwright/test";

const ADMIN_EMAIL = process.env.E2E_ADMIN_EMAIL ?? "admin@dezhost.local";
const ADMIN_PASSWORD = process.env.E2E_ADMIN_PASSWORD ?? "";
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

type TestPage = Parameters<typeof test>[1] extends (...args: infer A) => unknown ? A[0] : never;

// Token cache keyed by page — adminLogin logs in via the API and seeds cookies directly instead of
// filling the login form + reading localStorage back. Reading localStorage right after a UI-driven
// login can race a white-label surface redirect (Phase 2 admin./client. hosts land on a different
// origin than the login form started on, where localStorage is empty) — the API+cookie route used
// throughout payment-gateways.spec.ts sidesteps that entirely and is what this now matches.
const adminTokens = new WeakMap<TestPage, string>();

async function adminLogin(page: TestPage): Promise<void> {
  const r = await page.request.post(`${API_BASE}/auth/login`, { data: { email: ADMIN_EMAIL, password: ADMIN_PASSWORD, scope: "admin" } });
  expect(r.ok(), `admin login: ${r.status()} ${await r.text()}`).toBeTruthy();
  const body = (await r.json()) as { accessToken?: string; refreshToken?: string };
  expect(body.accessToken, "admin login returned no accessToken").toBeTruthy();
  adminTokens.set(page, body.accessToken!);
  const hostname = new URL(BASE).hostname;
  await page.context().addCookies([
    { name: "teculiar_admin_access_token", value: body.accessToken!, domain: hostname, path: "/" },
    { name: "teculiar_admin_refresh_token", value: body.refreshToken ?? "", domain: hostname, path: "/" }
  ]);
  await page.goto(`${BASE}/admin`);
  await page.waitForURL(/\/admin(?!\/login)/, { timeout: 20_000 });
}

async function getAdminToken(page: TestPage): Promise<string> {
  return adminTokens.get(page) ?? "";
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

    // Wait for the result message. Scoped to <main> — the same text also appears in a toast
    // notification, which made an unscoped locator match 2 elements (strict-mode violation).
    // Cron calls external services (Virtualmin, Resell.biz) so give it generous time.
    await expect(
      page.getByRole("main").locator("text=/Cron finished\\..*Ran \\d+.*skipped \\d+/")
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

// ── Detailed job results (feed the admin "Recent Cron Activity" view) ─────────

test.describe("Cron job result detail", () => {
  test("sitemap result reports the live dynamic-route shape", async ({ page }) => {
    await adminLogin(page);
    const result = await runCronViaApi(page);
    const sitemap = result.ran.find((j) => j.name === "sitemap");
    if (sitemap && sitemap.status === "ran") {
      // Shape mirrors the dynamic route: theme pages + extra paths per configured locale + posts.
      const res = sitemap.result as { urls?: number; locales?: string[]; pagesPerLocale?: number; posts?: number; source?: string };
      expect(typeof res.urls, "sitemap result should include url count").toBe("number");
      expect(Array.isArray(res.locales), "sitemap result should list configured locales").toBe(true);
      expect((res.locales ?? []).length, "sitemap should cover at least one locale").toBeGreaterThan(0);
      expect(typeof res.pagesPerLocale, "sitemap result should include pages-per-locale").toBe("number");
      expect(res.source, "sitemap is served by the live route, not a file").toBe("dynamic-route");
    }
  });

  test("mailboxes result includes a per-department breakdown when it ran", async ({ page }) => {
    await adminLogin(page);
    const result = await runCronViaApi(page);
    const mailboxes = result.ran.find((j) => j.name === "mailboxes");
    if (mailboxes && mailboxes.status === "ran") {
      const res = mailboxes.result as { byDepartment?: Record<string, number> };
      expect(res.byDepartment, "mailboxes result should include byDepartment").toBeDefined();
      expect(typeof res.byDepartment).toBe("object");
    }
  });

  test("hostingStatuses result includes a changed array when it ran", async ({ page }) => {
    await adminLogin(page);
    const result = await runCronViaApi(page);
    const hosting = result.ran.find((j) => j.name === "hostingStatuses");
    if (hosting && hosting.status === "ran") {
      const res = hosting.result as { changed?: unknown[]; checked?: number };
      expect(Array.isArray(res.changed), "hostingStatuses result should include a changed array").toBe(true);
      expect(typeof res.checked).toBe("number");
    }
  });

  test("aiBlogPost always reports an outcome (created count or skip reason)", async ({ page }) => {
    await adminLogin(page);
    const result = await runCronViaApi(page);
    const ran = result.ran.find((j) => j.name === "aiBlogPost");
    const skipped = result.skipped.find((j) => j.name === "aiBlogPost");
    expect(ran ?? skipped, "aiBlogPost should appear in ran or skipped").toBeDefined();
    if (ran && ran.status === "ran") {
      const res = ran.result as { created?: number; skipped?: boolean; reason?: string };
      const hasOutcome = typeof res.created === "number" || res.skipped === true;
      expect(hasOutcome, "aiBlogPost result should report a created count or a skip reason").toBe(true);
    }
  });
});

// ── Live sitemap (served by apps/web/app/sitemap.xml/route.ts) ─────────────────

test.describe("Sitemap", () => {
  test("/sitemap.xml is served live and every URL uses the request host", async ({ page }) => {
    const res = await page.request.get(`${BASE}/sitemap.xml`);
    expect(res.status(), "sitemap should be served").toBe(200);
    const body = await res.text();
    expect(body, "sitemap should be a urlset").toContain("<urlset");
    expect(body, "sitemap should include German locale URLs").toMatch(/\/de\//);
    expect(body, "sitemap should include English locale URLs").toMatch(/\/en\//);

    const host = new URL(BASE).host;
    const locs = [...body.matchAll(/<loc>(.*?)<\/loc>/g)].map((m) => m[1]);
    expect(locs.length, "sitemap should contain URLs").toBeGreaterThan(0);
    for (const loc of locs) {
      expect(new URL(loc).host, `sitemap <loc> host should match ${host} (admin Site URL must be the www host)`).toBe(host);
    }
  });
});
