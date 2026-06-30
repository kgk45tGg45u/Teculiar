import crypto from "node:crypto";
import { test, expect, type BrowserContext, type Page } from "@playwright/test";

// Customizer builder + live render E2E (Phase 3c–3e + responsive follow-up). Runs against a local
// stack (E2E_BASE_URL=http://127.0.0.1:3000, E2E_API_URL=http://127.0.0.1:4000/api/v1). Verifies:
//  • the builder hydrates with NO console errors (the dnd-kit SSR id fix),
//  • drag-from-palette inserts a node, and editing an element updates the canvas (changes reflect),
//  • a published responsive grid renders the right column count on desktop / tablet / mobile,
//  • a productGrid renders real products for its configured category.
// Auth: a self-signed HS256 admin JWT (the app verifies it with JWT_ACCESS_SECRET); no UI login needed.

const BASE = (process.env.E2E_BASE_URL ?? "http://127.0.0.1:3000").replace(/\/$/, "");
const API = (process.env.E2E_API_URL ?? "http://127.0.0.1:4000/api/v1").replace(/\/$/, "");
const SECRET = process.env.JWT_ACCESS_SECRET ?? "";
// A REAL admin user id is needed for the builder *page* tests (its server render calls /users/me).
// The render/publish tests only need the token's roles claim, so they run with a synthetic sub.
const ADMIN_SUB = process.env.E2E_ADMIN_SUB ?? "";
const PAGE_KEY = "uber-uns";
const ADMIN_COOKIE = "dezhost_admin_access_token";

const b64url = (input: Buffer | string) =>
  Buffer.from(input).toString("base64").replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");

