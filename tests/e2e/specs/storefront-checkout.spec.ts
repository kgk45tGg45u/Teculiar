/**
 * Storefront checkout E2E tests.
 *
 * Tests real user flows: browsing → product page → filling checkout form →
 * sandbox payment → redirect to client portal.
 *
 * Requires both the web server and API to be running.
 * Run: PLAYWRIGHT_START_SERVERS="" npx playwright test tests/e2e/specs/storefront-checkout.spec.ts
 */
import { expect, test } from "@playwright/test";

const BASE = process.env.PLAYWRIGHT_BASE_URL ?? "http://127.0.0.1:3000";
const API = process.env.NEXT_PUBLIC_API_URL ?? "http://127.0.0.1:4000/api/v1";

// Unique test credentials — timestamped to avoid conflicts between runs
const testEmail = () => `e2e-checkout-${Date.now()}@dezhost.test`;
const testPassword = "E2eTest9!aA";
const testName = "E2E Test User";

// ── Helpers ───────────────────────────────────────────────────────────────────

async function getFirstHostingProductUrl(page: import("@playwright/test").Page): Promise<string | null> {
  const response = await page.request.get(`${API}/products`);
  if (!response.ok()) return null;
  const products = await response.json() as Array<{ id: string; type: string; active: boolean }>;
  const hosting = products.find((p) => p.type === "SHARED_HOSTING" && p.active);
  return hosting ? `${BASE}/de/order/${hosting.id}` : null;
}

// ── Tests ─────────────────────────────────────────────────────────────────────

