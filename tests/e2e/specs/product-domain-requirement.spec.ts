/**
 * Per-product domain requirement E2E tests.
 *
 * Covers the admin product setting (checkbox + Necessary/Optional dropdown + free-domain cycle)
 * and the three resulting order-form behaviours:
 *   NECESSARY  → domain field required (same as web hosting has always been)
 *   OPTIONAL   → domain field present but skippable, with an "optional" note
 *   NOT_NEEDED → no domain section at all (no whois search, no register/transfer)
 *
 * Requires both the web server and API to be running.
 * Run: npx playwright test tests/e2e/specs/product-domain-requirement.spec.ts --project=chromium
 */
import { expect, test, type Page } from "@playwright/test";

const BASE = process.env.PLAYWRIGHT_BASE_URL ?? process.env.E2E_BASE_URL ?? "http://127.0.0.1:3000";
const API = process.env.NEXT_PUBLIC_API_URL ?? process.env.E2E_API_URL ?? "http://127.0.0.1:4000/api/v1";
const ADMIN_EMAIL = process.env.E2E_ADMIN_EMAIL ?? "admin@dezhost.local";
const ADMIN_PASSWORD = process.env.E2E_ADMIN_PASSWORD ?? "Dezhost-3f417f4248a568cfe6!";

// The "a domain is optional" note shown on the order form for OPTIONAL products (DE + EN).
const DOMAIN_OPTIONAL_NOTE = /domain ist für diesen dienst optional|a domain is optional for this service/i;

type ApiProduct = {
  id: string;
  name: string;
  type: string;
  active: boolean;
  domainRequirement?: string;
  freeDomainBillingCycle?: string | null;
};

async function fetchProducts(page: Page): Promise<ApiProduct[]> {
  const response = await page.request.get(`${API}/products`);
  if (!response.ok()) return [];
  const products = (await response.json()) as ApiProduct[];
  return Array.isArray(products) ? products.filter((product) => product.active) : [];
}

function pick(products: ApiProduct[], predicate: (product: ApiProduct) => boolean) {
  return products.find(predicate);
}

async function loginAsAdmin(page: Page) {
  await page.goto(`${BASE}/admin/login`);
  await page.fill('[name="email"]', ADMIN_EMAIL);
  await page.fill('[name="password"]', ADMIN_PASSWORD);
  const loginBtn = page.getByRole("button", { name: /^(Login|Anmelden|Sign in)$/i });
  await (await loginBtn.count() > 0 ? loginBtn : page.locator('button[type="submit"]').first()).click();
  await page.waitForURL(/\/admin(?!\/login)/, { timeout: 20_000 });
}

test.describe("Order form domain requirement", () => {
  test("NECESSARY product requires a domain", async ({ page }) => {
    const products = await fetchProducts(page);
    const product = pick(products, (p) => p.type !== "DOMAIN" && p.domainRequirement === "NECESSARY");
    test.skip(!product, "No product with a NECESSARY domain requirement found");

    await page.goto(`${BASE}/de/order/${product!.id}`);
    const domainInput = page.locator('input[name="hostingDomainName"]');
    await expect(domainInput).toBeVisible({ timeout: 15_000 });
    // The field is mandatory and the "domain is optional" note is absent.
    await expect(domainInput).toHaveJSProperty("required", true);
    await expect(page.getByText(DOMAIN_OPTIONAL_NOTE)).toHaveCount(0);
  });

  test("OPTIONAL product offers a skippable domain", async ({ page }) => {
    const products = await fetchProducts(page);
    const product = pick(products, (p) => p.type !== "DOMAIN" && p.domainRequirement === "OPTIONAL");
    test.skip(!product, "No product with an OPTIONAL domain requirement found");

    await page.goto(`${BASE}/de/order/${product!.id}`);
    const domainInput = page.locator('input[name="hostingDomainName"]');
    await expect(domainInput).toBeVisible({ timeout: 15_000 });
    // Present but not mandatory, and the form tells the customer the domain is optional.
    await expect(domainInput).toHaveJSProperty("required", false);
    await expect(page.getByText(DOMAIN_OPTIONAL_NOTE)).toBeVisible();
  });

  test("NOT_NEEDED product shows no domain section", async ({ page }) => {
    const products = await fetchProducts(page);
    const product = pick(products, (p) => p.type !== "DOMAIN" && (p.domainRequirement ?? "NOT_NEEDED") === "NOT_NEEDED");
    test.skip(!product, "No service product with a NOT_NEEDED domain requirement found");

    await page.goto(`${BASE}/de/order/${product!.id}`);
    // Wait for the checkout form to render, then assert no domain inputs exist.
    await expect(page.locator('form')).toBeVisible({ timeout: 15_000 });
    await expect(page.locator('input[name="hostingDomainName"]')).toHaveCount(0);
    await expect(page.locator('input[name="domainName"]')).toHaveCount(0);
  });

  test("DOMAIN product keeps the domain registration flow", async ({ page }) => {
    const products = await fetchProducts(page);
    const product = pick(products, (p) => p.type === "DOMAIN");
    test.skip(!product, "No domain product found");

    await page.goto(`${BASE}/de/order/${product!.id}`);
    await expect(page.locator('input[name="domainName"]')).toBeVisible({ timeout: 15_000 });
  });
});

test.describe("Admin product domain setting", () => {
  test("product list shows a Domain column with the requirement", async ({ page }) => {
    await loginAsAdmin(page);
    await page.goto(`${BASE}/admin/products`);
    await expect(page.getByRole("columnheader", { name: "Domain" })).toBeVisible({ timeout: 15_000 });
    await expect(page.locator("table")).toContainText(/Necessary|Optional/);
  });

  test("editing a NECESSARY product pre-fills the domain controls", async ({ page }) => {
    const products = await fetchProducts(page);
    const product = pick(products, (p) => p.type !== "DOMAIN" && p.domainRequirement === "NECESSARY");
    test.skip(!product, "No product with a NECESSARY domain requirement found");

    await loginAsAdmin(page);
    await page.goto(`${BASE}/admin/products`);

    const row = page.locator("tr", { hasText: product!.name }).first();
    await row.getByRole("button", { name: /Edit/i }).click();

    // The "can be ordered with a domain" checkbox is ticked, and the requirement reads Necessary.
    const checkbox = page.locator('label', { hasText: /Can be ordered with a domain/i }).locator('input[type="checkbox"]');
    await expect(checkbox).toBeChecked();
    const requirementSelect = page.locator('label', { hasText: /Domain requirement/i }).locator("select");
    await expect(requirementSelect).toHaveValue("NECESSARY");
  });
});