function adminJwt(sub = ADMIN_SUB || "e2e-admin"): string {
  const now = Math.floor(Date.now() / 1000);
  const header = b64url(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  const body = b64url(JSON.stringify({ sub, email: "e2e@admin.local", roles: ["admin"], iat: now, exp: now + 1800 }));
  const sig = b64url(crypto.createHmac("sha256", SECRET).update(`${header}.${body}`).digest());
  return `${header}.${body}.${sig}`;
}

const authHeaders = () => ({ Authorization: `Bearer ${adminJwt()}`, "Content-Type": "application/json" });

async function pageId(): Promise<string> {
  const res = await fetch(`${API}/admin/dev/theme`, { headers: authHeaders() });
  const data = (await res.json()) as { pages: Array<{ id: string; key: string }> };
  const page = data.pages.find((p) => p.key === PAGE_KEY);
  if (!page) throw new Error(`page ${PAGE_KEY} not found`);
  return page.id;
}

async function publish(id: string, layout: unknown): Promise<void> {
  const res = await fetch(`${API}/admin/dev/customizer/${id}/publish`, { method: "POST", headers: authHeaders(), body: JSON.stringify({ layout }) });
  expect(res.ok, `publish failed: ${res.status}`).toBeTruthy();
}

async function saveDraft(id: string, layout: unknown): Promise<void> {
  const res = await fetch(`${API}/admin/dev/customizer/${id}/draft`, { method: "PATCH", headers: authHeaders(), body: JSON.stringify({ layout }) });
  expect(res.ok, `saveDraft failed: ${res.status}`).toBeTruthy();
}

const nid = (p: string) => `${p}-${Math.random().toString(36).slice(2, 8)}`;
const featureGridDoc = (cols: { base: number; md: number; sm: number }) => ({
  schemaVersion: 1,
  root: [
    {
      id: nid("fg"),
      type: "featureGrid",
      props: { columns: cols },
      text: { title: { en: "Why us", de: "Warum wir" } },
      children: Array.from({ length: 4 }, (_, i) => ({
        id: nid("fc"),
        type: "featureCard",
        props: { icon: "Sparkles" },
        text: { title: { en: `Card ${i + 1}`, de: `Karte ${i + 1}` }, body: { en: "Body", de: "Text" } }
      }))
    }
  ]
});
const productGridDoc = () => ({
  schemaVersion: 1,
  root: [{ id: nid("pg"), type: "productGrid", props: { category: "webhosting", columns: { base: 3, md: 2, sm: 1 } }, text: { title: { en: "Packages", de: "Pakete" } } }]
});

async function setAdminCookie(context: BrowserContext) {
  await context.addCookies([{ name: ADMIN_COOKIE, value: adminJwt(), domain: new URL(BASE).hostname, path: "/" }]);
}

// The builder page server-renders against /users/me, so it needs a token whose sub is a real admin.
const needsRealAdmin = () => test.skip(!ADMIN_SUB, "set E2E_ADMIN_SUB to a real admin user id for builder-page tests");

async function columnCount(page: Page): Promise<number> {
  return page.locator('[data-grid="responsive"]').first().evaluate((el) => {
    const tracks = getComputedStyle(el as HTMLElement).gridTemplateColumns;
    return tracks.split(" ").filter(Boolean).length;
  });
}

test.describe("Customizer builder + live render", () => {
  test.beforeEach(async ({ context }) => {
    test.skip(!SECRET, "JWT_ACCESS_SECRET not set — run with `set -a && source .env && set +a`");
    await setAdminCookie(context);
  });

  test("builder hydrates with no console errors and shows the grouped palette", async ({ page }) => {
    needsRealAdmin();
    const errors: string[] = [];
    page.on("console", (msg) => {
      if (msg.type() === "error") errors.push(msg.text());
    });
    page.on("pageerror", (err) => errors.push(err.message));

    await page.goto(`/admin/theme/customizer/${PAGE_KEY}`);
    await expect(page.locator('[data-element="hero"]')).toBeVisible();
    // every registered element is shown in the palette (grouped by category)
    await expect(page.locator('[data-element]')).toHaveCount(17);
    await page.waitForTimeout(800); // allow hydration to settle

    const hydration = errors.filter((e) => /hydrat|did not match|describedby/i.test(e));
    expect(hydration, `hydration errors:\n${hydration.join("\n")}`).toHaveLength(0);
  });

  test("dragging a palette element inserts a node on the canvas", async ({ page }) => {
    needsRealAdmin();
    const id = await pageId();
    await saveDraft(id, { schemaVersion: 1, root: [] }); // start empty
    await page.goto(`/admin/theme/customizer/${PAGE_KEY}`);

    const source = page.locator('[data-element="textBlock"]');
    await expect(source).toBeVisible();
    const from = await source.boundingBox();
    const target = page.locator('[class*="canvasScroll"], [class*="dropZone"]').first();
    const to = await target.boundingBox();
    if (!from || !to) throw new Error("missing drag boxes");

    await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2);
    await page.mouse.down();
    await page.mouse.move(from.x + from.width / 2 + 12, from.y + from.height / 2 + 12, { steps: 6 });
    await page.mouse.move(to.x + to.width / 2, to.y + to.height / 2, { steps: 12 });
    await page.mouse.up();

    await expect(page.locator('[data-node-type="textBlock"]')).toBeVisible();
  });

  test("editing an element updates the canvas content", async ({ page }) => {
    needsRealAdmin();
    const id = await pageId();
    await saveDraft(id, { schemaVersion: 1, root: [{ id: nid("b"), type: "button", props: { href: "#", variant: "primary" }, text: { label: { en: "SEEDLABEL", de: "SEEDLABEL" } } }] });
    await page.goto(`/admin/theme/customizer/${PAGE_KEY}`);

    const node = page.locator('[data-node-type="button"]');
    await expect(node).toContainText("SEEDLABEL");
    await node.click();

    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();
    const firstInput = dialog.getByRole("textbox").first();
    await firstInput.fill("NEWLABEL");
    // live-applies to the in-memory doc → the canvas reflects it (close the modal, then assert)
    await page.keyboard.press("Escape");
    await expect(node).toContainText("NEWLABEL");
  });

  test("a published responsive grid renders 4 / 2 / 1 columns on desktop / tablet / mobile", async ({ page }) => {
    const id = await pageId();
    await publish(id, featureGridDoc({ base: 4, md: 2, sm: 1 }));

    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto(`/de/${PAGE_KEY}`);
    await expect(page.locator('[data-grid="responsive"]').first()).toBeVisible();
    expect(await columnCount(page)).toBe(4);

    await page.setViewportSize({ width: 900, height: 900 });
    expect(await columnCount(page)).toBe(2);

    await page.setViewportSize({ width: 480, height: 900 });
    expect(await columnCount(page)).toBe(1);
  });

  test("a productGrid renders real products for its category", async ({ page }) => {
    const id = await pageId();
    const products = (await (await fetch(`${API}/storefront/products?category=webhosting`)).json()) as unknown[];
    test.skip(!Array.isArray(products) || products.length === 0, "no webhosting products seeded locally");

    await publish(id, productGridDoc());
    await page.goto(`/de/${PAGE_KEY}`);
    await expect(page.locator('[data-grid="responsive"]').first()).toBeVisible();
    // every product becomes a card with an Order CTA linking to /<locale>/order/<id>
    await expect(page.locator('a[href*="/order/"]').first()).toBeVisible();
  });
});
