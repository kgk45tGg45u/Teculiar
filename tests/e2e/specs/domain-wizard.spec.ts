import { test, expect } from "@playwright/test";

// Domain-setup wizard E2E (Phase 4.6f). Runs against a TENANT admin on the multi-tenant stack, e.g.:
//   E2E_BASE_URL=https://dezhost.teculiar.net E2E_API_URL=https://dezhost.teculiar.net/api/v1 \
//   npx playwright test domain-wizard --project=chromium --workers=1
// Auth: real UI credentials (E2E_ADMIN_EMAIL/PASSWORD) — multi-tenant JWT secrets are per-tenant, so
// the self-signed-token trick used by older specs cannot work here.
// Safety: uses a reserved-by-IANA hostname (…example.com), so the DNS-TXT verification can never
// accidentally pass and the row stays inert/pending on the control-plane.

const BASE = (process.env.E2E_BASE_URL ?? "http://127.0.0.1:3000").replace(/\/$/, "");
const EMAIL = process.env.E2E_ADMIN_EMAIL ?? "";
const PASSWORD = process.env.E2E_ADMIN_PASSWORD ?? "";
const TEST_DOMAIN = "e2e-wizard.example.com";

test.describe("domain-setup wizard", () => {
  test.skip(!EMAIL || !PASSWORD, "E2E_ADMIN_EMAIL / E2E_ADMIN_PASSWORD not set");

  test("plan → register hosts → pending rows with TXT → verify correctly refuses", async ({ page }) => {
    // UI login (admin scope).
    await page.goto(`${BASE}/admin/login`);
    await page.fill('input[name="email"]', EMAIL);
    await page.fill('input[name="password"]', PASSWORD);
    await Promise.all([
      page.waitForURL(/\/admin(?!\/login)/, { timeout: 30000 }),
      page.click('button[type="submit"]')
    ]);

    // The wizard page.
    await page.goto(`${BASE}/admin/domains`);
    await expect(page.locator("h2")).toContainText(/Domains|Einrichtung/i, { timeout: 20000 });

    // Choose: own website on the apex + subdomains + a custom client label.
    await page.fill('input[placeholder*="domain"], input[placeholder*="ihredomain"]', TEST_DOMAIN);
    await page.locator('input[name="apexMode"][value="external"]').check();
    await page.locator('input[name="dashboards"][value="subdomains"]').check();
    await page.fill('input[placeholder="client"]', "portal");

    // apex_paths must be disabled with an external apex (O-2 rule enforced in the UI).
    await expect(page.locator('input[name="dashboards"][value="apex_paths"]')).toBeDisabled();

    // Generate: saves the plan + registers portal.<domain> and admin.<domain> as pending.
    await page.locator("button", { hasText: /Save plan|Plan speichern/i }).click();
    await expect(page.locator("table")).toContainText(`portal.${TEST_DOMAIN}`, { timeout: 20000 });
    await expect(page.locator("table")).toContainText(`admin.${TEST_DOMAIN}`);
    // Ownership TXT records are shown for pending rows.
    await expect(page.locator("table")).toContainText("_teculiar-verify.");
    // DNS instructions point at the edge.
    await expect(page.locator("table")).toContainText(/CNAME|A /);

    // Verify must NOT activate (the TXT record cannot exist for example.com).
    const row = page.locator("tr", { hasText: `portal.${TEST_DOMAIN}` });
    await row.locator("button", { hasText: /Verify|Prüfen/i }).click();
    await expect(row).toContainText(/Waiting for DNS|Wartet auf DNS/i, { timeout: 20000 });
  });
});
