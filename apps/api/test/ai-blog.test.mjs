import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";

// ── AiBlogService unit tests ─────────────────────────────────────────────────

test("generateArticle rejects when deepseek API key is missing", async () => {
  const { AiBlogService } = await import("../dist/modules/cms/ai-blog.service.js");
  const service = new AiBlogService({});
  await assert.rejects(
    () => service.generateArticle({}, "author-1"),
    /Deepseek API key is not configured/
  );
});

test("generateArticle rejects when topics pool is empty", async () => {
  const { AiBlogService } = await import("../dist/modules/cms/ai-blog.service.js");
  const service = new AiBlogService({});
  await assert.rejects(
    () => service.generateArticle({ deepseekApiKey: "sk-test", aiBlogTopicsPool: "" }, "author-1"),
    /Topics pool is empty/
  );
});

test("generateArticle rejects when topics pool has only whitespace", async () => {
  const { AiBlogService } = await import("../dist/modules/cms/ai-blog.service.js");
  const service = new AiBlogService({});
  await assert.rejects(
    () => service.generateArticle({ deepseekApiKey: "sk-test", aiBlogTopicsPool: "   \n\n  " }, "author-1"),
    /Topics pool is empty/
  );
});

test("generateArticle creates a post when Deepseek returns valid JSON", async () => {
  const { AiBlogService } = await import("../dist/modules/cms/ai-blog.service.js");

  const calls = [];

  const angleResponse = "A practical guide to choosing between shared and VPS hosting";
  const articleJson = {
    title: "Shared vs VPS Hosting: The Complete Guide",
    slug: "shared-vs-vps-hosting-guide",
    excerpt: "Learn the key differences between shared and VPS hosting to make the right choice for your website.",
    body: "<h2>Introduction</h2><p>Choosing the right hosting type is crucial.</p>",
    tags: ["hosting", "vps", "shared-hosting"],
    seoTitle: "Shared vs VPS Hosting Guide 2026",
    seoDescription: "Compare shared and VPS hosting to find the best option for your needs and budget."
  };

  const cms = {
    listAdminPosts: async () => [],
    listBlogCategories: async () => [{ id: "cat-1", name: "Hosting", slug: "hosting" }],
    findOrCreateTag: async (name) => {
      calls.push(["findOrCreateTag", name]);
      return { id: `tag-${name}`, name };
    },
    createContent: async (dto, authorId) => {
      calls.push(["createContent", dto.title, authorId, dto.locale]);
      return { id: "post-1", title: dto.title };
    }
  };

  let callCount = 0;
  const service = new AiBlogService(cms);
  // Override callDeepseek to return controlled responses
  service.callDeepseek = async (_key, _messages, format) => {
    callCount++;
    if (callCount === 1) return angleResponse;
    if (format === "json_object") return JSON.stringify(articleJson);
    // Translation call
    return JSON.stringify({
      title: "Shared vs VPS Hosting: Der vollständige Leitfaden",
      slug: "shared-vs-vps-hosting-leitfaden",
      excerpt: "Lernen Sie den Unterschied zwischen Shared und VPS Hosting.",
      body: "<h2>Einführung</h2><p>Die richtige Hosting-Wahl ist entscheidend.</p>",
      tags: ["hosting", "vps", "shared-hosting"],
      seoTitle: "Shared vs VPS Hosting Leitfaden 2026",
      seoDescription: "Vergleichen Sie Shared und VPS Hosting um die beste Wahl zu treffen."
    });
  };

  const result = await service.generateArticle(
    { deepseekApiKey: "sk-test", aiBlogTopicsPool: "Web hosting\nVPS hosting", aiBlogLanguage: "en" },
    "author-1"
  );

  assert.equal(result?.id, "post-1");
  assert.equal(result?.title, articleJson.title);

  // Tags were resolved
  assert.ok(calls.some(([action]) => action === "findOrCreateTag"), "Tags should be resolved");
  // Content was created with the right author
  assert.ok(calls.some(([action, , authorId]) => action === "createContent" && authorId === "author-1"));
  // The translation is saved as a second full post in the opposite locale (en source → de)
  assert.ok(
    calls.some(([action, , , locale]) => action === "createContent" && locale === "de"),
    "Translation post should be created in the target locale"
  );
});

