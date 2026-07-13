/**
 * Phase 9.1 rebrand production verification (dezhost -> teculiar software rename).
 *
 * Checks the master-plan Verify (Phase 9) items that are observable on prod:
 *  - dezhost.com (the TENANT) still wears its own "Dezhost" brand from settings.
 *  - Auth writes the new teculiar_* cookies.
 *  - Dual-read: a session presented under the OLD dezhost_* cookie names still works.
 *  - No --dezhost CSS custom property survives in the served bundle.
 *
 * Run:
 *   E2E_BASE_URL=https://www.dezhost.com E2E_API_URL=https://www.dezhost.com/api/v1 \
 *     npx playwright test tests/e2e/specs/phase9-rebrand-verify.spec.ts --project=chromium --workers=1
 */
import { expect, test } from "@playwright/test";

const BASE = (process.env.E2E_BASE_URL ?? "https://www.dezhost.com").replace(/\/$/, "");
const API = (process.env.E2E_API_URL ?? `${BASE}/api/v1`).replace(/\/$/, "");
const ADMIN_EMAIL = process.env.E2E_ADMIN_EMAIL ?? "";
const ADMIN_PASSWORD = process.env.E2E_ADMIN_PASSWORD ?? "";
const CLIENT_EMAIL = process.env.E2E_CLIENT_EMAIL ?? "";
const CLIENT_PASSWORD = process.env.E2E_CLIENT_PASSWORD ?? "";

const host = new URL(BASE).hostname;

async function apiToken(page: import("@playwright/test").Page, email: string, password: string, scope?: string) {
  const r = await page.request.post(`${API}/auth/login`, { data: scope ? { email, password, scope } : { email, password } });
  expect(r.ok(), `login ${email}: ${r.status()} ${await r.text()}`).toBeTruthy();
  return (await r.json() as { accessToken?: string }).accessToken ?? "";
}

// T1 — Tenant brand untouched: dezhost.com storefront still says "Dezhost" (settings-driven),
// and the footer does not fall back to the software default "Teculiar".
test("dezhost.com storefront keeps its tenant brand", async ({ page }) => {
  await page.goto(`${BASE}/de`, { waitUntil: "domcontentloaded" });
  await expect(page).toHaveTitle(/Dezhost/);
  const footer = page.locator("footer");
  await expect(footer).toContainText(/Dezhost/);
  await expect(footer).not.toContainText(/©.*Teculiar/);
});

// T2 — Served CSS carries the renamed custom property (new bundle live, old var gone).
test("served bundle uses --teculiar custom properties, not --dezhost", async ({ page }) => {
  await page.goto(`${BASE}/de`, { waitUntil: "load" });
  const counts = await page.evaluate(async () => {
    let oldVar = 0;
    let newVar = 0;
    for (const sheet of Array.from(document.styleSheets)) {
      const cssHref = sheet.href;
      if (cssHref && !cssHref.startsWith(location.origin)) continue;
      let text = "";
      try {
        text = Array.from(sheet.cssRules ?? []).map((r) => r.cssText).join("\n");
      } catch {
        if (cssHref) text = await fetch(cssHref).then((r) => r.text()).catch(() => "");
      }
      oldVar += (text.match(/--dezhost/g) ?? []).length;
      newVar += (text.match(/--teculiar/g) ?? []).length;
    }
    return { oldVar, newVar };
  });
  expect(counts.oldVar, "old --dezhost vars must be gone").toBe(0);
  expect(counts.newVar, "renamed --teculiar vars present").toBeGreaterThan(0);
});

// T3 — Admin UI login writes the NEW teculiar_* names and leaves no dezhost_* behind.
test("admin login stores session under teculiar_* names only", async ({ page }) => {
  await page.goto(`${BASE}/admin/login`, { waitUntil: "domcontentloaded" });
  await page.locator('input[name="email"]').fill(ADMIN_EMAIL);
  await page.locator('input[name="password"]').fill(ADMIN_PASSWORD);
  await page.locator('button[type="submit"]').click();
  await page.waitForURL(/\/admin(?!\/login)/, { timeout: 30_000 });

  const stored = await page.evaluate(() => {
    const all = { ...localStorage, ...sessionStorage } as Record<string, string>;
    return Object.keys(all);
  });
  expect(stored.some((k) => k.startsWith("teculiar_admin_") || k === "admin_teculiar_roles"), `keys: ${stored.join()}`).toBeTruthy();
  expect(stored.filter((k) => k.includes("dezhost")), "no dezhost_* storage keys").toEqual([]);

  const cookies = await page.context().cookies();
  expect(cookies.some((c) => c.name === "teculiar_admin_access_token" && c.value)).toBeTruthy();
  expect(cookies.filter((c) => c.name.startsWith("dezhost_") && c.value), "no dezhost_* cookies").toEqual([]);
});

// T4 — Dual-read: a valid session presented under the OLD cookie name still reaches /admin
// (pre-rename browsers must survive the deploy without being logged out).
test("old dezhost_admin_access_token cookie still opens /admin (dual-read)", async ({ page }) => {
  const tok = await apiToken(page, ADMIN_EMAIL, ADMIN_PASSWORD, "admin");
  await page.context().addCookies([{ name: "dezhost_admin_access_token", value: tok, domain: host, path: "/" }]);
  const resp = await page.goto(`${BASE}/admin`, { waitUntil: "domcontentloaded" });
  expect(resp?.status(), "admin reachable").toBeLessThan(400);
  await expect(page).not.toHaveURL(/\/login/);
});

// T5 — Dual-read for the client scope.
test("old dezhost_client_access_token cookie still opens /client (dual-read)", async ({ page }) => {
  const tok = await apiToken(page, CLIENT_EMAIL, CLIENT_PASSWORD);
  await page.context().addCookies([{ name: "dezhost_client_access_token", value: tok, domain: host, path: "/" }]);
  const resp = await page.goto(`${BASE}/client`, { waitUntil: "domcontentloaded" });
  expect(resp?.status(), "client reachable").toBeLessThan(400);
  await expect(page).not.toHaveURL(/\/login/);
});
