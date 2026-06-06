/**
 * Tests for feature changes: locale dropdown, blog, about us photo,
 * VPS product, SEO meta, OG images, domains FAQ, webhosting FAQ.
 *
 * Run with servers already started:
 *   npx playwright test tests/e2e/specs/feature-changes.spec.ts
 */
import { expect, test } from "@playwright/test";

const ADMIN_EMAIL = process.env.E2E_ADMIN_EMAIL ?? "admin@dezhost.local";
const ADMIN_PASSWORD = process.env.E2E_ADMIN_PASSWORD ?? "Dezhost-3f417f4248a568cfe6!";
const BASE = process.env.PLAYWRIGHT_BASE_URL ?? "http://127.0.0.1:3000";

async function loginAsAdmin(page: Parameters<typeof test>[1] extends (...args: infer A) => unknown ? A[0] : never) {
  await page.goto(`${BASE}/admin/login`);
  await page.fill('[name="email"]', ADMIN_EMAIL);
  await page.fill('[name="password"]', ADMIN_PASSWORD);
  const loginBtn = page.getByRole("button", { name: /^(Login|Anmelden|Sign in)$/i });
  await (await loginBtn.count() > 0 ? loginBtn : page.locator('button[type="submit"]').first()).click();
  await page.waitForURL(/\/admin(?!\/login)/, { timeout: 20_000 });
}

// ── Locale dropdown ────────────────────────────────────────────────────────────

test.describe("Locale dropdown", () => {
  test("shows locale code without duplicate text (no emoji fallback)", async ({ page }) => {
    await page.goto(`${BASE}/de`);
    // The toggle summary should show "DE · €" not "DE DE · €"
    const toggle = page.locator("summary").filter({ hasText: /DE\s*·/ });
    await expect(toggle.first()).toBeVisible({ timeout: 10_000 });
    const text = await toggle.first().textContent();
    // Should not contain the word "DE" twice (which happens with broken emoji flags)
    expect(text?.match(/DE/g)?.length ?? 0).toBeLessThanOrEqual(1);
  });

  test("language dropdown opens and shows language names", async ({ page }) => {
    await page.goto(`${BASE}/de`);
    const toggle = page.locator("summary").filter({ hasText: /DE\s*·/ });
    await toggle.first().click();
    // Dropdown should show language names like "Deutsch" or "English"
    await expect(page.getByText("Deutsch", { exact: false }).first()).toBeVisible({ timeout: 5_000 });
  });
});

// ── About Us page ──────────────────────────────────────────────────────────────

test.describe("About Us page", () => {
  test("renders founder/photo placeholder section", async ({ page }) => {
    await page.goto(`${BASE}/de/uber-uns`);
    // The founder section should be visible
    await expect(page.locator("text=Gründer").first()).toBeVisible({ timeout: 10_000 });
  });

  test("about page has no broken layout sections", async ({ page }) => {
    await page.goto(`${BASE}/de/uber-uns`);
    await expect(page.locator("h1").first()).toBeVisible({ timeout: 10_000 });
  });
});

// ── Blog ───────────────────────────────────────────────────────────────────────

test.describe("Blog", () => {
  test("blog listing page renders", async ({ page }) => {
    await page.goto(`${BASE}/de/blog`);
    await expect(page.locator("h1").first()).toBeVisible({ timeout: 10_000 });
  });

  test("blog listing OG meta uses blog description", async ({ page }) => {
    await page.goto(`${BASE}/de/blog`);
    const desc = await page.locator('meta[name="description"]').getAttribute("content");
    expect(desc?.length ?? 0).toBeGreaterThan(20);
  });
});

// ── Domains page ───────────────────────────────────────────────────────────────

test.describe("Domains page", () => {
  test("domains page renders without standalone explainer block", async ({ page }) => {
    await page.goto(`${BASE}/de/domains`);
    await expect(page.locator("h1").first()).toBeVisible({ timeout: 10_000 });
    // The old standalone "Was ist eine Domain?" h2 should NOT exist as a standalone section
    // (it still exists in FAQ, so we check it's inside a details element)
    const standaloneH2 = page.locator("h2").filter({ hasText: /Was ist eine Domain/i });
    // If present, it must be inside a details/FAQ element
    const count = await standaloneH2.count();
    for (let i = 0; i < count; i++) {
      const el = standaloneH2.nth(i);
      const isInDetails = await el.evaluate((node) => !!node.closest("details"));
      expect(isInDetails).toBe(true);
    }
  });

  test("domains page has FAQ section", async ({ page }) => {
    await page.goto(`${BASE}/de/domains`);
    await expect(page.locator("details").first()).toBeVisible({ timeout: 10_000 });
  });
});