test.describe("Storefront checkout", () => {
  test("webhosting page renders and shows products", async ({ page }) => {
    await page.goto(`${BASE}/de/webhosting`);
    await page.waitForLoadState("networkidle");

    // Page should have product cards or product headings
    await expect(page.locator("main, [class*='main']").first()).not.toContainText("Internal Server Error");
    await expect(page.locator("body")).toContainText(/hosting|Hosting/i);
  });

  test("product order page loads correctly", async ({ page }) => {
    const orderUrl = await getFirstHostingProductUrl(page);
    if (!orderUrl) {
      test.skip(true, "No active hosting product found");
      return;
    }
    await page.goto(orderUrl);
    await page.waitForLoadState("networkidle");

    // Checkout form should be visible
    await expect(page.locator("form").first()).toBeVisible({ timeout: 8_000 });
    // Should have payment method section
    await expect(page.locator("body")).toContainText(/payment|Zahlung|method/i, { timeout: 8_000 });
    // Sandbox should be available (and auto-selected) since sandbox gateway is enabled
    await expect(page.locator("input[value='SANDBOX'], label").filter({ hasText: /sandbox/i }).first()).toBeVisible({ timeout: 8_000 });
  });

  test("Sandbox is the default selected payment method", async ({ page }) => {
    const orderUrl = await getFirstHostingProductUrl(page);
    if (!orderUrl) {
      test.skip(true, "No active hosting product found");
      return;
    }
    await page.goto(orderUrl);
    await page.waitForLoadState("networkidle");

    // The first payment option should be SANDBOX
    const firstPaymentInput = page.locator('input[type="radio"][value="SANDBOX"]');
    await expect(firstPaymentInput).toBeChecked({ timeout: 8_000 });
  });

  test("full checkout flow: new user, sandbox payment, redirect to portal", async ({ page }) => {
    const orderUrl = await getFirstHostingProductUrl(page);
    if (!orderUrl) {
      test.skip(true, "No active hosting product found");
      return;
    }

    const email = testEmail();
    await page.goto(orderUrl);
    await page.waitForLoadState("networkidle");

    // Fill hosting domain if needed
    const domainInput = page.locator('input[name="hostingDomainName"], input[name="domainName"]');
    if (await domainInput.count() > 0) {
      await domainInput.first().fill(`test-${Date.now()}.example.com`);
    }

    // Fill personal data
    await page.fill('[name="name"]', testName);
    await page.fill('[name="email"]', email);
    await page.fill('[name="password"]', testPassword);
    await page.fill('[name="phoneCountryCode"]', "+49");
    await page.fill('[name="phone"]', "1234567890");
    await page.fill('[name="address"]', "Test Str. 1");
    await page.fill('[name="postalCode"]', "10115");
    await page.fill('[name="city"]', "Berlin");
    await page.fill('[name="state"]', "Berlin");

    // Make sure Sandbox is selected
    const sandboxRadio = page.locator('input[type="radio"][value="SANDBOX"]');
    if (await sandboxRadio.count() > 0) {
      await sandboxRadio.click();
    }

    // Accept terms
    await page.check('[name="acceptedTerms"]');

    // Submit
    await page.click('button[type="submit"]');

    // Should redirect to /client after successful checkout
    await page.waitForURL(/\/client/, { timeout: 30_000 });
    await expect(page).toHaveURL(/\/client/);

    // Client portal should be visible (user was auto-logged-in)
    await expect(page.locator("main, body").first()).not.toContainText("Error");
  });

  test("payment gateway errors are shown with context prefix", async ({ page }) => {
    const orderUrl = await getFirstHostingProductUrl(page);
    if (!orderUrl) {
      test.skip(true, "No active hosting product found");
      return;
    }

    const email = testEmail();
    await page.goto(orderUrl);
    await page.waitForLoadState("networkidle");

    const domainInput = page.locator('input[name="hostingDomainName"], input[name="domainName"]');
    if (await domainInput.count() > 0) {
      await domainInput.first().fill(`paytest-${Date.now()}.example.com`);
    }
    await page.fill('[name="name"]', testName);
    await page.fill('[name="email"]', email);
    await page.fill('[name="password"]', testPassword);
    await page.fill('[name="phoneCountryCode"]', "+49");
    await page.fill('[name="phone"]', "1234567890");
    await page.fill('[name="address"]', "Test Str 1");
    await page.fill('[name="postalCode"]', "10115");
    await page.fill('[name="city"]', "Berlin");
    await page.fill('[name="state"]', "BE");

    const paypalRadio = page.locator('input[type="radio"][value="PAYPAL"]');
    if (await paypalRadio.count() === 0) {
      test.skip(true, "PayPal gateway not available");
      return;
    }
    await paypalRadio.click();
    await page.check('[name="acceptedTerms"]');
    await page.click('button[type="submit"]');

    // Wait for either a success redirect or an error state
    await page.waitForTimeout(8000);

    const currentUrl = page.url();
    if (currentUrl.includes("/client")) {
      // PayPal unexpectedly succeeded — test passes (gateway worked)
      return;
    }

    // Payment failed — the error message must contain a payment context prefix
    // so it does NOT look like a login failure
    const bodyText = await page.locator("body").textContent() ?? "";
    const hasPaymentContext = /payment.{0,10}fail|zahlung.{0,15}fehlgeschlagen|gateway|paypal/i.test(bodyText);
    const hasRawCredentialsError = bodyText.includes("Invalid credentials") && !hasPaymentContext;

    if (hasRawCredentialsError) {
      throw new Error(
        "Payment gateway returned 'Invalid credentials' but it was shown without any payment context prefix. " +
        "Users cannot distinguish a gateway config error from a login error."
      );
    }
    // As long as the error has some payment context, or the error is already prefixed, test passes
  });

  test("existing user checkout reuses account", async ({ page }) => {
    const orderUrl = await getFirstHostingProductUrl(page);
    if (!orderUrl) {
      test.skip(true, "No active hosting product found");
      return;
    }

    // Use a known existing test account (created in earlier run)
    const existingEmail = "test-reorder2@dezhost.test";
    const existingPassword = "TestPw9!aB";

    await page.goto(orderUrl);
    await page.waitForLoadState("networkidle");

    const domainInput = page.locator('input[name="hostingDomainName"], input[name="domainName"]');
    if (await domainInput.count() > 0) {
      await domainInput.first().fill(`reorder-${Date.now()}.example.com`);
    }
    await page.fill('[name="name"]', "Reorder User");
    await page.fill('[name="email"]', existingEmail);
    await page.fill('[name="password"]', existingPassword);
    await page.fill('[name="phoneCountryCode"]', "+49");
    await page.fill('[name="phone"]', "1234567890");
    await page.fill('[name="address"]', "Test Str 1");
    await page.fill('[name="postalCode"]', "10115");
    await page.fill('[name="city"]', "Berlin");
    await page.fill('[name="state"]', "BE");

    const sandboxRadio = page.locator('input[type="radio"][value="SANDBOX"]');
    if (await sandboxRadio.count() > 0) await sandboxRadio.click();

    await page.check('[name="acceptedTerms"]');
    await page.click('button[type="submit"]');

    await page.waitForURL(/\/client/, { timeout: 30_000 });
    await expect(page).toHaveURL(/\/client/);
  });

  test("domain product checkout: check domain availability triggers exactly once", async ({ page }) => {
    // Get domain product
    const response = await page.request.get(`${API}/products`);
    if (!response.ok()) { test.skip(true, "API unavailable"); return; }
    const products = await response.json() as Array<{ id: string; type: string; active: boolean }>;
    const domainProduct = products.find((p) => p.type === "DOMAIN" && p.active);
    if (!domainProduct) { test.skip(true, "No domain product found"); return; }

    await page.goto(`${BASE}/de/order/${domainProduct.id}`);
    await page.waitForLoadState("networkidle");

    // Domain input should be present
    const domainInput = page.locator('input[name="domainName"]');
    await expect(domainInput).toBeVisible({ timeout: 8_000 });

    // Type a domain — use Tab to blur the input (triggering onBlur check) without also
    // clicking the "Check domain" button (which would trigger a second check)
    await domainInput.fill("testdomain-unique-12345.de");
    await domainInput.press("Tab");

    // Wait for the domain check result
    await page.waitForTimeout(4000);

    // The check should have run exactly once — look for the result text
    const resultText = await page.locator("body").textContent() ?? "";
    // Should show either "wird registriert" or "wird transferiert" (domain checked)
    expect(resultText).toMatch(/registriert|transferiert|registered|transferred/i);

    // There should be at most 2 toasts visible (1 loading + 1 result = 2 at most)
    // Never 4 (which would indicate double-firing)
    const allToasts = await page.locator('[role="alert"], [class*="toast"]').count();
    expect(allToasts).toBeLessThanOrEqual(2);
  });
});