test("generateArticle handles invalid JSON from Deepseek gracefully", async () => {
  const { AiBlogService } = await import("../dist/modules/cms/ai-blog.service.js");

  const cms = {
    listAdminPosts: async () => [],
    listBlogCategories: async () => []
  };

  let callCount = 0;
  const service = new AiBlogService(cms);
  service.callDeepseek = async () => {
    callCount++;
    if (callCount === 1) return "A fresh angle on web hosting security";
    return "Sorry, I cannot generate JSON for this request."; // Bad response
  };

  await assert.rejects(
    () => service.generateArticle({ deepseekApiKey: "sk-test", aiBlogTopicsPool: "Security" }, "author-1"),
    /invalid JSON/i
  );
});

// ── CmsService.generateAiBlogPost unit tests ─────────────────────────────────

test("generateAiBlogPost skips when daily limit is reached", async () => {
  const { CmsService } = await import("../dist/modules/cms/cms.service.js");

  const cms = {
    // Each article = source post + translation, so 6 rows today = 3 articles (the daily target).
    countAiPostsToday: async () => 6,
    listAdminPosts: async () => [],
    createContent: async () => assert.fail("should not create content"),
    // other stubs
    findBySlug: async () => null,
    findPublishedPost: async () => null,
    listPosts: async () => [],
    listPostTags: async () => [],
    listAdminAnnouncements: async () => [],
    listClientAnnouncements: async () => [],
    markAnnouncementRead: async () => ({}),
    hideAnnouncement: async () => ({}),
    createAnnouncement: async () => ({}),
    updateAnnouncement: async () => ({}),
    deleteAnnouncement: async () => ({}),
    updateContent: async () => ({}),
    deleteContent: async () => ({}),
    findContent: async () => null,
    createTranslation: async () => ({}),
    manualOverride: async () => ({}),
    listBlogCategories: async () => [],
    listBlogTags: async () => [],
    createBlogCategory: async () => ({}),
    updateBlogCategory: async () => ({}),
    deleteBlogCategory: async () => ({}),
    createBlogTag: async () => ({}),
    updateBlogTag: async () => ({}),
    deleteBlogTag: async () => ({}),
    findOrCreateTag: async () => ({}),
    findFirstAdminId: async () => null
  };
  const translations = { localeFromIp: () => "de", translate: async () => ({}) };
  const aiBlog = {};
  const billing = { cronSettings: async () => ({}) };

  const service = new CmsService(cms, translations, aiBlog, billing);
  const result = await service.generateAiBlogPost({ aiBlogArticlesPerDay: 3 }, "system");

  assert.equal(result.skipped, true);
  assert.match(result.reason, /Daily target/);
});

test("generateAiBlogPost skips when no admin user exists", async () => {
  const { CmsService } = await import("../dist/modules/cms/cms.service.js");

  const cms = {
    countAiPostsToday: async () => 0,
    findFirstAdminId: async () => null,
    listAdminPosts: async () => [],
    // stubs
    findBySlug: async () => null, findPublishedPost: async () => null, listPosts: async () => [],
    listPostTags: async () => [], listAdminAnnouncements: async () => [], listClientAnnouncements: async () => [],
    markAnnouncementRead: async () => ({}), hideAnnouncement: async () => ({}), createAnnouncement: async () => ({}),
    updateAnnouncement: async () => ({}), deleteAnnouncement: async () => ({}), updateContent: async () => ({}),
    deleteContent: async () => ({}), findContent: async () => null, createTranslation: async () => ({}),
    manualOverride: async () => ({}), listBlogCategories: async () => [], listBlogTags: async () => [],
    createBlogCategory: async () => ({}), updateBlogCategory: async () => ({}), deleteBlogCategory: async () => ({}),
    createBlogTag: async () => ({}), updateBlogTag: async () => ({}), deleteBlogTag: async () => ({}),
    findOrCreateTag: async () => ({}), createContent: async () => assert.fail("should not create")
  };
  const translations = { localeFromIp: () => "de", translate: async () => ({}) };
  const aiBlog = {};
  const billing = { cronSettings: async () => ({}) };

  const service = new CmsService(cms, translations, aiBlog, billing);
  const result = await service.generateAiBlogPost({ deepseekApiKey: "sk-test", aiBlogTopicsPool: "Hosting" }, "system");

  assert.equal(result.skipped, true);
  assert.match(result.reason, /No admin user/);
});

