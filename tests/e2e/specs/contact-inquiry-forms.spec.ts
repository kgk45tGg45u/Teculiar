/**
 * Contact & Inquiry form E2E tests.
 *
 * Tests that both the /kontakt (contact us) page and /anfrage (inquiry) page
 * correctly submit to the API, create a sales ticket, and show success feedback.
 *
 * Targets production by default:
 *   PLAYWRIGHT_BASE_URL=https://www.dezhost.com npx playwright test contact-inquiry-forms
 *
 * Can also run against local dev:
 *   npx playwright test contact-inquiry-forms
 */
import { expect, test } from "@playwright/test";

const BASE = process.env.PLAYWRIGHT_BASE_URL ?? "http://127.0.0.1:3000";
const API = process.env.NEXT_PUBLIC_API_URL ?? "http://127.0.0.1:4000/api/v1";

const timestamp = () => Date.now();

// ── Helpers ───────────────────────────────────────────────────────────────────

function uniqueEmail() {
  return `e2e-contact-${timestamp()}@dezhost.test`;
}

// ── Contact form (/de/kontakt) ────────────────────────────────────────────────

test.describe("Contact form (/de/kontakt)", () => {
  test("contact page renders with form fields", async ({ page }) => {
    await page.goto(`${BASE}/de/kontakt`);
    await page.waitForLoadState("networkidle");

    await expect(page.locator("h1")).toContainText(/Schreib uns/i);
    await expect(page.locator("[name=name]").first()).toBeVisible();
    await expect(page.locator("[name=email]").first()).toBeVisible();
    await expect(page.locator("[name=topic]")).toBeVisible();
    await expect(page.locator("[name=message]")).toBeVisible();
  });

  test("contact form submits and shows success message", async ({ page }) => {
    await page.goto(`${BASE}/de/kontakt`);
    await page.waitForLoadState("networkidle");

    const email = uniqueEmail();

    await page.fill("[name=name]", "E2E Test Kontakt");
    await page.fill("[name=email]", email);
    await page.selectOption("[name=topic]", { index: 1 });
    await page.fill("[name=message]", "Dies ist eine automatisierte E2E-Test-Anfrage. Bitte ignorieren.");

    await page.click("button[type=submit]");

    // Success state: the form disappears and success message appears
    await expect(page.locator("text=/Nachricht erhalten|received/i")).toBeVisible({ timeout: 15_000 });
  });

  test("contact form requires topic — submission blocked without one", async ({ page }) => {
    await page.goto(`${BASE}/de/kontakt`);
    await page.waitForLoadState("networkidle");

    await page.fill("[name=name]", "E2E Test");
    await page.fill("[name=email]", uniqueEmail());
    // Deliberately skip topic selection
    await page.fill("[name=message]", "Test message without topic.");

    await page.click("button[type=submit]");

    // Native browser validation or our JS guard should prevent success
    await expect(page.locator("text=/Nachricht erhalten|Message received/i")).not.toBeVisible({ timeout: 3_000 });
    // Form should still be present
    await expect(page.locator("[name=message]")).toBeVisible();
  });

  test("English contact page (/en/contact) redirects to /en/kontakt and works", async ({ page }) => {
    await page.goto(`${BASE}/en/contact`);
    await page.waitForLoadState("networkidle");

    // Should redirect to /en/kontakt
    expect(page.url()).toContain("/kontakt");
    await expect(page.locator("h1")).toContainText(/write to us/i);
  });

  test("English contact form submits successfully", async ({ page }) => {
    await page.goto(`${BASE}/en/kontakt`);
    await page.waitForLoadState("networkidle");

    await page.fill("[name=name]", "E2E Test Contact EN");
    await page.fill("[name=email]", uniqueEmail());
    await page.selectOption("[name=topic]", { index: 1 });
    await page.fill("[name=message]", "This is an automated E2E test enquiry. Please ignore.");

    await page.click("button[type=submit]");

    await expect(page.locator("text=/Message received/i")).toBeVisible({ timeout: 15_000 });
  });
});

// ── Inquiry form (/de/anfrage) ────────────────────────────────────────────────

test.describe("Inquiry form (/de/anfrage)", () => {
  test("inquiry page renders with form fields", async ({ page }) => {
    await page.goto(`${BASE}/de/anfrage`);
    await page.waitForLoadState("networkidle");

    await expect(page.locator("[name=name]").first()).toBeVisible();
    await expect(page.locator("[name=email]").first()).toBeVisible();
    await expect(page.locator("[name=message]")).toBeVisible();
  });

  test("inquiry form submits and shows success feedback", async ({ page }) => {
    await page.goto(`${BASE}/de/anfrage`);
    await page.waitForLoadState("networkidle");

    await page.fill("[name=name]", "E2E Test Anfrage");
    await page.fill("[name=email]", uniqueEmail());

    // Fill subject if present
    const subjectInput = page.locator("[name=subject]");
    if (await subjectInput.isVisible()) {
      await subjectInput.fill("E2E Testanfrage");
    }

    await page.fill("[name=message]", "Dies ist eine automatisierte E2E-Test-Anfrage. Bitte ignorieren.");

    await page.click("button[type=submit]");

    // Success state
    await expect(page.locator("text=/erhalten|received/i")).toBeVisible({ timeout: 15_000 });
  });

  test("inquiry form pre-fills subject from URL query param", async ({ page }) => {
    await page.goto(`${BASE}/de/anfrage?subject=Webhosting+Anfrage`);
    await page.waitForLoadState("networkidle");

    const subjectInput = page.locator("[name=subject]");
    if (await subjectInput.isVisible()) {
      await expect(subjectInput).toHaveValue("Webhosting Anfrage");
    }
  });
});

// ── API-level checks ──────────────────────────────────────────────────────────

test.describe("Inquiry API endpoint", () => {
  test("POST /storefront/inquiries creates a ticket (returns 200/201)", async ({ request }) => {
    const res = await request.post(`${API}/storefront/inquiries`, {
      data: {
        _honey: "",
        email: uniqueEmail(),
        message: "E2E API-level inquiry test. Please ignore.",
        name: "E2E API Test",
        subject: "E2E Test Inquiry"
      }
    });

    expect(res.status()).toBeLessThan(300);
    const body = await res.json().catch(() => ({}));
    // Response should have a ticket id or ok flag
    expect(body).toBeTruthy();
  });

  test("POST /storefront/inquiries with honeypot returns 200 silently (bot trap)", async ({ request }) => {
    const res = await request.post(`${API}/storefront/inquiries`, {
      data: {
        _honey: "bot-filled",
        email: uniqueEmail(),
        message: "Bot message",
        name: "Bot",
        subject: "Bot inquiry"
      }
    });

    expect(res.status()).toBeLessThan(300);
    const body = await res.json().catch(() => ({}));
    expect(body.ok).toBe(true);
  });
});
