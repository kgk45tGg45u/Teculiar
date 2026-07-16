import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";

// Regression guard for the read-only "agent" role (restricted, PII-masked credential used for
// automated dashboard testing — see pii-mask.ts and AgentWriteBlockGuard). The real enforcement
// is AgentWriteBlockGuard (structural, path-prefix scoped), but this test keeps the @Roles(...)
// decorators honest too, so a future edit that silently grants "agent" write access on a
// customer-linked route gets caught here instead of in production.

const AGENT_TOKEN = '"agent"';

async function read(relativePath) {
  return readFile(new URL(relativePath, import.meta.url), "utf8");
}

// Every `@Roles(...)` line containing "agent" must be immediately followed (skipping other
// decorators/comments) by a `@Get(` — this holds for users.controller.ts and orders.controller.ts,
// where every @Roles(...) is method-level (no class-level grant that could leak into a mutation).
function assertAgentOnlyOnGet(source, label) {
  const lines = source.split("\n");
  for (let i = 0; i < lines.length; i++) {
    if (!lines[i].includes("@Roles(") || !lines[i].includes(AGENT_TOKEN)) continue;
    let j = i + 1;
    while (j < lines.length && (lines[j].trim() === "" || lines[j].trim().startsWith("//") || lines[j].trim().startsWith("@UseGuards"))) {
      j++;
    }
    assert.match(lines[j] ?? "", /@Get\(/, `${label}: line ${i + 1} grants "agent" but the next route decorator isn't @Get — got: ${lines[j]}`);
  }
}

test("users.controller.ts grants agent only on GET routes", async () => {
  const source = await read("../src/modules/users/users.controller.ts");
  assertAgentOnlyOnGet(source, "users.controller.ts");
});

test("orders.controller.ts grants agent only on GET routes", async () => {
  const source = await read("../src/modules/orders/orders.controller.ts");
  assertAgentOnlyOnGet(source, "orders.controller.ts");
});

test("billing.controller.ts: mutating routes that inherit the BillingDevController class-level agent grant have an explicit non-agent override", async () => {
  const source = await read("../src/modules/billing/billing.controller.ts");
  assert.match(source, /@Roles\("admin", "staff", "super_admin", "support_agent", "sales_agent"\)\s*\n\s*@Patch\("services\/:id\/status"\)/);
  assert.match(source, /@Roles\("admin", "staff", "super_admin", "support_agent", "sales_agent"\)\s*\n\s*@Post\("module-logs\/:id\/retry"\)/);
});

test("tickets.controller.ts: TicketsDevController's create-ticket POST has an explicit non-agent override", async () => {
  const source = await read("../src/modules/tickets/tickets.controller.ts");
  assert.match(source, /@Roles\("admin", "staff", "super_admin", "support_agent", "sales_agent"\)\s*\n\s*@Post\(\)\s*\n\s*createTicket/);
});

test("products.controller.ts: service-refresh and service-status routes are excluded from agent", async () => {
  const source = await read("../src/modules/products/products.controller.ts");
  assert.match(source, /@Roles\("admin", "staff", "super_admin"\)\s*\n\s*@Post\("admin\/dev\/services\/refresh"\)/);
  assert.match(source, /@Roles\("admin", "staff", "super_admin"\)\s*\n\s*@Patch\("admin\/dev\/services\/:id\/status"\)/);
});

function hasAgentRolesGrant(source) {
  return source.split("\n").some((line) => line.includes("@Roles(") && line.includes(AGENT_TOKEN));
}

test("cron.controller.ts never grants agent (real billing/provisioning sweep)", async () => {
  const cron = await read("../src/modules/cron/cron.controller.ts");
  assert.ok(!hasAgentRolesGrant(cron), "cron.controller.ts must not grant agent in any @Roles(...) decorator");
});

test("email.controller.ts may grant agent ONLY while the guard blocks its mutating routes", async () => {
  const email = await read("../src/modules/email/email.controller.ts");
  const guard = await read("../src/common/guards/agent-write-block.guard.ts");
  if (hasAgentRolesGrant(email)) {
    assert.ok(guard.includes('"/admin/dev/emails"'), "email grants agent, so BLOCKED_PREFIXES must cover /admin/dev/emails (real sends live on POST routes here)");
  }
});

test("hosting panel access is explicitly denied to agent in products.service.ts", async () => {
  const source = await read("../src/modules/products/products.service.ts");
  const panelBlocks = source.match(/if \(shouldMask\(user\?\.roles\)\) \{\s*\n\s*throw new ForbiddenException/g) ?? [];
  assert.ok(panelBlocks.length >= 2, "hostingControlPanel and hostingControlAction must both refuse the agent role");
});

test("AgentWriteBlockGuard is registered as a global APP_GUARD", async () => {
  const appModule = await read("../src/app.module.ts");
  assert.match(appModule, /provide:\s*APP_GUARD,\s*useClass:\s*AgentWriteBlockGuard/);
});

test("tickets.service.ts grants agent full list/view visibility (masked by the controller) via FULL_ACCESS_ROLES", async () => {
  const source = await read("../src/modules/tickets/tickets.service.ts");
  assert.match(source, /const FULL_ACCESS_ROLES = \[[^\]]*"agent"[^\]]*\];/);
});

test("AgentWriteBlockGuard's BLOCKED_PREFIXES cover every customer-linked route namespace", async () => {
  const guard = await read("../src/common/guards/agent-write-block.guard.ts");
  for (const prefix of [
    '"/users"',
    '"/orders"',
    '"/billing"',
    '"/tickets"',
    '"/services"',
    '"/cron"',
    '"/admin/dev/billing"',
    '"/admin/dev/services"',
    '"/admin/dev/module-logs"',
    '"/admin/dev/tickets"',
    '"/admin/dev/admins"',
    '"/admin/dev/emails"'
  ]) {
    assert.ok(guard.includes(prefix), `BLOCKED_PREFIXES missing ${prefix}`);
  }
});

test("agent-visible detail reads are masked in the service layer (order/invoice/service)", async () => {
  const orders = await read("../src/modules/orders/orders.service.ts");
  const billing = await read("../src/modules/billing/billing.service.ts");
  const products = await read("../src/modules/products/products.service.ts");
  assert.match(orders, /shouldMask\(user\?\.roles\) \? maskOrder\(order\) : order/);
  assert.match(billing, /shouldMask\(user\?\.roles\) \? maskInvoice\(invoice\) : invoice/);
  assert.match(products, /shouldMask\(user\?\.roles\) \? maskService\(service\) : service/);
});
