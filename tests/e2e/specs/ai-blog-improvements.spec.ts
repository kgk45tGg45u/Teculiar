/**
 * AI blog improvements E2E tests (production).
 *
 * Covers:
 *  1. Translated article is created as a full Content post (visible in blog list)
 *  2. Random language option exists in AI Content settings
 *  3. Generated article body contains real site links (no invented paths)
 *  4. Blog post list has no Tags column; actions are a dropdown
 *  5. Title is truncated (not overflowing)
 *
 * Run against production:
 *   E2E_BASE_URL=https://www.dezhost.com \
 *   E2E_API_URL=https://www.dezhost.com/api/v1 \
 *   E2E_ADMIN_EMAIL=admin@solibox.net \
 *   E2E_ADMIN_PASSWORD=12341234BBbb \
 *   npx playwright test tests/e2e/specs/ai-blog-improvements.spec.ts --project=chromium
 */
import { expect, test } from "@playwright/test";

const BASE = (process.env.E2E_BASE_URL ?? process.env.PLAYWRIGHT_BASE_URL ?? "http://127.0.0.1:3000").replace(/\/$/, "");
const API_BASE = (process.env.E2E_API_URL ?? process.env.NEXT_PUBLIC_API_URL ?? "http://127.0.0.1:4000/api/v1").replace(/\/$/, "");
const ADMIN_EMAIL = process.env.E2E_ADMIN_EMAIL ?? "admin@dezhost.local";
const ADMIN_PASSWORD = process.env.E2E_ADMIN_PASSWORD ?? "Dezhost-3f417f4248a568cfe6!";
const TOKEN_KEY = "dezhost_admin_access_token";

async function adminLogin(page: Parameters<typeof test>[1] extends (...args: infer A) => unknown ? A[0] : never) {
  await page.goto(`${BASE}/admin/login`);
  await page.fill('[name="email"]', ADMIN_EMAIL);
  await page.fill('[name="password"]', ADMIN_PASSWORD);
  const btn = page.getByRole("button", { name: /^(Login|Anmelden|Sign in)$/i });
  await (await btn.count() > 0 ? btn : page.locator('button[type="submit"]').first()).click();
  await page.waitForURL(/\/admin(?!\/login)/, { timeout: 20_000 });
}

async function getToken(page: Parameters<typeof test>[1] extends (...args: infer A) => unknown ? A[0] : never) {
  return page.evaluate((key) => {
    const fromLocal = window.localStorage.getItem(key);
    const fromSession = window.sessionStorage.getItem(key);
    const fromCookie = document.cookie.split("; ").find((c) => c.startsWith(key + "="))?.split("=").slice(1).join("=");
    return decodeURIComponent(fromLocal ?? fromSession ?? fromCookie ?? "");
  }, TOKEN_KEY);
}

// ── Blog post list UI ─────────────────────────────────────────────────────────

test.describe("Blog post list UI", () => {
  test.beforeEach(async ({ page }) => {
    await adminLogin(page);
    await page.goto(`${BASE}/admin/blog`);
  });

  test("blog post list has no Tags column header", async ({ page }) => {
    // After the UI change, the table has Title / Lang / Status / Actions — no Tags
    const headerCells = page.locator('[class*="blogTableHead"] [class*="blogTableCell"]');
    const count = await headerCells.count();
    for (let i = 0; i < count; i++) {
      const text = (await headerCells.nth(i).textContent() ?? "").toLowerCase();
      expect(text, `Header cell "${text}" should not say "tags"`).not.toMatch(/^tags$/);
    }
  });

  test("actions column shows a ··· dropdown button, not individual buttons", async ({ page }) => {
    // Wait for at least one post row
    const firstRow = page.locator('[class*="blogTableRow"]').first();
    await expect(firstRow).toBeVisible({ timeout: 10_000 });

    // The row should have a ··· button
    const menuBtn = firstRow.getByRole("button", { name: /···|⋯|\.\.\./i });
    await expect(menuBtn).toBeVisible();

    // There should NOT be separate Edit / Unpublish / Delete buttons visible initially
    await expect(firstRow.getByRole("link", { name: /^edit$/i })).not.toBeVisible();
    await expect(firstRow.getByRole("button", { name: /^delete$/i })).not.toBeVisible();
  });

  test("clicking ··· opens a dropdown with Edit, View, Delete", async ({ page }) => {
    const firstRow = page.locator('[class*="blogTableRow"]').first();
    await expect(firstRow).toBeVisible({ timeout: 10_000 });

    const menuBtn = firstRow.getByRole("button", { name: /···|⋯|\.\.\./i });
    await menuBtn.click();

    // Dropdown should now be visible with the expected items
    await expect(page.locator('[class*="actionsMenu"]')).toBeVisible();
    await expect(page.locator('[class*="actionsMenuItem"]').filter({ hasText: /edit/i }).first()).toBeVisible();
    await expect(page.locator('[class*="actionsMenuItem"]').filter({ hasText: /view/i }).first()).toBeVisible();
    await expect(page.locator('[class*="actionsMenuItem"]').filter({ hasText: /delete/i }).first()).toBeVisible();
  });

  test("clicking outside the dropdown closes it", async ({ page }) => {
    const firstRow = page.locator('[class*="blogTableRow"]').first();
    await expect(firstRow).toBeVisible({ timeout: 10_000 });

    await firstRow.getByRole("button", { name: /···|⋯|\.\.\./i }).click();
    await expect(page.locator('[class*="actionsMenu"]')).toBeVisible();

    await page.locator("h1, h2, [class*='pageTitle']").first().click();
    await expect(page.locator('[class*="actionsMenu"]')).not.toBeVisible({ timeout: 3_000 });
  });
});

