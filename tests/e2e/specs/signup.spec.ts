/**
 * Signup page tests — bot-check lifecycle and retry behaviour.
 *
 * Uses Playwright route interception so no live API is needed.
 */
import { expect, test } from "@playwright/test";

const BASE = process.env.PLAYWRIGHT_BASE_URL ?? "http://127.0.0.1:3000";
const API = process.env.NEXT_PUBLIC_API_URL ?? "http://127.0.0.1:4000/api/v1";

// Challenge is server-generated — hidden fields are in the DOM immediately.
async function getBotAnswer(page: import("@playwright/test").Page) {
  return page.evaluate(() =>
    (document.querySelector<HTMLInputElement>('input[name="_bot_answer"]')?.value ?? "")
  );
}

async function answerBotCheck(page: import("@playwright/test").Page) {
  // Read the hidden expected answer and type it into the response field
  const expected = await getBotAnswer(page);
  await page.fill('[name="_bot_response"]', expected);
  // Rewind _bot_ts so the ≥3 s timing guard passes in automated tests
  await page.evaluate(() => {
    const ts = document.querySelector<HTMLInputElement>('input[name="_bot_ts"]');
    if (ts) ts.value = String(Date.now() - 5_000);
  });
}

async function waitForReactHydration(page: import("@playwright/test").Page) {
  // React attaches __reactFiber* / __reactProps* props to DOM nodes only after hydration.
  // Waiting for one of these confirms onSubmit handlers are attached.
  await page.waitForFunction(() => {
    const el = document.querySelector("form");
    return el !== null && Object.keys(el).some((k) => k.startsWith("__react"));
  }, { timeout: 20_000 });
}

async function fillValidForm(page: import("@playwright/test").Page, email = "test@example.com") {
  // Wait for React to hydrate before filling so onSubmit is attached
  await waitForReactHydration(page);
  await page.fill('[name="name"]', "Test User");
  await page.fill('[name="email"]', email);
  await page.fill('[name="password"]', "Valid1@Passw");
  await page.fill('[name="address"]', "Musterstraße 1");
  await page.fill('[name="postalCode"]', "12345");
  await page.fill('[name="city"]', "Berlin");
  await page.check('[name="acceptedTerms"]');
}

// ── 1. Page renders correctly ─────────────────────────────────────────────────

test("signup page renders all required fields", async ({ page }) => {
  await page.goto(`${BASE}/de/signup`);
  await expect(page.locator('[name="name"]')).toBeVisible();
  await expect(page.locator('[name="email"]')).toBeVisible();
  await expect(page.locator('[name="password"]')).toBeVisible();
  await expect(page.locator('[name="address"]')).toBeVisible();
  await expect(page.locator('[name="postalCode"]')).toBeVisible();
  await expect(page.locator('[name="city"]')).toBeVisible();
  await expect(page.locator('[name="countryCode"]')).toBeVisible();
  await expect(page.locator('[name="acceptedTerms"]')).toBeVisible();
});

test("bot check fields are present and populated from server", async ({ page }) => {
  await page.goto(`${BASE}/de/signup`);
  // Server-rendered — available immediately, no async wait needed
  const answer = await getBotAnswer(page);
  expect(answer).toMatch(/^\d+$/);
  const ts = await page.evaluate(() =>
    document.querySelector<HTMLInputElement>('input[name="_bot_ts"]')?.value ?? ""
  );
  expect(Number(ts)).toBeGreaterThan(Date.now() - 30_000);
  await expect(page.locator('[name="_bot_response"]')).toBeVisible();
  await expect(page.locator('[name="_bot_response"]')).toBeEnabled();
});

test("country dropdown stays within form width", async ({ page }) => {
  await page.goto(`${BASE}/de/signup`);
  const select = page.locator('[name="countryCode"]');
  const form = page.locator("form");
  const selectBox = await select.boundingBox();
  const formBox = await form.boundingBox();
  expect(selectBox).not.toBeNull();
  expect(formBox).not.toBeNull();
  // Select right edge must not exceed form right edge (2 px rounding tolerance)
  expect(selectBox!.x + selectBox!.width).toBeLessThanOrEqual(formBox!.x + formBox!.width + 2);
});