// ── Virtual Servers / VPS page ─────────────────────────────────────────────────

test.describe("Virtual Servers page", () => {
  test("shows VPS product from database", async ({ page }) => {
    await page.goto(`${BASE}/de/virtual-servers`);
    await expect(page.locator("h1").first()).toBeVisible({ timeout: 10_000 });
    // Should show the Cloud VPS Starter product (not just the fallback)
    await expect(page.getByText("Cloud VPS Starter", { exact: false }).first()).toBeVisible({ timeout: 10_000 });
  });

  test("VPS product has order button", async ({ page }) => {
    await page.goto(`${BASE}/de/virtual-servers`);
    const orderBtn = page.getByText(/Jetzt bestellen|Order now/i).first();
    await expect(orderBtn).toBeVisible({ timeout: 10_000 });
  });
});

// ── Admin SEO settings ─────────────────────────────────────────────────────────

test.describe("Admin SEO settings page", () => {
  test("SEO settings page is accessible", async ({ page }) => {
    await loginAsAdmin(page);
    await page.goto(`${BASE}/admin/settings/seo`);
    await expect(page.locator("h2").filter({ hasText: /SEO/i }).first()).toBeVisible({ timeout: 10_000 });
  });

  test("SEO settings page has meta description fields", async ({ page }) => {
    await loginAsAdmin(page);
    await page.goto(`${BASE}/admin/settings/seo`);
    await expect(page.locator('textarea[name="metaDescription"]')).toBeVisible({ timeout: 10_000 });
  });

  test("SEO settings page has OG image uploaders", async ({ page }) => {
    await loginAsAdmin(page);
    await page.goto(`${BASE}/admin/settings/seo`);
    await expect(page.locator("text=OG image").first()).toBeVisible({ timeout: 10_000 });
  });
});

// ── Admin Cron settings ────────────────────────────────────────────────────────

test.describe("Admin Cron settings page", () => {
  test("cron page shows job descriptions table", async ({ page }) => {
    await loginAsAdmin(page);
    await page.goto(`${BASE}/admin/settings/cron`);
    await expect(page.locator("text=sitemap").first()).toBeVisible({ timeout: 10_000 });
    await expect(page.locator("text=What the Cron Does").first()).toBeVisible({ timeout: 10_000 });
  });

  test("cron page shows activation instructions", async ({ page }) => {
    await loginAsAdmin(page);
    await page.goto(`${BASE}/admin/settings/cron`);
    await expect(page.locator("text=How to Activate").first()).toBeVisible({ timeout: 10_000 });
  });
});

// ── Admin General settings (favicon) ──────────────────────────────────────────

test.describe("Admin General settings favicon", () => {
  test("general settings page has favicon upload section", async ({ page }) => {
    await loginAsAdmin(page);
    await page.goto(`${BASE}/admin/settings`);
    await expect(page.locator("text=Favicon").first()).toBeVisible({ timeout: 10_000 });
  });

  test("general settings page has link to SEO settings", async ({ page }) => {
    await loginAsAdmin(page);
    await page.goto(`${BASE}/admin/settings`);
    await expect(page.locator("a").filter({ hasText: /SEO Settings/i }).first()).toBeVisible({ timeout: 10_000 });
  });
});

// ── SEO meta tags on static pages ─────────────────────────────────────────────

test.describe("SEO meta tags", () => {
  test("homepage has meta description", async ({ page }) => {
    await page.goto(`${BASE}/de`);
    const desc = await page.locator('meta[name="description"]').getAttribute("content");
    expect(desc?.length ?? 0).toBeGreaterThan(10);
  });

  test("homepage has og:title", async ({ page }) => {
    await page.goto(`${BASE}/de`);
    const ogTitle = await page.locator('meta[property="og:title"]').getAttribute("content");
    expect(ogTitle?.length ?? 0).toBeGreaterThan(0);
  });

  test("homepage has twitter:card meta", async ({ page }) => {
    await page.goto(`${BASE}/de`);
    const twitterCard = await page.locator('meta[name="twitter:card"]').getAttribute("content");
    expect(twitterCard).toBe("summary_large_image");
  });
});