test("generateAiBlogPost resolves system to first admin and calls generateArticle", async () => {
  const { CmsService } = await import("../dist/modules/cms/cms.service.js");

  const calls = [];
  const cms = {
    countAiPostsToday: async () => 0,
    findFirstAdminId: async () => { calls.push("findFirstAdminId"); return "admin-user-1"; },
    // stubs
    findBySlug: async () => null, findPublishedPost: async () => null, listPosts: async () => [],
    listPostTags: async () => [], listAdminAnnouncements: async () => [], listClientAnnouncements: async () => [],
    markAnnouncementRead: async () => ({}), hideAnnouncement: async () => ({}), createAnnouncement: async () => ({}),
    updateAnnouncement: async () => ({}), deleteAnnouncement: async () => ({}), updateContent: async () => ({}),
    deleteContent: async () => ({}), findContent: async () => null, createTranslation: async () => ({}),
    manualOverride: async () => ({}), listBlogCategories: async () => [], listBlogTags: async () => [],
    createBlogCategory: async () => ({}), updateBlogCategory: async () => ({}), deleteBlogCategory: async () => ({}),
    createBlogTag: async () => ({}), updateBlogTag: async () => ({}), deleteBlogTag: async () => ({}),
    findOrCreateTag: async () => ({})
  };
  const translations = { localeFromIp: () => "de", translate: async () => ({}) };
  const aiBlog = {
    generateArticle: async (settings, authorId) => {
      calls.push(["generateArticle", authorId]);
      return { id: "post-1", title: "Post One" };
    }
  };
  const billing = { cronSettings: async () => ({}) };

  const service = new CmsService(cms, translations, aiBlog, billing);
  const result = await service.generateAiBlogPost({ deepseekApiKey: "sk-test", aiBlogTopicsPool: "Hosting" }, "system");

  // The run reports the generated titles; the count stub never advances, so the
  // catch-up loop stops after the first article.
  assert.equal(result.ok, true);
  assert.deepEqual(result.titles, ["Post One"]);
  assert.ok(calls.includes("findFirstAdminId"), "Should look up the first admin");
  assert.ok(calls.some(([action, authorId]) => action === "generateArticle" && authorId === "admin-user-1"), "Should pass resolved admin ID");
});

// ── Schema / controller structural checks ─────────────────────────────────────

test("AI blog tables exist in Prisma schema", async () => {
  const schema = await readFile(new URL("../../../prisma/schema.prisma", import.meta.url), "utf8");

  assert.match(schema, /model BlogCategory\s*\{/);
  assert.match(schema, /model BlogTag\s*\{/);
  assert.match(schema, /model ContentCategory\s*\{/);
  assert.match(schema, /model ContentTag\s*\{/);
  assert.match(schema, /blogCategories\s+ContentCategory\[\]/);
  assert.match(schema, /blogTags\s+ContentTag\[\]/);
});

test("CMS controller exposes AI blog generate endpoint", async () => {
  const controller = await readFile(new URL("../src/modules/cms/cms.controller.ts", import.meta.url), "utf8");

  assert.match(controller, /@Post\("admin\/dev\/ai-blog\/generate"\)/);
  assert.match(controller, /generateAiBlogPost/);
});

test("AI blog service endpoints are admin-only", async () => {
  const controller = await readFile(new URL("../src/modules/cms/cms.controller.ts", import.meta.url), "utf8");

  // The generate endpoint must be guarded (staff roles allowed; never public)
  assert.match(controller, /UseGuards\(JwtAuthGuard, RolesGuard\)/);
  assert.match(controller, /@Roles\("admin", "super_admin", "support_agent"\)\s*\n\s*@Post\("admin\/dev\/ai-blog\/generate"\)/);
});

test("AiBlogService uses json_object mode for article writing", async () => {
  const serviceSource = await readFile(new URL("../src/modules/cms/ai-blog.service.ts", import.meta.url), "utf8");

  assert.match(serviceSource, /json_object/);
  assert.match(serviceSource, /response_format/);
});

test("cron job only runs AI blog when both enabled flag and API key are present", async () => {
  const cronSource = await readFile(new URL("../src/modules/cron/cron.service.ts", import.meta.url), "utf8");

  assert.match(cronSource, /aiBlogEnabled.*deepseekApiKey|deepseekApiKey.*aiBlogEnabled/);
  assert.match(cronSource, /generateAiBlogPost/);
});
