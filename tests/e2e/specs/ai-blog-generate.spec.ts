/**
 * AI blog "Generate Now" end-to-end test.
 *
 * Reproduces the internal server error that occurred after the blog category/tag
 * locale migration was applied in code but not yet in the production database.
 * The migration `20260610120000_blog_category_tag_locale` fixes the root cause.
 *
 * Run against production:
 *   E2E_BASE_URL=https://www.dezhost.com \
 *   E2E_API_URL=https://www.dezhost.com/api/v1 \
 *   E2E_ADMIN_EMAIL=admin@solibox.net \
 *   E2E_ADMIN_PASSWORD=12341234BBbb \
 *   npx playwright test tests/e2e/specs/ai-blog-generate.spec.ts --project=chromium
 *
 * Run locally (servers must be running):
 *   npx playwright test tests/e2e/specs/ai-blog-generate.spec.ts --project=chromium
 */
import { expect, test } from "@playwright/test";

const BASE = (process.env.E2E_BASE_URL ?? process.env.PLAYWRIGHT_BASE_URL ?? "http://127.0.0.1:3000").replace(/\/$/, "");
const API_BASE = (process.env.E2E_API_URL ?? process.env.NEXT_PUBLIC_API_URL ?? "http://127.0.0.1:4000/api/v1").replace(/\/$/, "");
const ADMIN_EMAIL = process.env.E2E_ADMIN_EMAIL ?? "admin@dezhost.local";
const ADMIN_PASSWORD = process.env.E2E_ADMIN_PASSWORD ?? "";

const TOKEN_KEY = "dezhost_admin_access_token";

async function adminLogin(page: Parameters<typeof test>[1] extends (...args: infer A) => unknown ? A[0] : never) {
  await page.goto(`${BASE}/admin/login`);
  await page.fill('[name="email"]', ADMIN_EMAIL);
  await page.fill('[name="password"]', ADMIN_PASSWORD);
  const loginBtn = page.getByRole("button", { name: /^(Login|Anmelden|Sign in)$/i });
  await (await loginBtn.count() > 0 ? loginBtn : page.locator('button[type="submit"]').first()).click();
  await page.waitForURL(/\/admin(?!\/login)/, { timeout: 20_000 });
}

/** Reads the admin access token from localStorage, sessionStorage, or the cookie — whichever has it. */
async function getAdminToken(page: Parameters<typeof test>[1] extends (...args: infer A) => unknown ? A[0] : never): Promise<string> {
  return page.evaluate((key) => {
    const fromLocal = window.localStorage.getItem(key);
    const fromSession = window.sessionStorage.getItem(key);
    const fromCookie = document.cookie
      .split("; ")
      .find((c) => c.startsWith(key + "="))
      ?.split("=")
      .slice(1)
      .join("=");
    return decodeURIComponent(fromLocal ?? fromSession ?? fromCookie ?? "");
  }, TOKEN_KEY);
}

test.describe("AI Blog Generate endpoint", () => {
  test("POST /cms/admin/dev/ai-blog/generate returns 2xx (not 500)", async ({ page }) => {
    await adminLogin(page);
    const token = await getAdminToken(page);

    expect(token, "Admin token must be present — login may have failed").toBeTruthy();

    const response = await page.request.post(`${API_BASE}/cms/admin/dev/ai-blog/generate`, {
      headers: { Authorization: `Bearer ${token}` },
      timeout: 90_000  // Deepseek generation takes 20-60s
    });

    // Before the locale migration this returned 500 because the BlogCategory/BlogTag
    // tables were missing the `locale` column and compound unique index.
    expect(
      response.status(),
      `Expected 2xx from AI generate endpoint, got ${response.status()}. Body: ${await response.text()}`
    ).toBeLessThan(300);

    const body = await response.json() as { ok?: boolean; id?: string; title?: string };
    expect(body.ok, "Response body should have ok: true").toBe(true);
    expect(typeof body.id, "Response should include the created post id").toBe("string");
  });

  test("Generate Now button shows success result (not error) in the AI Content page", async ({ page }) => {
    await adminLogin(page);
    await page.goto(`${BASE}/admin/blog/ai-content`);

    const generateBtn = page.getByRole("button", { name: /generate now/i });
    await expect(generateBtn).toBeVisible({ timeout: 10_000 });

    await generateBtn.click();

    // The component renders result inline as a <p> once the async call completes.
    // Success: text starts with `Generated: "…"`
    // Failure: text starts with `Error: …`
    // Allow generous time — AI generation hits Deepseek and writes to DB.
    const resultPara = page.locator("p").filter({ hasText: /^(Generated:|Error:)/i });
    await expect(resultPara).toBeVisible({ timeout: 90_000 });

    const resultText = await resultPara.textContent() ?? "";
    expect(
      resultText,
      `Expected a success result but got: "${resultText}"`
    ).toMatch(/^Generated:/i);
  });

  test("AI blog generate endpoint rejects unauthenticated requests with 401", async ({ page }) => {
    const response = await page.request.post(`${API_BASE}/cms/admin/dev/ai-blog/generate`);
    expect(response.status()).toBe(401);
  });
});