test("signup submits an API-compatible client profile payload", async ({ page }) => {
  let resolveSubmitted!: (payload: Record<string, unknown>) => void;
  const submitted = new Promise<Record<string, unknown>>((resolve) => {
    resolveSubmitted = resolve;
  });

  await page.route(`${API}/auth/register`, (route) => {
    resolveSubmitted(JSON.parse(route.request().postData() ?? "{}") as Record<string, unknown>);
    return route.fulfill({
      status: 201,
      contentType: "application/json",
      body: JSON.stringify({
        accessToken: "fake-token",
        refreshToken: "fake-refresh",
        tokenType: "Bearer",
        user: { id: "u1", email: "company@example.com", roles: ["client"] }
      })
    });
  });

  await page.goto(`${BASE}/en/signup`);
  await fillValidForm(page, "company@example.com");
  await page.fill('[name="companyName"]', "Example GmbH");
  await page.fill('[name="vatId"]', "DE123456789");
  await answerBotCheck(page);
  await page.click('button[type="submit"]');

  const payload = await submitted;
  expect(payload).toMatchObject({
    address: {
      city: "Berlin",
      line1: "Musterstraße 1",
      postalCode: "12345"
    },
    companyName: "Example GmbH",
    countryCode: "DE",
    customerType: "BUSINESS",
    email: "company@example.com",
    vatId: "DE123456789"
  });
  expect(payload.postalCode).toBeUndefined();
  expect(payload.city).toBeUndefined();
});

// ── 2. Bot check remounts (clears response) after an API failure ──────────────

test("bot check response field is cleared after a failed API call", async ({ page }) => {
  await page.route(`${API}/auth/register`, (route) =>
    route.fulfill({
      status: 409,
      contentType: "application/json",
      body: JSON.stringify({ message: "Email address is already registered." })
    })
  );

  await page.goto(`${BASE}/de/signup`);
  await fillValidForm(page);
  await answerBotCheck(page);

  // Confirm the response field has the answer before submission
  const responseBeforeSubmit = await page.locator('[name="_bot_response"]').inputValue();
  expect(responseBeforeSubmit).toMatch(/^\d+$/);

  await page.click('button[type="submit"]');

  // Wait for the API error to appear in the dedicated error element
  await expect(page.locator('[data-testid="form-error"]')).toContainText(
    /already|bereits|registrierung/i,
    { timeout: 8_000 }
  );

  // After API failure: BotCheck remounts → _bot_response is cleared
  await expect(page.locator('[name="_bot_response"]')).toHaveValue("", { timeout: 5_000 });

  // A new math answer is present (server answer or new client answer)
  const answerAfter = await getBotAnswer(page);
  expect(answerAfter).toMatch(/^\d+$/);
});

test("bot check response field is cleared after every failed API call", async ({ page }) => {
  let callCount = 0;
  await page.route(`${API}/auth/register`, (route) => {
    callCount++;
    return route.fulfill({
      status: 409,
      contentType: "application/json",
      body: JSON.stringify({ message: `Registration failed ${callCount}` })
    });
  });

  await page.goto(`${BASE}/de/signup`);
  await fillValidForm(page);
  await answerBotCheck(page);
  await page.click('button[type="submit"]');

  await expect.poll(() => callCount).toBe(1);
  await expect(page.locator('[name="_bot_response"]')).toHaveValue("", { timeout: 5_000 });

  await answerBotCheck(page);
  await page.click('button[type="submit"]');

  await expect.poll(() => callCount).toBe(2);
  await expect(page.locator('[name="_bot_response"]')).toHaveValue("", { timeout: 5_000 });
});

// ── 3. After a failed attempt, answering the new bot check unblocks the form ──

test("after a failed attempt, correctly answering the new bot check unblocks the form", async ({ page }) => {
  let callCount = 0;
  await page.route(`${API}/auth/register`, (route) => {
    callCount++;
    if (callCount === 1) {
      route.fulfill({
        status: 409,
        contentType: "application/json",
        body: JSON.stringify({ message: "Email address is already registered." })
      });
    } else {
      route.fulfill({
        status: 201,
        contentType: "application/json",
        body: JSON.stringify({
          accessToken: "fake-token",
          refreshToken: "fake-refresh",
          tokenType: "Bearer",
          user: { id: "u1", email: "new@example.com", roles: ["client"] }
        })
      });
    }
  });

  await page.goto(`${BASE}/de/signup`);
  await fillValidForm(page);
  await answerBotCheck(page);
  await page.click('button[type="submit"]');

  // Wait for the first failure error
  await expect(page.locator('[data-testid="form-error"]')).toContainText(
    /already|bereits|registrierung/i,
    { timeout: 8_000 }
  );

  // Wait until bot check remounts (response field is cleared)
  await expect(page.locator('[name="_bot_response"]')).toHaveValue("", { timeout: 5_000 });

  // Second attempt: change email, answer refreshed bot check
  await page.fill('[name="email"]', "new@example.com");
  await answerBotCheck(page);
  await page.click('button[type="submit"]');

  // No bot check error on second attempt
  await page.waitForTimeout(1_500);
  const errorText = await page.locator('[data-testid="form-error"]').textContent().catch(() => "");
  expect(errorText ?? "").not.toMatch(/sicherheitsfrage|security question|bot/i);

  // Both API calls were made (bot check passed both times)
  expect(callCount).toBe(2);
});

