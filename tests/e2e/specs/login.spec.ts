import { expect, test } from "@playwright/test";

const BASE = process.env.PLAYWRIGHT_BASE_URL ?? "http://127.0.0.1:3000";

test("admin login uses browser language when no locale cookie exists", async ({ page }) => {
  await page.setExtraHTTPHeaders({ "Accept-Language": "en-US,en;q=0.9" });
  await page.goto(`${BASE}/admin/login`);

  const card = page.locator("main section");
  await expect(card.getByRole("heading", { name: "Admin Login" })).toBeVisible();
  await expect(card.locator('[name="email"]')).toBeVisible();
  await expect(card.locator('[name="password"]')).toBeVisible();
  await expect(card).toContainText("Email");
  await expect(card).toContainText("Password");
  await expect(card).not.toContainText(/Passwort|Bitte warten|Ersten Admin|Anmelden/);
});

test("admin login uses stored German locale consistently", async ({ context, page }) => {
  await context.addCookies([{ name: "dezhost_locale", value: "de", domain: "127.0.0.1", path: "/" }]);
  await page.goto(`${BASE}/admin/login`);

  const card = page.locator("main section");
  await expect(card.getByRole("heading", { name: "Admin-Anmeldung" })).toBeVisible();
  await expect(card.locator('[name="email"]')).toBeVisible();
  await expect(card.locator('[name="password"]')).toBeVisible();
  await expect(card).toContainText("E-Mail");
  await expect(card).toContainText("Passwort");
  await expect(card).not.toContainText(/Password|Please wait|First admin|Create admin/);
});

test("admin login spacing and input font weight stay stable", async ({ page }) => {
  await page.setExtraHTTPHeaders({ "Accept-Language": "en-US,en;q=0.9" });
  await page.goto(`${BASE}/admin/login`);

  const spacing = await page.evaluate(() => {
    const card = document.querySelector("main section");
    const eyebrow = card?.querySelector(".eyebrow")?.getBoundingClientRect();
    const heading = card?.querySelector("h1")?.getBoundingClientRect();
    const emailLabel = card?.querySelector("form label")?.getBoundingClientRect();
    if (!eyebrow || !heading || !emailLabel) return null;
    return {
      clientToLogin: heading.top - eyebrow.bottom,
      loginToEmail: emailLabel.top - heading.bottom
    };
  });
  expect(spacing).not.toBeNull();
  expect(spacing!.loginToEmail).toBeLessThan(spacing!.clientToLogin);

  await page.fill('[name="email"]', "autofill@example.test");
  const before = await page.locator('[name="email"]').evaluate((input) => getComputedStyle(input).fontWeight);
  await page.click("main");
  const afterPageClick = await page.locator('[name="email"]').evaluate((input) => getComputedStyle(input).fontWeight);
  await page.locator('[name="email"]').click();
  const afterInputClick = await page.locator('[name="email"]').evaluate((input) => getComputedStyle(input).fontWeight);

  expect(afterPageClick).toBe(before);
  expect(afterInputClick).toBe(before);
});
