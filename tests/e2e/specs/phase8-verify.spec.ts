/**
 * Production verification for master-plan Phase 8 (self-hosting wind-down, upload isolation, SEO).
 *
 *   - 8.1 wizard: the domain wizard offers only `external` + `blue_hosted`; the `blue_selfhosted`
 *     radio and the `get.teculiar.com` install command are gone.
 *   - 8.3 sitemap: /sitemap.xml is well-formed, carries the XSL stylesheet PI, and /sitemap.xsl serves.
 *
 * 8.2 (upload tenant-isolation) is unit-verified in apps/api/test/uploads-isolation.test.mjs — the
 * serving-guard decision + host→tenant resolution. A live cross-tenant read needs two tenants with
 * uploaded files and is not exercised here.
 *
 * Run against the live host (dezhost admin is agent-role on prod — it can VIEW /admin/domains):
 *   set -a && source .env && set +a
 *   E2E_BASE_URL=https://www.dezhost.com E2E_API_URL=https://www.dezhost.com/api/v1 \
 *   npx playwright test tests/e2e/specs/phase8-verify.spec.ts --project=chromium --workers=1
 */
import { expect, test } from "@playwright/test";

const BASE = (process.env.E2E_BASE_URL ?? "http://127.0.0.1:3001").replace(/\/$/, "");
const ADMIN_EMAIL = process.env.E2E_ADMIN_EMAIL ?? "";
const ADMIN_PASSWORD = process.env.E2E_ADMIN_PASSWORD ?? "";

test.describe("Phase 8 — prod verification", () => {
  test("8.3 sitemap.xml is well-formed and references the XSL stylesheet", async ({ request }) => {
    const res = await request.get(`${BASE}/sitemap.xml`);
    expect(res.status()).toBe(200);
    expect(res.headers()["content-type"] ?? "").toContain("xml");
    const body = await res.text();
    expect(body).toContain('<?xml version="1.0" encoding="UTF-8"?>');
    expect(body).toContain('<?xml-stylesheet type="text/xsl" href="/sitemap.xsl"?>');
    expect(body).toContain("<urlset");
    expect(body).toContain("<loc>");
    // No unescaped bare ampersand — every `&` must open a valid entity (Google rejects otherwise).
    expect(body).not.toMatch(/&(?!amp;|lt;|gt;|quot;|apos;|#)/);
    // No duplicate <loc> entries.
    const locs = [...body.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);
    expect(new Set(locs).size).toBe(locs.length);
  });

  test("8.3 sitemap.xsl serves as a stylesheet", async ({ request }) => {
    const res = await request.get(`${BASE}/sitemap.xsl`);
    expect(res.status()).toBe(200);
    expect(res.headers()["content-type"] ?? "").toMatch(/xsl|xml/);
    const body = await res.text();
    expect(body).toContain("xsl:stylesheet");
    expect(body).toContain("XML Sitemap");
  });

  test.describe("8.1 domain wizard", () => {
    test.skip(!ADMIN_EMAIL || !ADMIN_PASSWORD, "E2E_ADMIN_* env vars required");

    test("wizard hides self-hosting, keeps external + hosted, no install command", async ({ page }) => {
      await page.goto(`${BASE}/admin/login`, { waitUntil: "domcontentloaded" });
      await page.fill('input[name="email"]', ADMIN_EMAIL);
      await page.fill('input[name="password"]', ADMIN_PASSWORD);
      await Promise.all([
        page.waitForURL(/\/admin(?!\/login)/, { timeout: 30000 }),
        page.click('button[type="submit"]')
      ]);

      await page.goto(`${BASE}/admin/domains`, { waitUntil: "domcontentloaded" });
      // The two kept options render (language-independent radio values).
      await expect(page.locator('input[name="apexMode"][value="external"]')).toBeVisible({ timeout: 20000 });
      await expect(page.locator('input[name="apexMode"][value="blue_hosted"]')).toBeVisible();
      // The self-hosted radio is gone.
      await expect(page.locator('input[name="apexMode"][value="blue_selfhosted"]')).toHaveCount(0);
      // The install command (only rendered for self-hosting) never appears.
      await expect(page.locator("body")).not.toContainText("get.teculiar.com");
    });
  });
});