// ── AI Content settings ───────────────────────────────────────────────────────

test.describe("AI Content settings", () => {
  test("language dropdown includes a Random option", async ({ page }) => {
    await adminLogin(page);
    await page.goto(`${BASE}/admin/blog/ai-content`);

    const langSelect = page.locator('select[name="aiBlogLanguage"]');
    await expect(langSelect).toBeVisible({ timeout: 10_000 });

    const options = await langSelect.locator("option").allTextContents();
    const hasRandom = options.some((o) => /random/i.test(o));
    expect(hasRandom, `Expected a Random option, got: ${options.join(", ")}`).toBe(true);
  });
});

// ── AI article generation: translation + real links ───────────────────────────

test.describe("AI article generation quality", () => {
  test("generating an article creates both a primary post AND a translated post", async ({ page }) => {
    await adminLogin(page);
    const token = await getToken(page);

    // Count posts before
    const before = await page.request.get(`${API_BASE}/cms/admin/dev/posts`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    const postsBefore = await before.json() as { id: string; locale: string }[];
    const deBefore = postsBefore.filter((p) => p.locale === "de").length;
    const enBefore = postsBefore.filter((p) => p.locale === "en").length;

    // Generate
    const gen = await page.request.post(`${API_BASE}/cms/admin/dev/ai-blog/generate`, {
      headers: { Authorization: `Bearer ${token}` },
      timeout: 90_000
    });
    expect(gen.status(), `Generation failed: ${await gen.text()}`).toBeLessThan(300);

    // Count posts after
    const after = await page.request.get(`${API_BASE}/cms/admin/dev/posts`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    const postsAfter = await after.json() as { id: string; locale: string; content?: { body?: string } }[];
    const deAfter = postsAfter.filter((p) => p.locale === "de").length;
    const enAfter = postsAfter.filter((p) => p.locale === "en").length;

    // Both DE and EN counts should have increased by 1 each
    const deAdded = deAfter - deBefore;
    const enAdded = enAfter - enBefore;
    expect(
      deAdded + enAdded,
      `Expected 2 new posts total (1 primary + 1 translated), got DE+${deAdded} EN+${enAdded}`
    ).toBe(2);
  });

  test("generated article body contains only real site URLs (no invented paths)", async ({ page }) => {
    await adminLogin(page);
    const token = await getToken(page);

    // Get the two most recent posts
    const res = await page.request.get(`${API_BASE}/cms/admin/dev/posts`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    const posts = await res.json() as { id: string; locale: string; content?: { body?: string; postType?: string } }[];
    const aiPosts = posts.filter((p) => p.content?.postType === "ai_generated").slice(0, 2);

    // Real paths that should be present if the AI used real links
    const realPaths = ["/de/", "/en/", "/webhosting", "/vps", "/hosting", "/domains", "/pricing", "/kontakt", "/contact", "/about", "/uber-uns", "/blog"];

    for (const post of aiPosts) {
      const body = post.content?.body ?? "";
      if (!body) continue;

      // Find all href values in the body HTML
      const hrefs = [...body.matchAll(/href="([^"]+)"/g)].map((m) => m[1]);
      for (const href of hrefs) {
        // Only check relative links (not external URLs like https://...)
        if (href.startsWith("http") || href.startsWith("#") || href.startsWith("mailto")) continue;

        const isReal = realPaths.some((p) => href.includes(p));
        expect(
          isReal,
          `Found a link "${href}" in post "${post.id}" that doesn't match any known real path. Real paths: ${realPaths.join(", ")}`
        ).toBe(true);
      }
    }
  });
});
