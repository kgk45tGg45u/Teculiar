import { expect, test } from "@playwright/test";

const BASE = process.env.PLAYWRIGHT_BASE_URL ?? "http://127.0.0.1:3000";

test("admin login uses browser language when no locale cookie exists", async ({ page }) => {
  await page.setExtraHTTPHeaders({ "Accept-Language": "en-US,en;q=0.9" });
  await page.goto(`${BASE}/admin/login`);

  const card = page.locator("main");
  await expect(card.getByRole("heading", { name: "Admin Login" })).toBeVisible();
  await expect(card.locator('[name="email"]')).toBeVisible();
  await expect(card.locator('[name="password"]')).toBeVisible();
  // Should be in English
  await expect(card).not.toContainText(/Passwort|Bitte warten|Ersten Admin/);
});

test("admin login uses stored German locale consistently", async ({ context, page }) => {
  await context.addCookies([{ name: "dezhost_locale", value: "de", domain: "127.0.0.1", path: "/" }]);
  await page.goto(`${BASE}/admin/login`);

  const card = page.locator("main");
  await expect(card.getByRole("heading", { name: "Admin-Anmeldung" })).toBeVisible();
  await expect(card.locator('[name="email"]')).toBeVisible();
  await expect(card.locator('[name="password"]')).toBeVisible();
  // Should be in German
  await expect(card).not.toContainText(/Password|Please wait|First admin|Create admin/);
});

test("admin login input fields and key UX elements are present", async ({ page }) => {
  await page.setExtraHTTPHeaders({ "Accept-Language": "en-US,en;q=0.9" });
  await page.goto(`${BASE}/admin/login`);

  // Logo icon
  await expect(page.locator("main")).toContainText("D");

  // Heading
  await expect(page.getByRole("heading", { name: "Admin Login" })).toBeVisible();

  // Subtitle
  await expect(page.locator("main")).toContainText(/credentials/i);

  // Email and password inputs
  await expect(page.locator('[name="email"]')).toBeVisible();
  await expect(page.locator('[name="password"]')).toBeVisible();

  // Forgot password link
  await expect(page.locator("text=Forgot password?")).toBeVisible();

  await expect(page.getByRole("button", { name: /Sign in/i })).toBeVisible();

  // Font weight of input stays stable after autofill
  await page.fill('[name="email"]', "autofill@example.test");
  const before = await page.locator('[name="email"]').evaluate((input) => getComputedStyle(input).fontWeight);
  await page.click("main");
  const afterClick = await page.locator('[name="email"]').evaluate((input) => getComputedStyle(input).fontWeight);
  expect(afterClick).toBe(before);
});

test("client login page renders correctly", async ({ page }) => {
  await page.setExtraHTTPHeaders({ "Accept-Language": "en-US,en;q=0.9" });
  await page.goto(`${BASE}/login`);

  // Heading
  await expect(page.getByRole("heading", { name: /Login to your account/i })).toBeVisible();

  // Email, password, remember me, forgot password
  await expect(page.locator('[name="email"]')).toBeVisible();
  await expect(page.locator('[name="password"]')).toBeVisible();
  await expect(page.locator("text=Remember me")).toBeVisible();
  await expect(page.locator("text=Forgot password?")).toBeVisible();

  // Sign in button
  await expect(page.getByRole("button", { name: /Sign in/i })).toBeVisible();
});

test("forgot password modal works on client login", async ({ page }) => {
  await page.setExtraHTTPHeaders({ "Accept-Language": "en-US,en;q=0.9" });
  await page.goto(`${BASE}/login`);

  await page.click("text=Forgot password?");

  // Forgot password view should appear
  await expect(page.getByRole("heading", { name: /Reset your password/i })).toBeVisible();
  await expect(page.locator('[name="resetEmail"]')).toBeVisible();
  await expect(page.locator("text=Back to login")).toBeVisible();

  // Can go back
  await page.click("text=Back to login");
  await expect(page.getByRole("heading", { name: /Login to your account/i })).toBeVisible();
});

test("remember me checkbox is interactive", async ({ page }) => {
  await page.goto(`${BASE}/login`);

  const checkbox = page.locator('[type="checkbox"]');
  await expect(checkbox).not.toBeChecked();
  await checkbox.check();
  await expect(checkbox).toBeChecked();
  await checkbox.uncheck();
  await expect(checkbox).not.toBeChecked();
});

test("password eye toggle shows and hides password", async ({ page }) => {
  await page.goto(`${BASE}/login`);

  const pwd = page.locator('[name="password"]');
  await expect(pwd).toHaveAttribute("type", "password");

  // Click eye button
  await page.locator('[aria-label*="password" i]').click();
  await expect(pwd).toHaveAttribute("type", "text");

  await page.locator('[aria-label*="password" i]').click();
  await expect(pwd).toHaveAttribute("type", "password");
});
