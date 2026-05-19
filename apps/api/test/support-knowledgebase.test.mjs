import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { test } from "node:test";

test("ticket schema has WHMCS-style public ids, reply attachments, and answer statuses", async () => {
  const schema = await readFile(new URL("../../../prisma/schema.prisma", import.meta.url), "utf8");

  assert.match(schema, /enum TicketStatus\s*\{[\s\S]*ANSWERED[\s\S]*CUSTOMER_REPLY/);
  assert.match(schema, /model Ticket\s*\{[\s\S]*publicId\s+String\s+@unique/);
  assert.match(schema, /model TicketReply\s*\{[\s\S]*attachments\s+TicketAttachment\[]/);
  assert.match(schema, /model TicketAttachment\s*\{[\s\S]*replyId\s+String\?/);
  assert.match(schema, /model KnowledgebaseArticle\s*\{[\s\S]*slug\s+String\s+@unique[\s\S]*published\s+Boolean/);
});

test("knowledgebase public and admin APIs are wired", async () => {
  const appModule = await readFile(new URL("../src/app.module.ts", import.meta.url), "utf8");
  const controller = await readFile(new URL("../src/modules/knowledgebase/knowledgebase.controller.ts", import.meta.url), "utf8");
  const service = await readFile(new URL("../src/modules/knowledgebase/knowledgebase.service.ts", import.meta.url), "utf8");

  assert.match(appModule, /KnowledgebaseModule/);
  assert.match(controller, /@Controller\("knowledgebase"\)/);
  assert.match(controller, /@Get\(\)/);
  assert.match(controller, /@Get\("suggest"\)/);
  assert.match(controller, /@Get\(":slug"\)/);
  assert.match(controller, /@Controller\("admin\/dev\/knowledgebase"\)/);
  assert.match(controller, /@Post\(\)/);
  assert.match(controller, /@Patch\(":id"\)/);
  assert.match(controller, /@Delete\(":id"\)/);
  assert.match(service, /suggestArticles/);
});

test("ticket APIs create ids, scope access, upload files, and move statuses", async () => {
  const controller = await readFile(new URL("../src/modules/tickets/tickets.controller.ts", import.meta.url), "utf8");
  const service = await readFile(new URL("../src/modules/tickets/tickets.service.ts", import.meta.url), "utf8");
  const repository = await readFile(new URL("../src/modules/tickets/tickets.repository.ts", import.meta.url), "utf8");

  assert.match(controller, /FilesInterceptor\("files"/);
  assert.match(controller, /@Post\(":id\/attachments"\)/);
  assert.match(controller, /@Post\(":id\/close"\)/);
  assert.match(controller, /getTicket\(id, request\.user\.sub, staff\)/);
  assert.match(service, /generateTicketPublicId/);
  assert.match(service, /staff \? "ANSWERED" : "CUSTOMER_REPLY"/);
  assert.match(service, /assertTicketAccess/);
  assert.match(repository, /OR: \[\{ id \}, \{ publicId: id \}\]/);
  assert.match(repository, /orderBy: \{ updatedAt: "desc" \}/);
});

test("client support UI shows KB, suggestions, uploads, ticket threads, and close action", async () => {
  const dashboard = await readFile(new URL("../../web/components/portal/client-dashboard.tsx", import.meta.url), "utf8");

  assert.ok(existsSync(new URL("../../web/app/client/knowledgebase/page.tsx", import.meta.url)));
  assert.ok(existsSync(new URL("../../web/app/client/tickets/[ticketId]/page.tsx", import.meta.url)));
  assert.ok(existsSync(new URL("../../web/app/[locale]/knowledgebase/page.tsx", import.meta.url)));
  assert.ok(existsSync(new URL("../../web/app/[locale]/knowledgebase/[slug]/page.tsx", import.meta.url)));
  assert.match(dashboard, /href="\/client\/knowledgebase"/);
  assert.match(dashboard, /view === "knowledgebase"/);
  assert.match(dashboard, /\/knowledgebase\/suggest\?q=/);
  assert.match(dashboard, /accept="image\/png,image\/jpeg,image\/webp,application\/pdf"/);
  assert.match(dashboard, /TicketThread/);
  assert.match(dashboard, /\/tickets\/\$\{currentTicket\.id\}\/close/);
});

test("admin support UI can CRUD KB and insert KB body into replies", async () => {
  const dashboard = await readFile(new URL("../../web/components/admin/admin-dashboard.tsx", import.meta.url), "utf8");
  const support = await readFile(new URL("../../web/components/admin/admin-support.tsx", import.meta.url), "utf8");

  assert.ok(existsSync(new URL("../../web/app/admin/knowledgebase/page.tsx", import.meta.url)));
  assert.ok(existsSync(new URL("../../web/app/admin/tickets/[ticketId]/page.tsx", import.meta.url)));
  assert.match(dashboard, /href="\/admin\/knowledgebase"/);
  assert.match(dashboard, /view === "knowledgebase"/);
  assert.match(dashboard, /KnowledgebasePanel/);
  assert.match(dashboard, /admin\/dev\/knowledgebase/);
  assert.match(support, /Insert article/);
  assert.match(support, /\/tickets\/\$\{ticket\.id\}\/replies/);
});
