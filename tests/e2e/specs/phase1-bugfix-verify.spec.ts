/**
 * Production verification for master-plan Phase 1.7–1.10.
 *
 * Run:
 *   E2E_BASE_URL=https://www.dezhost.com E2E_API_URL=https://www.dezhost.com/api/v1 \
 *     npx playwright test tests/e2e/specs/phase1-bugfix-verify.spec.ts --project=chromium --workers=1
 *
 * 1.7 footer collapses to two link columns on mobile (CTA spans the full row below)
 * 1.8 cookie banner shows once, Accept records cookie_ack and dismisses for good
 * 1.9 Product.featured drives the shared "Beliebt/Popular" badge (flags the 2nd
 *     webhosting + 3rd reseller product like the old hardcoded look, then checks the pages)
 * 1.10 /cms/post-tags returns only the top-N most used tags
 */
import { expect, test } from "@playwright/test";

const BASE = (process.env.E2E_BASE_URL ?? "http://127.0.0.1:3000").replace(/\/$/, "");
const API = (process.env.E2E_API_URL ?? "http://127.0.0.1:4000/api/v1").replace(/\/$/, "");
const ADMIN_EMAIL = process.env.E2E_ADMIN_EMAIL ?? "";
const ADMIN_PASSWORD = process.env.E2E_ADMIN_PASSWORD ?? "";

type Price = { amountCents: number; billingCycle: string; setupFeeCents: number };
type Config = { key: string; label: string; required: boolean; values: unknown[] };
type Product = {
  id: string; name: string; slug: string; type: string; description: string;
  categoryId?: string | null; sortOrder?: number; homepageVisible?: boolean; featured?: boolean;
  domainRequirement?: string; freeDomainBillingCycle?: string | null; provisioningModule?: string | null;
  prices: Price[]; configs?: Config[];
};

async function adminToken(request: import("@playwright/test").APIRequestContext) {
  const r = await request.post(`${API}/auth/login`, { data: { email: ADMIN_EMAIL, password: ADMIN_PASSWORD, scope: "admin" } });
  expect(r.ok(), `admin login: ${r.status()}`).toBeTruthy();
  return ((await r.json()) as { accessToken?: string }).accessToken ?? "";
}

/** Round-trip PATCH that only flips `featured`, preserving prices/configs/domain fields. */
async function setFeatured(request: import("@playwright/test").APIRequestContext, token: string, product: Product, featured: boolean) {
  const r = await request.patch(`${API}/admin/dev/products/${product.id}`, {
    headers: { Authorization: `Bearer ${token}` },
    data: {
      categoryId: product.categoryId ?? null,
      configurableOptions: (product.configs ?? []).map((c) => ({ key: c.key, label: c.label, required: c.required, values: c.values })),
      description: product.description,
      domainRequirement: product.domainRequirement ?? "NOT_NEEDED",
      featured,
      freeDomainBillingCycle: product.freeDomainBillingCycle ?? null,
      homepageVisible: product.homepageVisible ?? true,
      name: product.name,
      prices: product.prices.map((p) => ({ amountCents: p.amountCents, billingCycle: p.billingCycle, setupFeeCents: p.setupFeeCents })),
      provisioningModule: product.provisioningModule ?? undefined,
      slug: product.slug,
      sortOrder: product.sortOrder ?? 0,
      type: product.type
    }
  });
  expect(r.ok(), `set featured=${featured} on ${product.slug}: ${r.status()} ${await r.text()}`).toBeTruthy();
}

// 1.7 — mobile footer: services + legal columns side by side, CTA full-width below.
test("footer shows two link columns on a mobile viewport", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`${BASE}/de`, { waitUntil: "domcontentloaded" });
  const headings = page.locator("footer h4");
  await expect(headings.nth(0)).toBeVisible();
  const services = await headings.nth(0).boundingBox();
  const legal = await headings.nth(1).boundingBox();
  const cta = await headings.nth(2).boundingBox();
  expect(services && legal && cta).toBeTruthy();
  // Same row: services + legal. CTA wraps below both.
  expect(Math.abs((services?.y ?? 0) - (legal?.y ?? 1e9))).toBeLessThan(8);
  expect((legal?.x ?? 0)).toBeGreaterThan((services?.x ?? 0) + 50);
  expect((cta?.y ?? 0)).toBeGreaterThan((services?.y ?? 1e9) + 20);
});

// 1.8 — cookie banner: visible on first visit, Accept sets cookie_ack and dismisses permanently.
test("cookie banner shows once and Accept dismisses it", async ({ page }) => {
  await page.goto(`${BASE}/de`, { waitUntil: "domcontentloaded" });
  const banner = page.getByRole("region", { name: "Cookies" });
  await expect(banner).toBeVisible();
  await banner.getByRole("button", { name: "Akzeptieren" }).click();
  await expect(banner).toBeHidden();
  expect(await page.evaluate(() => window.localStorage.getItem("cookie_ack"))).toBe("accepted");
  await page.reload({ waitUntil: "domcontentloaded" });
  await expect(page.getByRole("region", { name: "Cookies" })).toHaveCount(0);
});

// 1.9 — flag the 3rd reseller product via admin API (the card the old hardcoded index
// highlighted), confirm the shared badge renders. Flag intentionally stays set. The
// webhosting grid is covered too when that category has products (Dezhost prod: reseller only).
test("featured flag drives the Beliebt badge on the reseller grid", async ({ page, request }) => {
  test.setTimeout(120_000);
  const token = await adminToken(request);

  const reseller = (await (await request.get(`${API}/storefront/products?category=reseller`)).json()) as Product[];
  expect(reseller.length, "reseller products present").toBeGreaterThan(2);

  await setFeatured(request, token, reseller[2], true);

  const flagged = (await (await request.get(`${API}/storefront/products?category=reseller`)).json()) as Product[];
  expect(flagged.find((p) => p.id === reseller[2].id)?.featured, "featured persisted via API").toBe(true);

  await page.goto(`${BASE}/de/reseller`, { waitUntil: "domcontentloaded" });
  await expect(page.getByText("Beliebt", { exact: true }).first()).toBeVisible();

  const hosting = (await (await request.get(`${API}/storefront/products?category=webhosting`)).json()) as Product[];
  if (hosting.length > 1) {
    await setFeatured(request, token, hosting[1], true);
    await page.goto(`${BASE}/de/webhosting`, { waitUntil: "domcontentloaded" });
    await expect(page.getByText("Beliebt", { exact: true }).first()).toBeVisible();
  }
});

// 1.10 — tag cloud source returns only the top-N most used tags.
test("post-tags endpoint caps the chip cloud at frequently used tags", async ({ request }) => {
  const tags = (await (await request.get(`${API}/cms/post-tags?locale=de`)).json()) as string[];
  expect(Array.isArray(tags)).toBeTruthy();
  expect(tags.length).toBeLessThanOrEqual(12);

  const limited = (await (await request.get(`${API}/cms/post-tags?locale=de&limit=3`)).json()) as string[];
  expect(limited.length).toBeLessThanOrEqual(3);
  // The limited list is a prefix of the full ranking (same order, most used first).
  expect(tags.slice(0, limited.length)).toEqual(limited);
});