// ── Admin order creation ───────────────────────────────────────────────────────

test.describe("Admin order creation", () => {
  const ADMIN_EMAIL = process.env.E2E_ADMIN_EMAIL ?? "admin@dezhost.local";
  const ADMIN_PASSWORD = process.env.E2E_ADMIN_PASSWORD ?? "Dezhost-3f417f4248a568cfe6!";

  async function loginAsAdmin(page: import("@playwright/test").Page) {
    await page.goto(`${BASE}/admin/login`);
    const loginBtn = page.getByRole("button", { name: /^(Login|Anmelden)$/i });
    await page.fill('[name="email"]', ADMIN_EMAIL);
    await page.fill('[name="password"]', ADMIN_PASSWORD);
    await (await loginBtn.count() > 0 ? loginBtn : page.locator('button[type="submit"]').first()).click();
    await page.waitForURL(/\/admin(?!\/login)/, { timeout: 15_000 });
  }

  test("admin can create order for a client via clients page", async ({ page }) => {
    await loginAsAdmin(page);
    await page.goto(`${BASE}/admin/clients`);
    await page.waitForLoadState("networkidle");

    // Look for a client detail row and expand it
    const clientRow = page.locator('[class*="clientRow"]').first();
    if (await clientRow.count() === 0) {
      test.skip(true, "No clients visible");
      return;
    }

    // The clients page shows a list; click on a client to open
    await clientRow.click();
    await page.waitForTimeout(500);

    // Look for "Create Order" button
    const createOrderBtn = page.getByRole("button", { name: /create order/i }).first();
    if (await createOrderBtn.count() > 0) {
      await createOrderBtn.click();
      // A modal or form should appear
      await expect(page.locator("dialog, [class*='modal']").first()).toBeVisible({ timeout: 5_000 });
    }
  });

  test("admin creates order via New Order page - no Internal Server Error", async ({ page }) => {
    await loginAsAdmin(page);
    await page.goto(`${BASE}/admin/orders/new`);
    await page.waitForLoadState("networkidle");

    await expect(page.locator("main, [class*='main']").first()).not.toContainText("Internal Server Error");
    // Order form should render
    await expect(page.locator("body")).toContainText(/order|Order/i);
  });

  test("sequential admin orders get unique incrementing order numbers", async ({ page }) => {
    await loginAsAdmin(page);

    const TOKEN = await page.evaluate(async (apiUrl) => {
      const res = await fetch(`${apiUrl}/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: "admin@dezhost.local", password: "Dezhost-3f417f4248a568cfe6!", scope: "admin" })
      });
      const data = await res.json() as { accessToken?: string };
      return data.accessToken ?? "";
    }, API);

    if (!TOKEN) { test.skip(true, "Admin login failed"); return; }

    // Fetch a client and product to create orders
    const clientsRes = await page.request.get(`${API}/users`, { headers: { Authorization: `Bearer ${TOKEN}` } });
    const productsRes = await page.request.get(`${API}/products`, { headers: { Authorization: `Bearer ${TOKEN}` } });

    if (!clientsRes.ok() || !productsRes.ok()) { test.skip(true, "API unavailable"); return; }

    const clients = await clientsRes.json() as Array<{ id: string }>;
    const products = await productsRes.json() as Array<{ id: string; type: string; prices: Array<{ id: string }> }>;

    const client = clients.find((c) => c.id);
    const product = products.find((p) => p.type === "SHARED_HOSTING" && p.prices.length > 0);

    if (!client || !product) { test.skip(true, "Missing test data"); return; }

    const order1 = await (await page.request.post(`${API}/orders/admin`, {
      headers: { Authorization: `Bearer ${TOKEN}`, "Content-Type": "application/json" },
      data: { userId: client.id, items: [{ productId: product.id, productPriceId: product.prices[0]!.id, quantity: 1, configuration: { domainName: `seq-test-1-${Date.now()}.example.com` } }] }
    })).json() as { order?: { orderNumber: string } };

    const order2 = await (await page.request.post(`${API}/orders/admin`, {
      headers: { Authorization: `Bearer ${TOKEN}`, "Content-Type": "application/json" },
      data: { userId: client.id, items: [{ productId: product.id, productPriceId: product.prices[0]!.id, quantity: 1, configuration: { domainName: `seq-test-2-${Date.now()}.example.com` } }] }
    })).json() as { order?: { orderNumber: string } };

    const n1 = parseInt(order1.order?.orderNumber ?? "0", 10);
    const n2 = parseInt(order2.order?.orderNumber ?? "0", 10);

    expect(n1).toBeGreaterThan(0);
    expect(n2).toBeGreaterThan(n1);
  });
});
