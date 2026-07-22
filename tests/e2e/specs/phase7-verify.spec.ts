/**
 * Production verification for master-plan Phase 7 finish work (2026-07-22):
 *   - 7.4 main-currency guard: confirm banner on changing the main currency.
 *   - 7.3 sales/support routing: department access tag ("Nur Kunden" / "offen").
 *   - Breadcrumbs: German UI shows German crumb labels (no English fallback).
 *   - data-theme removal: the vestigial ThemeBootstrap hook is gone (storefront + admin).
 *
 * Ticket import routing (7.3) is IMAP-driven and covered by the unit suite
 * (apps/api/test/ticket-routing.test.mjs); it is not exercised here.
 *
 * Run against teculiar.com (owner asked for teculiar.com):
 *   set -a && source .env && set +a
 *   E2E_BASE_URL=https://teculiar.com E2E_API_URL=https://teculiar.com/api/v1 \
 *   E2E_ADMIN_EMAIL="$E2E_TECULIAR_ADMIN_EMAIL" E2E_ADMIN_PASSWORD="$E2E_TECULIAR_ADMIN_PASSWORD" \
 *   npx playwright test tests/e2e/specs/phase7-verify.spec.ts --project=chromium --workers=1
 */
import { expect, test, type Page } from "@playwright/test";

const BASE = (process.env.E2E_BASE_URL ?? "http://127.0.0.1:3000").replace(/\/$/, "");
const ADMIN_EMAIL = process.env.E2E_ADMIN_EMAIL ?? "";
const ADMIN_PASSWORD = process.env.E2E_ADMIN_PASSWORD ?? "";
const HOST = new URL(BASE).hostname;

async function forceGermanAdmin(page: Page) {
  await page.context().addCookies([
    { name: "teculiar_admin_locale", value: "de", domain: HOST, path: "/" },
    { name: "teculiar_locale", value: "de", domain: HOST, path: "/" }
  ]);
}

async function loginAdminPortal(page: Page) {
  await page.goto(`${BASE}/admin/login`, { waitUntil: "domcontentloaded" });
  await page.fill('input[name="email"]', ADMIN_EMAIL);
  await page.fill('input[name="password"]', ADMIN_PASSWORD);
  await page.click('button[type="submit"]');
  await page.waitForURL(/\/admin(?!\/login)/, { timeout: 30000 });
}

test.describe("Phase 7 finish — prod verification", () => {
  test("data-theme hook removed on the public storefront", async ({ page }) => {
    await page.goto(`${BASE}/de`, { waitUntil: "domcontentloaded" });
    const themed = await page.locator("html[data-theme]").count();
    expect(themed).toBe(0);
  });

  test("data-theme hook removed on the admin app", async ({ page }) => {
    await page.goto(`${BASE}/admin/login`, { waitUntil: "domcontentloaded" });
    const themed = await page.locator("html[data-theme]").count();
    expect(themed).toBe(0);
  });

  test.describe("authenticated admin", () => {
    test.skip(!ADMIN_EMAIL || !ADMIN_PASSWORD, "E2E_ADMIN_* (teculiar) env vars required");

    test("breadcrumbs render German labels under the German UI", async ({ page }) => {
      await forceGermanAdmin(page);
      await loginAdminPortal(page);
      await forceGermanAdmin(page);
      await page.goto(`${BASE}/admin/products/addons`, { waitUntil: "domcontentloaded" });
      const crumbs = page.locator('nav[aria-label="Brotkrümelnavigation"]').first();
      await expect(crumbs).toContainText("Zusatzleistungen");
      // The English fallback slug must NOT appear (that was the bug).
      await expect(crumbs).not.toContainText("Addons");
    });

    test("7.4 changing the main currency raises the not-re-converted confirm banner", async ({ page }) => {
      await forceGermanAdmin(page);
      await loginAdminPortal(page);
      await forceGermanAdmin(page);
      await page.goto(`${BASE}/admin/settings`, { waitUntil: "domcontentloaded" });
      const select = page.locator('label:has-text("Hauptwährung") select').first();
      await select.waitFor({ state: "visible", timeout: 20000 });
      const options = await select.locator("option").evaluateAll((els) => els.map((e) => (e as HTMLOptionElement).value));
      const current = await select.inputValue();
      const other = options.find((o) => o && o !== current);
      test.skip(!other, "tenant has only one currency configured");
      await select.selectOption(other!);
      const banner = page.getByText("Hauptwährung ändern?");
      await expect(banner).toBeVisible();
      // Cancelling dismisses the banner and keeps the original currency.
      await page.getByRole("button", { name: "Abbrechen" }).click();
      await expect(banner).toHaveCount(0);
      expect(await select.inputValue()).toBe(current);
    });

    test("7.3 department cards show a sales/clients-only access tag", async ({ page }) => {
      await forceGermanAdmin(page);
      await loginAdminPortal(page);
      await forceGermanAdmin(page);
      await page.goto(`${BASE}/admin/tickets/departments`, { waitUntil: "domcontentloaded" });
      await page.waitForLoadState("networkidle");
      const tag = page.getByText(/Nur Kunden|Vertrieb · offen/).first();
      await expect(tag).toBeVisible({ timeout: 20000 });
    });
  });
});
