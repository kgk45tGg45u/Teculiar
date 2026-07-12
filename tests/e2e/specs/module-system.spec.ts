/**
 * Production verification for the pluggable module system (registrar/hosting), DB-backed module
 * config, name-server defaults and domain-pricing fallback.
 *
 * READ-ONLY: this spec must never mutate live module config (no Save, no Enable/Disable) — disabling a
 * live module would stop production provisioning. It only reads the modules contract + storefront
 * prices, and asserts the admin config forms render.
 *
 * Run:
 *   E2E_BASE_URL=https://www.dezhost.com E2E_API_URL=https://www.dezhost.com/api/v1 \
 *     npx playwright test tests/e2e/specs/module-system.spec.ts --project=chromium --workers=1
 */
import { expect, test } from "@playwright/test";
import { env } from "../config/env";
import { uiLogin } from "../helpers/auth";

const API = env.apiURL;
const BASE = env.baseURL;

async function adminToken(page: import("@playwright/test").Page): Promise<string> {
  const r = await page.request.post(`${API}/auth/login`, { data: { email: env.admin.email, password: env.admin.password, scope: "admin" } });
  expect(r.ok(), `admin login failed: ${r.status()}`).toBeTruthy();
  return ((await r.json()) as { accessToken?: string }).accessToken ?? "";
}

test.describe("Module system — API contract", () => {
  test("modules endpoint exposes registrar/hosting kinds, fields and masked secrets", async ({ page }) => {
    const token = await adminToken(page);
    const r = await page.request.get(`${API}/admin/dev/modules`, { headers: { Authorization: `Bearer ${token}` } });
    expect(r.ok(), `GET /admin/dev/modules → ${r.status()}`).toBeTruthy();
    const modules = (await r.json()) as Array<{
      name: string; kind?: string; active: boolean; config: Record<string, unknown>;
      fields?: Array<{ key: string; type: string }>;
    }>;
    expect(Array.isArray(modules)).toBeTruthy();

    const resellbiz = modules.find((m) => m.name === "resellbiz");
    expect(resellbiz, "resellbiz module present").toBeTruthy();
    expect(resellbiz!.kind).toBe("registrar");
    expect(typeof resellbiz!.active).toBe("boolean");
    // New config surface for credentials + default name servers.
    for (const key of ["mode", "resellerId", "apiKey", "defaultNs"]) {
      expect(Object.keys(resellbiz!.config), `resellbiz.config.${key}`).toContain(key);
    }
    // Secrets must never be echoed back in clear text.
    expect(["", "********"]).toContain(String(resellbiz!.config.apiKey));
    expect(["test", "live"]).toContain(String(resellbiz!.config.mode || "test"));
    expect((resellbiz!.fields ?? []).map((f) => f.key)).toEqual(
      expect.arrayContaining(["mode", "resellerId", "apiKey", "defaultNs"])
    );

    const virtualmin = modules.find((m) => m.name === "virtualmin");
    expect(virtualmin, "virtualmin module present").toBeTruthy();
    expect(virtualmin!.kind).toBe("hosting");
    for (const key of ["endpoint", "username", "password", "allowSelfSigned", "jobDelayMinutes"]) {
      expect(Object.keys(virtualmin!.config), `virtualmin.config.${key}`).toContain(key);
    }
    expect(["", "********"]).toContain(String(virtualmin!.config.password));
  });

  test("storefront domain prices only include priced rows (amountCents > 0)", async ({ page }) => {
    const r = await page.request.get(`${API}/storefront/domain-prices`);
    expect(r.ok(), `GET /storefront/domain-prices → ${r.status()}`).toBeTruthy();
    const prices = (await r.json()) as Array<{ amountCents: number; tld: string }>;
    expect(Array.isArray(prices)).toBeTruthy();
    for (const price of prices) {
      expect(price.amountCents, `priced row for .${price.tld}`).toBeGreaterThan(0);
    }
  });
});

test.describe("Module system — admin config UI", () => {
  test("Resell.biz panel shows API credentials + default name-server fields", async ({ page }) => {
    await uiLogin(page, "admin", env.admin.email, env.admin.password);
    await page.goto(`${BASE}/admin/products/modules`);
    await page.waitForLoadState("networkidle");

    const card = page.locator('[class*="moduleCard"]').filter({ hasText: "Resell.biz Domain Registrar" }).first();
    await card.getByRole("button", { name: "Configure" }).first().click();

    // Scope to <label> elements — "API key" also appears in the panel's intro paragraph.
    await expect(page.getByText("Resell.biz — API Credentials")).toBeVisible();
    await expect(page.locator("label").filter({ hasText: "API mode" })).toBeVisible();
    await expect(page.locator("label").filter({ hasText: "Reseller ID" })).toBeVisible();
    await expect(page.locator("label").filter({ hasText: "API key" })).toBeVisible();
    await expect(page.locator("label").filter({ hasText: "Default name servers" })).toBeVisible();
  });

  test("Virtualmin panel shows the job-delay field", async ({ page }) => {
    await uiLogin(page, "admin", env.admin.email, env.admin.password);
    await page.goto(`${BASE}/admin/products/modules`);
    await page.waitForLoadState("networkidle");

    const card = page.locator('[class*="moduleCard"]').filter({ hasText: "Virtualmin Hosting Panel" }).first();
    await card.getByRole("button", { name: "Configure" }).first().click();

    await expect(page.getByText("Virtualmin — Server Configuration")).toBeVisible();
    await expect(page.locator("label").filter({ hasText: "Minutes between server jobs" })).toBeVisible();
  });
});
