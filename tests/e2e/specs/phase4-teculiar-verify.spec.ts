/**
 * Production verification for master-plan Phase 4 (teculiar.com go-live).
 *
 * PREREQUISITES (see docs/teculiar-master-plan.md → Verify (Phase 4) runbook):
 *   - app deployed (pricingTable element + tecreator lifecycle routing + seed CLIs in the image)
 *   - the `teculiar` tenant provisioned (bootstrap-tenant.js teculiar …)
 *   - catalog + content seeded:  seed-teculiar-plan.js teculiar
 *                                seed-teculiar-pages.js teculiar --publish
 *   - teculiar.com registered (register-domain.js teculiar.com teculiar apex active) + DNS at the
 *     Caddy edge. If your local resolver lags, set E2E_EDGE_IP=195.201.252.12 to pin the host.
 *
 * Run:
 *   set -a && source .env && set +a
 *   npx playwright test tests/e2e/specs/phase4-teculiar-verify.spec.ts --project=chromium --workers=1
 *
 * Covers: home renders the authored marketing layout (hero, features, pricing table with the
 * featured Teculiar plan, FAQ) in de with the seeded meta description; the plan CTA leads to the
 * order page of the seeded product; /admin + /client load same-origin; storefront settings resolve.
 * The full purchase → tenant-provisioned flow needs a PayPal sandbox (master plan 6.3) and stays a
 * manual/operator check for now.
 */
import { expect, test } from "@playwright/test";

const TECULIAR = (process.env.E2E_TECULIAR_URL ?? "https://teculiar.com").replace(/\/$/, "");
const EDGE_IP = process.env.E2E_EDGE_IP ?? "";

if (EDGE_IP) {
  const host = new URL(TECULIAR).hostname;
  test.use({
    launchOptions: { args: [`--host-resolver-rules=MAP ${host} ${EDGE_IP}, MAP www.${host} ${EDGE_IP}`] }
  });
}

test.describe("Phase 4 — teculiar.com go-live", () => {
  test("home renders the authored marketing page with the pricing table", async ({ page }) => {
    await page.goto(`${TECULIAR}/de`, { waitUntil: "domcontentloaded" });

    // Hero + feature grid from the authored layout (de main locale).
    await expect(page.getByRole("heading", { name: /eigenen Marke/i })).toBeVisible();
    await expect(page.getByRole("heading", { name: /Eine Plattform, das ganze Geschäft/i })).toBeVisible();

    // Pricing table: the featured Teculiar plan with a locale-formatted monthly price + badge.
    await expect(page.getByRole("heading", { name: /Ein Tarif, alles inklusive/i })).toBeVisible();
    await expect(page.getByText(/€/).first()).toBeVisible();
    await expect(page.getByText(/\/Monat/).first()).toBeVisible();

    // FAQ present.
    await expect(page.getByText(/Häufige Fragen/i)).toBeVisible();
  });

  test("seeded meta description is emitted (Phase 1.6 helper on the authored page)", async ({ page }) => {
    await page.goto(`${TECULIAR}/de`, { waitUntil: "domcontentloaded" });
    const description = await page.locator('meta[name="description"]').getAttribute("content");
    expect(description ?? "").toMatch(/Plattform/i);
  });

  test("pricing CTA leads to the Teculiar-plan order page", async ({ page }) => {
    await page.goto(`${TECULIAR}/de`, { waitUntil: "domcontentloaded" });
    const cta = page.getByRole("link", { name: /Jetzt starten/i }).first();
    await expect(cta).toBeVisible();
    const href = await cta.getAttribute("href");
    expect(href ?? "").toMatch(/\/de\/(order\/|kontakt)/);
    if (href?.includes("/order/")) {
      await page.goto(`${TECULIAR}${href}`, { waitUntil: "domcontentloaded" });
      await expect(page.getByText(/Teculiar/i).first()).toBeVisible();
      await expect(page.locator("body")).not.toContainText(/404|not found/i);
    }
  });

  test("admin + client areas load same-origin", async ({ page }) => {
    const admin = await page.goto(`${TECULIAR}/admin`, { waitUntil: "domcontentloaded" });
    expect(admin?.status()).toBeLessThan(400);
    await expect(page.locator('input[name="email"]')).toBeVisible();
    expect(page.url()).toContain(new URL(TECULIAR).hostname);

    const client = await page.goto(`${TECULIAR}/client`, { waitUntil: "domcontentloaded" });
    expect(client?.status()).toBeLessThan(400);
    await expect(page.locator('input[name="email"]')).toBeVisible();
  });

  test("storefront settings resolve for the teculiar tenant", async ({ request }) => {
    const response = await request.get(`${TECULIAR}/api/v1/storefront/settings`);
    expect(response.ok()).toBeTruthy();
    const settings = await response.json();
    expect(JSON.stringify(settings)).toMatch(/teculiar/i);
  });
});
