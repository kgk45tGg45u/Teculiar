/**
 * Image upload E2E tests — works against localhost OR production.
 *
 * Tests that images uploaded via the Admin panel actually appear on the
 * public website. Run against production:
 *
 *   E2E_BASE_URL=https://dezhost.com \
 *   E2E_ADMIN_EMAIL=admin@dezhost.com \
 *   E2E_ADMIN_PASSWORD=yourpassword \
 *   npx playwright test tests/e2e/specs/image-uploads.spec.ts
 *
 * Or locally (servers must already be running):
 *   npx playwright test tests/e2e/specs/image-uploads.spec.ts
 */
import { expect, test } from "@playwright/test";
import path from "node:path";
import { mkdir, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";

const ADMIN_EMAIL = process.env.E2E_ADMIN_EMAIL ?? "admin@dezhost.local";
const ADMIN_PASSWORD = process.env.E2E_ADMIN_PASSWORD ?? "";
const BASE = (process.env.E2E_BASE_URL ?? process.env.PLAYWRIGHT_BASE_URL ?? "http://127.0.0.1:3000").replace(/\/$/, "");
const API_BASE = (process.env.E2E_API_URL ?? process.env.NEXT_PUBLIC_API_URL ?? "http://127.0.0.1:4000/api/v1").replace(/\/$/, "");

// Minimal 10x10 blue PNG — small enough to be a test fixture, large enough to
// pass mimetype validation. Generated via canvas, stable binary.
const TEST_PNG_BASE64 =
  "iVBORw0KGgoAAAANSUhEUgAAAAoAAAAKCAYAAACNMs+9AAAAFUlEQVR42mNk" +
  "+M9Qz0AEYBxVSF+FAAhKDveksOjmAAAAAElFTkSuQmCC";
const TEST_PNG = Buffer.from(TEST_PNG_BASE64, "base64");

// Fixture file path used by setInputFiles()
const FIXTURES_DIR = path.join(process.cwd(), "tests/e2e/fixtures");
const TEST_IMAGE_PATH = path.join(FIXTURES_DIR, "test-image.png");

async function ensureTestImage() {
  if (!existsSync(FIXTURES_DIR)) {
    await mkdir(FIXTURES_DIR, { recursive: true });
  }
  if (!existsSync(TEST_IMAGE_PATH)) {
    await writeFile(TEST_IMAGE_PATH, TEST_PNG);
  }
}

async function adminLogin(page: Parameters<typeof test>[1] extends (...args: infer A) => unknown ? A[0] : never) {
  await page.goto(`${BASE}/admin/login`);
  await page.fill('[name="email"]', ADMIN_EMAIL);
  await page.fill('[name="password"]', ADMIN_PASSWORD);
  const loginBtn = page.getByRole("button", { name: /^(Login|Anmelden|Sign in)$/i });
  await (await loginBtn.count() > 0 ? loginBtn : page.locator('button[type="submit"]').first()).click();
  await page.waitForURL(/\/admin(?!\/login)/, { timeout: 20_000 });
}

async function getAdminToken(page: Parameters<typeof test>[1] extends (...args: infer A) => unknown ? A[0] : never): Promise<string> {
  return page.evaluate(() => localStorage.getItem("dezhost_admin_access_token") ?? "");
}

async function getStorefrontSetting(page: Parameters<typeof test>[1] extends (...args: infer A) => unknown ? A[0] : never, key: string): Promise<string> {
  const token = await getAdminToken(page);
  const response = await page.request.get(`${API_BASE}/admin/dev/billing/settings`, {
    headers: { Authorization: `Bearer ${token}` }
  });
  const data = await response.json() as Record<string, unknown>;
  return typeof data[key] === "string" ? data[key] : "";
}

async function restoreStorefrontSetting(page: Parameters<typeof test>[1] extends (...args: infer A) => unknown ? A[0] : never, key: string, value: string) {
  const token = await getAdminToken(page);
  await page.request.patch(`${API_BASE}/admin/dev/billing/settings`, {
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    data: { [key]: value }
  });
}

// ── Logo upload ───────────────────────────────────────────────────────────────

test.describe("Logo upload", () => {
  let originalLogoUrl = "";

  test.beforeAll(async () => {
    await ensureTestImage();
  });

  test("uploading a logo in admin settings updates the header logo on the public site", async ({ page }) => {
    await adminLogin(page);

    // Save original logo URL so we can restore it afterward
    originalLogoUrl = await getStorefrontSetting(page, "siteLogoUrl");

    await page.goto(`${BASE}/admin/settings`);

    // Find the logo uploader (label text "Website logo")
    const logoSection = page.locator("text=Website logo").locator("..").locator("..");
    const logoFileInput = logoSection.locator('input[type="file"]').first();
    await logoFileInput.setInputFiles(TEST_IMAGE_PATH);

    // Click the Upload Image button next to the logo field
    const uploadBtn = logoSection.locator('button', { hasText: /upload image/i });
    await uploadBtn.click();

    // Wait for "Image uploaded." confirmation
    await expect(logoSection.locator("text=Image uploaded.")).toBeVisible({ timeout: 15_000 });

    // Save the settings form so the new logo URL persists
    const saveBtn = page.locator('button[type="submit"]', { hasText: /save/i }).first();
    await saveBtn.click();
    await expect(page.locator("text=Settings saved.")).toBeVisible({ timeout: 10_000 });

    // Verify the stored logo URL is an /uploads/... path
    const newLogoUrl = await getStorefrontSetting(page, "siteLogoUrl");
    expect(newLogoUrl).toMatch(/^\/uploads\//);

    // Fetch the image file directly and verify it's a real image response
    const imageResponse = await page.request.get(`${BASE}${newLogoUrl}`);
    expect(imageResponse.status()).toBe(200);
    const contentType = imageResponse.headers()["content-type"] ?? "";
    expect(contentType).toMatch(/image\//);

    // Navigate to the public homepage and verify the logo <img> has the new src
    await page.goto(`${BASE}/de`);
    const headerLogo = page.locator("header img").first();
    await expect(headerLogo).toBeVisible({ timeout: 10_000 });
    const logoSrc = await headerLogo.getAttribute("src");
    expect(logoSrc).toBe(newLogoUrl);

    // Restore original
    if (originalLogoUrl) {
      await restoreStorefrontSetting(page, "siteLogoUrl", originalLogoUrl);
    }
  });
});

// ── Founder / About-Us photo upload ──────────────────────────────────────────

test.describe("Founder photo upload", () => {
  let originalPhotoUrl = "";

  test.beforeAll(async () => {
    await ensureTestImage();
  });

  test("uploading a founder photo in admin settings shows it on the about-us page", async ({ page }) => {
    await adminLogin(page);
    originalPhotoUrl = await getStorefrontSetting(page, "founderPhotoUrl");

    await page.goto(`${BASE}/admin/settings`);

    // Find the founder photo uploader
    const founderSection = page.locator("text=Founder / team photo (About Us page)").locator("..").locator("..");
    const photoInput = founderSection.locator('input[type="file"]').first();
    await photoInput.setInputFiles(TEST_IMAGE_PATH);
    await founderSection.locator('button', { hasText: /upload image/i }).click();
    await expect(founderSection.locator("text=Image uploaded.")).toBeVisible({ timeout: 15_000 });

    // Save settings
    await page.locator('button[type="submit"]', { hasText: /save/i }).first().click();
    await expect(page.locator("text=Settings saved.")).toBeVisible({ timeout: 10_000 });

    const newPhotoUrl = await getStorefrontSetting(page, "founderPhotoUrl");
    expect(newPhotoUrl).toMatch(/^\/uploads\//);

    // Verify the image file is accessible
    const imageResponse = await page.request.get(`${BASE}${newPhotoUrl}`);
    expect(imageResponse.status()).toBe(200);
    expect(imageResponse.headers()["content-type"] ?? "").toMatch(/image\//);

    // Check it appears on the about-us page
    await page.goto(`${BASE}/de/uber-uns`);
    const founderImg = page.locator(`img[src="${newPhotoUrl}"]`);
    await expect(founderImg).toBeVisible({ timeout: 10_000 });

    // Restore
    await restoreStorefrontSetting(page, "founderPhotoUrl", originalPhotoUrl);
  });
});

// ── Blog post image upload ────────────────────────────────────────────────────

test.describe("Blog post image upload", () => {
  const TEST_SLUG = `e2e-test-post-${Date.now()}`;
  let createdPostId = "";
  let uploadedImageUrl = "";

  test.beforeAll(async () => {
    await ensureTestImage();
  });

  test.afterAll(async ({ browser }) => {
    if (!createdPostId) return;
    const ctx = await browser.newContext();
    const page = await ctx.newPage();
    try {
      await adminLogin(page);
      const token = await getAdminToken(page);
      await page.request.delete(`${API_BASE}/cms/pages/${createdPostId}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
    } finally {
      await ctx.close();
    }
  });

  test("uploading a blog image and creating a post makes the image visible on the blog page", async ({ page }) => {
    await adminLogin(page);
    const token = await getAdminToken(page);

    // Step 1: Upload the blog asset directly via API to get the imageUrl
    const formData = new FormData();
    formData.append("image", new Blob([TEST_PNG], { type: "image/png" }), "test.png");
    const uploadResponse = await page.request.post(`${API_BASE}/cms/admin/dev/blog-assets`, {
      headers: { Authorization: `Bearer ${token}` },
      multipart: {
        image: {
          name: "test.png",
          mimeType: "image/png",
          buffer: TEST_PNG
        }
      }
    });
    expect(uploadResponse.status()).toBe(201);
    const uploadData = await uploadResponse.json() as { imageUrl?: string };
    uploadedImageUrl = uploadData.imageUrl ?? "";
    expect(uploadedImageUrl).toMatch(/^\/uploads\/blog\//);

    // Step 2: Verify the uploaded image is accessible from the web server
    const imgFetch = await page.request.get(`${BASE}${uploadedImageUrl}`);
    expect(imgFetch.status()).toBe(200);
    expect(imgFetch.headers()["content-type"] ?? "").toMatch(/image\//);

    // Step 3: Create a published blog post with this image
    const createResponse = await page.request.post(`${API_BASE}/cms/posts`, {
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      data: {
        content: {
          body: "This is an E2E test post. It will be deleted automatically.",
          category: "Test",
          featureImage: uploadedImageUrl,
          images: [uploadedImageUrl],
          postType: "manual",
          published: true,
          tags: ["e2e-test"]
        },
        excerpt: "E2E test post",
        locale: "de",
        seoDescription: "E2E test",
        seoTitle: "E2E Test Post",
        slug: TEST_SLUG,
        title: "E2E Test Post",
        type: "POST"
      }
    });
    expect(createResponse.status()).toBe(201);
    const createData = await createResponse.json() as { id?: string };
    createdPostId = createData.id ?? "";
    expect(createdPostId).toBeTruthy();

    // Step 4: Navigate to the blog post page and verify image in the hero.
    // This is the authoritative check — the listing page may be ISR-cached
    // briefly on production and not reflect the new post immediately.
    await page.goto(`${BASE}/de/blog/${TEST_SLUG}`);
    const heroImg = page.locator(`img[src="${uploadedImageUrl}"]`);
    await expect(heroImg).toBeVisible({ timeout: 15_000 });

    // Step 5: Check the blog listing page (best-effort — may miss due to ISR cache)
    await page.goto(`${BASE}/de/blog`);
    const blogListImg = page.locator(`img[src="${uploadedImageUrl}"]`);
    const listVisible = await blogListImg.isVisible().catch(() => false);
    if (!listVisible) {
      console.warn(`Blog listing may be ISR-cached; new post image not yet visible. Blog post page (/de/blog/${TEST_SLUG}) passed.`);
    }
  });
});

// ── Image URL integrity check ─────────────────────────────────────────────────

test.describe("Existing uploaded images accessibility", () => {
  test("any /uploads/ URLs stored in settings return HTTP 200 with image content-type", async ({ page }) => {
    await adminLogin(page);

    const token = await getAdminToken(page);
    const response = await page.request.get(`${API_BASE}/admin/dev/billing/settings`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    const settings = await response.json() as Record<string, unknown>;

    const urlFields = ["siteLogoUrl", "faviconUrl", "founderPhotoUrl"] as const;
    for (const field of urlFields) {
      const url = typeof settings[field] === "string" ? settings[field] : "";
      if (!url || !url.startsWith("/uploads/")) continue;

      const imgResponse = await page.request.get(`${BASE}${url}`);
      expect(
        imgResponse.status(),
        `${field} (${url}) returned ${imgResponse.status()} instead of 200`
      ).toBe(200);
      expect(
        imgResponse.headers()["content-type"] ?? "",
        `${field} (${url}) has wrong content-type`
      ).toMatch(/image\//);
    }
  });
});