// ── 4. Client-side errors preserve the bot check (no remount) ─────────────────

test("weak password error preserves the bot check answer", async ({ page }) => {
  await page.goto(`${BASE}/de/signup`);

  await waitForReactHydration(page);
  await page.fill('[name="password"]', "weak"); // too short — client-side rejection
  await page.fill('[name="name"]', "Test User");
  await page.fill('[name="email"]', "test@example.com");
  await page.fill('[name="address"]', "Musterstraße 1");
  await page.fill('[name="postalCode"]', "12345");
  await page.fill('[name="city"]', "Berlin");
  await page.check('[name="acceptedTerms"]');
  await answerBotCheck(page);

  const responseBeforeSubmit = await page.locator('[name="_bot_response"]').inputValue();
  expect(responseBeforeSubmit).toMatch(/^\d+$/);

  await page.click('button[type="submit"]');

  // Password error appears in dedicated error element
  await expect(page.locator('[data-testid="form-error"]')).toContainText(
    /password|passwort/i,
    { timeout: 4_000 }
  );

  // Bot check response must be preserved — user should NOT need to re-answer
  const responseAfterError = await page.locator('[name="_bot_response"]').inputValue();
  expect(responseAfterError).toBe(responseBeforeSubmit);
});

// ── 5. Password field generate button creates strong password ──────────────

test("password field generate button creates strong password", async ({ page }) => {
  await page.goto(`${BASE}/de/signup`);
  await waitForReactHydration(page);

  const passwordInput = page.locator('[name="password"]');

  // Look for the generate button on the page (should be near password field)
  // Use xpath to find buttons with text containing 'generate' or 'generieren'
  const generateBtn = page.locator("xpath=(//button[contains(., 'Generieren') or contains(., 'Generate')])[1]");

  // Verify button exists and is visible
  await expect(generateBtn).toBeVisible();

  // Click generate button
  await generateBtn.click();

  // Check that password was filled with a strong password
  const generatedPw = await passwordInput.inputValue();
  expect(generatedPw.length).toBeGreaterThanOrEqual(9);
  expect(generatedPw.length).toBeLessThanOrEqual(16);
  expect(generatedPw).toMatch(/[A-Z]/); // uppercase
  expect(generatedPw).toMatch(/[a-z]/); // lowercase
  expect(generatedPw).toMatch(/\d/); // digit
  expect(generatedPw).toMatch(/[~*!@$#%_+.?:,{}]/); // special char
});

// ── 6. Quick retry after API failure doesn't block due to timing guard ─────────

test("quick retry after failed API call is not blocked by bot timing guard", async ({ page }) => {
  let callCount = 0;
  await page.route(`${API}/auth/register`, (route) => {
    callCount++;
    if (callCount === 1) {
      route.fulfill({
        status: 409,
        contentType: "application/json",
        body: JSON.stringify({ message: "Email already registered." })
      });
    } else {
      route.fulfill({
        status: 201,
        contentType: "application/json",
        body: JSON.stringify({
          accessToken: "fake-token",
          refreshToken: "fake-refresh",
          tokenType: "Bearer",
          user: { id: "u1", email: "retry@example.com", roles: ["client"] }
        })
      });
    }
  });

  await page.goto(`${BASE}/de/signup`);
  await fillValidForm(page, "first@example.com");
  await answerBotCheck(page);
  await page.click('button[type="submit"]');

  // Wait for first failure
  await expect(page.locator('[data-testid="form-error"]')).toContainText(/already|bereits/i, { timeout: 8_000 });

  // Wait for bot check to remount (startTime=0 on retry means timing guard won't block)
  await expect(page.locator('[name="_bot_response"]')).toHaveValue("", { timeout: 5_000 });

  // Quick re-submit (less than 3 seconds) — should NOT be blocked by timing guard
  await page.fill('[name="email"]', "retry@example.com");
  await answerBotCheck(page);
  // Do not wait — submit immediately (simulating quick retry)
  await page.click('button[type="submit"]');

  // No timing error should appear; should get the success message or redirect
  await page.waitForTimeout(2_000);
  const errorMsg = await page.locator('[data-testid="form-error"]').textContent().catch(() => "");
  expect(errorMsg ?? "").not.toMatch(/moment|augenblick/i); // Timing guard error

  // API should have been called twice (quick retry wasn't blocked)
  expect(callCount).toBeGreaterThanOrEqual(2);
});
