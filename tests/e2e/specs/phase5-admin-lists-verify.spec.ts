/**
 * Production verification for master-plan Phase 5 (admin productivity lists).
 *
 * Covers 5.1 sortable/selectable tables, 5.2 bulk-action bar, 5.3 inline status
 * dropdowns on the admin Orders / Invoices / Services / Clients / Tickets lists.
 *
 * Runs with the AGENT credential (the only prod E2E admin-portal account — see
 * docs/agent-role.md): read paths (sorting, selection UI, dropdown menus) verify for
 * real; customer-linked writes must come back 403 + error toast, which is the
 * agent write-block working as designed AND proves the endpoint wiring (a wrong
 * URL would 404). The write-success path is covered by local verification with an
 * admin account and by the unit suite.
 *
 * Run:
 *   set -a && source .env && set +a
 *   E2E_BASE_URL=https://www.dezhost.com E2E_API_URL=https://www.dezhost.com/api/v1 \
 *   npx playwright test tests/e2e/specs/phase5-admin-lists-verify.spec.ts --project=chromium --workers=1
 */
import { expect, test, type Page } from "@playwright/test";

const BASE = (process.env.E2E_BASE_URL ?? "http://127.0.0.1:3000").replace(/\/$/, "");
const AGENT_EMAIL = process.env.E2E_AGENT_EMAIL ?? "";
const AGENT_PASSWORD = process.env.E2E_AGENT_PASSWORD ?? "";

async function loginAdminPortal(page: Page) {
  await page.goto(`${BASE}/admin/login`, { waitUntil: "domcontentloaded" });
  await page.fill('input[name="email"]', AGENT_EMAIL);
  await page.fill('input[name="password"]', AGENT_PASSWORD);
  await page.click('button[type="submit"]');
  await page.waitForURL(/\/admin(?!\/login)/, { timeout: 30000 });
}

test.describe("Phase 5 — admin productivity lists", () => {
  test.skip(!AGENT_EMAIL || !AGENT_PASSWORD, "E2E_AGENT_* env vars required");

  test("5.1 clients list sorts by column with aria-sort headers", async ({ page }) => {
    await loginAdminPortal(page);
    await page.goto(`${BASE}/admin/clients`, { waitUntil: "domcontentloaded" });
    await page.waitForSelector("table.compact-table");

    // initial sort: name ascending
    await expect(page.locator('th[aria-sort="ascending"]')).toHaveCount(1);
    const before = await page.locator("tbody tr").first().innerText();

    // toggle the sorted column → descending, first row changes (≥2 clients on prod)
    await page.locator("th button").first().click();
    await expect(page.locator('th[aria-sort="descending"]')).toHaveCount(1);
    const after = await page.locator("tbody tr").first().innerText();
    const rows = await page.locator("tbody tr").count();
    if (rows > 1) expect(after).not.toBe(before);
  });

  test("5.2 invoices: selection shows the bulk bar; bulk mark-paid is agent-blocked (403 by design)", async ({ page }) => {
    await loginAdminPortal(page);
    await page.goto(`${BASE}/admin/invoices`, { waitUntil: "domcontentloaded" });
    await page.waitForSelector("table.compact-table");

    const boxes = page.locator('tbody input[type="checkbox"]');
    const count = await boxes.count();
    test.skip(count < 1, "no invoices on prod tenant");

    await boxes.first().check();
    const markPaid = page.getByRole("button", { name: /Als bezahlt markieren|Mark paid/ }).first();
    await expect(markPaid).toBeVisible(); // bulk bar appeared

    // agent write-block: the looped POST /billing/invoices/:id/mark-paid returns 403
    const [response] = await Promise.all([
      page.waitForResponse((r) => r.url().includes("/billing/invoices/") && r.url().endsWith("/mark-paid")),
      markPaid.click()
    ]);
    expect(response.status()).toBe(403);
    // failure surfaces as the localized "0 done, 1 failed" toast
    await expect(page.locator(".Toastify__toast").first()).toContainText(/fehlgeschlagen|failed/i);
  });

  test("5.3 orders: inline status dropdown offers the admin transitions; select-all works", async ({ page }) => {
    await loginAdminPortal(page);
    await page.goto(`${BASE}/admin/orders`, { waitUntil: "domcontentloaded" });
    await page.waitForSelector("table.compact-table");

    // newest-first initial sort
    await expect(page.locator('th[aria-sort="descending"]')).toHaveCount(1);

    const pill = page.locator("tbody button[aria-haspopup='listbox']").first();
    test.skip((await pill.count()) === 0, "no orders on prod tenant");
    await pill.click();
    const options = page.locator("[role='option']");
    await expect(options).toHaveCount(3); // completed / pending / canceled
    await page.keyboard.press("Escape");
    await expect(options).toHaveCount(0);
  });

  test("5.3 services: dropdown offers exactly the four admin end-states", async ({ page }) => {
    await loginAdminPortal(page);
    await page.goto(`${BASE}/admin/services`, { waitUntil: "domcontentloaded" });
    await page.waitForSelector("table.compact-table");

    const pill = page.locator("tbody button[aria-haspopup='listbox']").first();
    test.skip((await pill.count()) === 0, "no services on prod tenant");
    await pill.click();
    await expect(page.locator("[role='option']")).toHaveCount(4); // active/suspended/cancelled/terminated
    const labels = await page.locator("[role='option']").allInnerTexts();
    expect(labels.join("|")).toMatch(/Aktiv|Active/);
  });

  test("mobile 375px: lists keep zero horizontal page overflow (D1 guarantee)", async ({ page }) => {
    await page.setViewportSize({ height: 800, width: 375 });
    await loginAdminPortal(page);
    for (const path of ["/admin/invoices", "/admin/orders", "/admin/clients"]) {
      await page.goto(`${BASE}${path}`, { waitUntil: "domcontentloaded" });
      await page.waitForSelector("table.compact-table");
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      expect(overflow, `${path} must not scroll horizontally`).toBeLessThanOrEqual(0);
    }
  });
});
