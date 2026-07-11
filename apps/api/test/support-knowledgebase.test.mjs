import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { test } from "node:test";

test("ticket schema has WHMCS-style public ids, reply attachments, and the consolidated statuses", async () => {
  const schema = await readFile(new URL("../../../prisma/schema.prisma", import.meta.url), "utf8");

  // Statuses reduced to OPEN / ANSWERED / CUSTOMER_REPLY / CLOSED.
  assert.match(schema, /enum TicketStatus\s*\{\s*OPEN\s*ANSWERED\s*CUSTOMER_REPLY\s*CLOSED\s*\}/);
  assert.doesNotMatch(schema, /\bWAITING_ON_CLIENT\b/);
  assert.doesNotMatch(schema, /\bWAITING_ON_STAFF\b/);
  assert.doesNotMatch(schema, /enum TicketDepartment/);

  // Dynamic departments replace the old enum.
  assert.match(schema, /model Department\s*\{[\s\S]*slug\s+String\s+@unique/);
  assert.match(schema, /model DepartmentMember\s*\{[\s\S]*@@unique\(\[departmentId, userId\]\)/);
  assert.match(schema, /model Ticket\s*\{[\s\S]*departmentId\s+String/);
  assert.match(schema, /model Ticket\s*\{[\s\S]*publicId\s+String\s+@unique/);
  assert.match(schema, /model TicketReply\s*\{[\s\S]*system\s+Boolean[\s\S]*invoiceId\s+String\?/);
  assert.match(schema, /model TicketReply\s*\{[\s\S]*attachments\s+TicketAttachment\[]/);
  assert.match(schema, /model User\s*\{[\s\S]*avatarUrl\s+String\?[\s\S]*isGuest\s+Boolean/);
  assert.match(schema, /model KnowledgebaseArticle\s*\{[\s\S]*slug\s+String\s+@unique[\s\S]*published\s+Boolean/);
});

test("departments module exposes CRUD, membership, and form routing", async () => {
  const controller = await readFile(new URL("../src/modules/departments/departments.controller.ts", import.meta.url), "utf8");
  const appModule = await readFile(new URL("../src/app.module.ts", import.meta.url), "utf8");

  assert.match(appModule, /DepartmentsModule/);
  assert.match(controller, /@Controller\("admin\/dev\/departments"\)/);
  assert.match(controller, /@Post\(\)/);
  assert.match(controller, /@Patch\(":id"\)/);
  assert.match(controller, /@Delete\(":id"\)/);
  assert.match(controller, /@Post\(":id\/members"\)/);
  assert.match(controller, /@Delete\(":id\/members\/:userId"\)/);
  assert.match(controller, /@Put\("routing"\)/);
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
  assert.match(controller, /@Post\(":id\/invoice-message"\)/);
  assert.match(controller, /getTicket\(id, actorOf\(request\)\)/);
  assert.match(service, /generateTicketPublicId/);
  assert.match(service, /staff \? "ANSWERED" : "CUSTOMER_REPLY"/);
  assert.match(service, /createTicketAsAdmin/);
  assert.match(service, /assertAccess/);
  assert.match(repository, /OR: \[\{ id \}, \{ publicId: id \}\]/);
  assert.match(repository, /orderBy: \{ updatedAt: "desc" \}/);
  // Auto-close cron stays consistent with the new flow: only ANSWERED tickets
  // (staff replied, awaiting client) go stale and close; a client reply flips
  // status to CUSTOMER_REPLY and bumps updatedAt, so it won't auto-close.
  assert.match(repository, /findAnsweredOlderThan[\s\S]*status: "ANSWERED", updatedAt: \{ lte: cutoff \}/);
  // …and the cron emails each client that their ticket was closed.
  assert.match(service, /closeAnsweredTickets[\s\S]*findAnsweredOlderThan[\s\S]*dispatchTicketEmail\("ticket_closed"/);
});

test("client support UI shows KB, suggestions, uploads, ticket threads, and close action", async () => {
  const dashboard = await readFile(new URL("../../web/components/portal/client-dashboard.tsx", import.meta.url), "utf8");

  assert.ok(existsSync(new URL("../../web/app/client/knowledgebase/page.tsx", import.meta.url)));
  assert.ok(existsSync(new URL("../../web/app/client/tickets/[ticketId]/page.tsx", import.meta.url)));
  assert.ok(existsSync(new URL("../../storefront/app/[locale]/knowledgebase/page.tsx", import.meta.url)));
  assert.ok(existsSync(new URL("../../storefront/app/[locale]/knowledgebase/[slug]/page.tsx", import.meta.url)));
  assert.match(dashboard, /href="\/client\/knowledgebase"/);
  assert.match(dashboard, /view === "knowledgebase"/);
  assert.match(dashboard, /\/knowledgebase\/suggest\?q=/);
  assert.match(dashboard, /accept="image\/png,image\/jpeg,image\/webp,application\/pdf"/);
  assert.match(dashboard, /TicketThread/);
  assert.match(dashboard, /\/tickets\/\$\{currentTicket\.id\}\/close/);
});

test("admin support UI can CRUD KB and insert KB body into replies", async () => {
  const dashboard = await readFile(new URL("../../web/components/admin/admin-dashboard.tsx", import.meta.url), "utf8");
  const sidebar = await readFile(new URL("../../web/components/admin/admin-sidebar.tsx", import.meta.url), "utf8");
  const support = await readFile(new URL("../../web/components/admin/admin-support.tsx", import.meta.url), "utf8");

  assert.ok(existsSync(new URL("../../web/app/admin/knowledgebase/page.tsx", import.meta.url)));
  assert.ok(existsSync(new URL("../../web/app/admin/tickets/[ticketId]/page.tsx", import.meta.url)));
  assert.match(sidebar, /href: "\/admin\/knowledgebase"/);
  assert.match(dashboard, /view === "knowledgebase"/);
  assert.match(dashboard, /KnowledgebasePanel/);
  assert.match(dashboard, /admin\/dev\/knowledgebase/);
  assert.match(support, /\{c\.insertArticle\}/); // localized "Insert article" label on the KB picker
  assert.match(support, /\/tickets\/\$\{ticket\.id\}\/replies/);
});
