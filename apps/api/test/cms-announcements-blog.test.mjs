import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import { CmsService } from "../dist/modules/cms/cms.service.js";

test("client announcements are user scoped and can be read or hidden", async () => {
  const calls = [];
  const cms = {
    hideAnnouncement: async (announcementId, userId) => calls.push(["hide", announcementId, userId]),
    listClientAnnouncements: async (userId, locale) => {
      calls.push(["list-client", userId, locale]);
      return [{ id: "announcement-1", isRead: false, title: "Maintenance" }];
    },
    markAnnouncementRead: async (announcementId, userId) => calls.push(["read", announcementId, userId])
  };
  const service = new CmsService(cms, { localeFromIp: () => "de" });

  const rows = await service.listClientAnnouncements("user-1", "de");
  await service.markAnnouncementRead("announcement-1", "user-1");
  await service.hideAnnouncement("announcement-1", "user-1");

  assert.deepEqual(rows, [{ id: "announcement-1", isRead: false, title: "Maintenance" }]);
  assert.deepEqual(calls, [
    ["list-client", "user-1", "de"],
    ["read", "announcement-1", "user-1"],
    ["hide", "announcement-1", "user-1"]
  ]);
});

test("blog listing accepts tag filters and stays separate from announcements", async () => {
  const calls = [];
  const cms = {
    listPosts: async (locale, filters) => {
      calls.push(["posts", locale, filters]);
      return [{ id: "post-1", title: "Hosting", tags: ["hosting"] }];
    },
    listPostTags: async (locale) => {
      calls.push(["tags", locale]);
      return ["hosting"];
    }
  };
  const service = new CmsService(cms, { localeFromIp: () => "de" });

  assert.deepEqual(await service.listPosts("de", { tag: "hosting" }), [{ id: "post-1", title: "Hosting", tags: ["hosting"] }]);
  assert.deepEqual(await service.listPostTags("de"), ["hosting"]);
  assert.deepEqual(calls, [
    ["posts", "de", { tag: "hosting" }],
    ["tags", "de"]
  ]);
});

test("cms schema and routes model announcements outside blog posts", async () => {
  const schema = await readFile(new URL("../../../prisma/schema.prisma", import.meta.url), "utf8");
  const controller = await readFile(new URL("../src/modules/cms/cms.controller.ts", import.meta.url), "utf8");

  assert.match(schema, /model Announcement\s*\{[\s\S]*publishedAt\s+DateTime/);
  assert.match(schema, /model AnnouncementRead\s*\{[\s\S]*hiddenAt\s+DateTime\?/);
  assert.match(schema, /@@unique\(\[announcementId, userId\]\)/);
  assert.match(controller, /@Get\("admin\/dev\/announcements"\)/);
  assert.match(controller, /@Patch\("admin\/dev\/announcements\/:id"\)/);
  assert.match(controller, /@Delete\("admin\/dev\/announcements\/:id"\)/);
  assert.match(controller, /@Post\("announcements\/:id\/read"\)/);
  assert.match(controller, /@Post\("announcements\/:id\/hide"\)/);
});

test("manual blog UI exposes photo, category, tags, rich text, and tag pages", async () => {
  const adminForms = await readFile(new URL("../../web/components/admin/admin-forms.tsx", import.meta.url), "utf8");
  const packageJson = await readFile(new URL("../../web/package.json", import.meta.url), "utf8");
  const blogPage = await readFile(new URL("../../web/app/[locale]/blog/page.tsx", import.meta.url), "utf8");
  const blogPostPage = await readFile(new URL("../../web/app/[locale]/blog/[slug]/page.tsx", import.meta.url), "utf8");
  const tagPage = await readFile(new URL("../../web/app/[locale]/blog/tag/[tag]/page.tsx", import.meta.url), "utf8");

  assert.match(adminForms, /Feature photo/);
  assert.match(adminForms, /Category/);
  assert.match(adminForms, /Tags/);
  assert.match(adminForms, /useEditor/);
  assert.match(adminForms, /EditorContent/);
  assert.match(adminForms, /StarterKit/);
  assert.doesNotMatch(adminForms, /execCommand/);
  assert.match(adminForms, /dir="ltr"/);
  assert.match(adminForms, /blog-assets/);
  assert.match(packageJson, /@tiptap\/react/);
  assert.match(packageJson, /@tiptap\/starter-kit/);
  assert.match(blogPage, /\/cms\/post-tags/);
  assert.match(blogPage, /featureImage/);
  assert.match(blogPage, /post\.tags/);
  assert.doesNotMatch(blogPostPage, /className="eyebrow"/);
  assert.match(tagPage, /tag=/);
});

test("site chrome has collapsible mobile nav, panel branding, and refined client login", async () => {
  const header = await readFile(new URL("../../web/components/layout/site-header.tsx", import.meta.url), "utf8");
  const mobileMenu = await readFile(new URL("../../web/components/layout/mobile-menu.tsx", import.meta.url), "utf8");
  const headerCss = await readFile(new URL("../../web/components/layout/site-header.module.css", import.meta.url), "utf8");
  const footer = await readFile(new URL("../../web/components/layout/site-footer.tsx", import.meta.url), "utf8");
  const footerCss = await readFile(new URL("../../web/components/layout/site-footer.module.css", import.meta.url), "utf8");

  assert.match(header, /<MobileMenu/);
  assert.match(mobileMenu, /className=\{styles\.mobileMenu\}/);
  assert.match(mobileMenu, /aria-label=\{open \? "Close menu" : "Open menu"\}/);
  assert.match(header, /<AccountMenu \/>/);
  assert.doesNotMatch(header, /<ThemeToggle/);
  assert.match(headerCss, /\.mobileMenu/);
  assert.match(headerCss, /position:\s*sticky/);
  assert.match(headerCss, /@media \(max-width: 980px\)[\s\S]*\.mobileMenu/);
  assert.match(headerCss, /\.clientLogin/);
  assert.match(headerCss, /border-radius:\s*999px/);
  assert.match(footer, /brandLabel = isPanel \? "Teculiar" : "Dezhost"/);
  assert.match(footerCss, /\.footer/);
});
