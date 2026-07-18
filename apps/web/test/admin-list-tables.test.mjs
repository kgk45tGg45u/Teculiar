import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

// Phase 5 — admin productivity lists: sortable/selectable DataTable (5.1), bulk
// actions looping the existing per-record endpoints (5.2), inline status dropdown (5.3).

const dataTableUrl = new URL("../../../packages/web-core/src/components/ui/data-table.tsx", import.meta.url);
const dataTableCssUrl = new URL("../../../packages/web-core/src/components/ui/data-table.module.css", import.meta.url);
const pillSelectUrl = new URL("../../../packages/web-core/src/components/ui/status-pill-select.tsx", import.meta.url);
const statusLabelsUrl = new URL("../../../packages/web-core/src/lib/status-labels.ts", import.meta.url);
const dashboardUrl = new URL("../components/admin/admin-dashboard.tsx", import.meta.url);

const tableUrl = (name) => new URL(`../components/admin/tables/${name}`, import.meta.url);
const localeUrl = (locale, ns) => new URL(`../../../packages/locales/${locale}/${ns}.json`, import.meta.url);

test("DataTable supports sortValue columns with aria-sort toggle headers", async () => {
  const source = await readFile(dataTableUrl, "utf8");
  assert.match(source, /sortValue\?: \(row: T\) => string \| number \| null \| undefined/);
  assert.match(source, /aria-sort=\{sort\?\.key === col\.key \? \(sort\.dir === "asc" \? "ascending" : "descending"\) : undefined\}/);
  assert.match(source, /initialSort\?: DataTableSort/);
  // numeric compare for numbers, localeCompare for strings, nulls last
  assert.match(source, /if \(typeof a === "number" && typeof b === "number"\) return a - b;/);
  assert.match(source, /localeCompare\(String\(b\), undefined, \{ numeric: true/);
  assert.match(source, /if \(a == null\) return 1;/);
});

test("DataTable selection: select-all checkbox, per-row toggle, bulk bar over selection", async () => {
  const source = await readFile(dataTableUrl, "utf8");
  const css = await readFile(dataTableCssUrl, "utf8");
  assert.match(source, /selectable\?: boolean/);
  assert.match(source, /bulkBar\?: \(selected: T\[\], clear: \(\) => void\) => ReactNode/);
  assert.match(source, /aria-label=\{selectLabels\?\.all/);
  assert.match(source, /aria-label=\{selectLabels\?\.row/);
  assert.match(source, /setSelectedKeys\(allSelected \? new Set\(\) : new Set\(rows\.map\(rowKey\)\)\)/);
  assert.match(css, /\.bulkBar\s*\{/);
  assert.match(css, /\.rowSelected td\s*\{/);
});

test("StatusPillSelect renders a pill trigger with a listbox of target statuses", async () => {
  const source = await readFile(pillSelectUrl, "utf8");
  assert.match(source, /aria-haspopup="listbox"/);
  assert.match(source, /role="option"/);
  assert.match(source, /if \(next === value\) return;/);
  assert.match(source, /onSelect: \(value: string\) => void \| Promise<void>/);
});

test("orders table maps admin status values onto PATCH /orders/:id/status", async () => {
  const source = await readFile(tableUrl("orders-table.tsx"), "utf8");
  assert.match(source, /\{ enumValue: "COMPLETE", value: "completed" \}/);
  assert.match(source, /\{ enumValue: "CANCELLED", value: "canceled" \}/);
  assert.match(source, /adminMutate\("PATCH", `\/orders\/\$\{order\.id\}\/status`, \{ status: value \}\)/);
  assert.match(source, /initialSort=\{\{ dir: "desc", key: "date" \}\}/);
});

test("invoices table loops mark-paid / mark-unpaid / delete with one confirm", async () => {
  const source = await readFile(tableUrl("invoices-table.tsx"), "utf8");
  assert.match(source, /`\/billing\/invoices\/\$\{invoice\.id\}\/\$\{action\}`/);
  assert.match(source, /runBulk\(selected\.map\(\(row\) => row\.id\), \(id\) => adminMutate\("POST", `\/billing\/invoices\/\$\{id\}\/\$\{action\}`/);
  assert.match(source, /adminMutate\("DELETE", `\/billing\/invoices\/\$\{id\}`\)/);
  assert.match(source, /window\.confirm\(copy\.list\.confirmDelete\)/);
  assert.match(source, /selectable/);
});

test("services table offers only admin-settable end states", async () => {
  const source = await readFile(tableUrl("services-table.tsx"), "utf8");
  assert.match(source, /SERVICE_TARGETS = \["ACTIVE", "SUSPENDED", "CANCELLED", "TERMINATED"\] as const/);
  assert.match(source, /adminMutate\("PATCH", `\/admin\/dev\/services\/\$\{service\.id\}\/status`, \{ status: value \}\)/);
  assert.doesNotMatch(source, /"PROVISIONING"[^)]*SERVICE_TARGETS/);
});

test("tickets table wires inline status + bulk spam delete", async () => {
  const source = await readFile(tableUrl("tickets-table.tsx"), "utf8");
  assert.match(source, /adminMutate\("PATCH", `\/tickets\/\$\{ticket\.id\}\/status`, \{ status: value \}\)/);
  assert.match(source, /adminMutate\("DELETE", `\/tickets\/\$\{id\}`\)/);
  assert.match(source, /TICKET_STATUS_VALUES\.map/);
});

test("admin dashboard panels render the shared tables instead of inline <table> markup", async () => {
  const source = await readFile(dashboardUrl, "utf8");
  for (const tag of ["<OrdersTable", "<InvoicesTable", "<ServicesTable", "<TicketsTable", "<ClientsTable"]) {
    assert.match(source, new RegExp(tag));
  }
  // the only remaining inline tables are the read-only domain-prices and cron-jobs panels
  const inlineTables = source.match(/<table className="table"/g) ?? [];
  assert.equal(inlineTables.length, 2);
});

test("service status labels cover the dropdown end states", async () => {
  const source = await readFile(statusLabelsUrl, "utf8");
  assert.match(source, /labels\[status\.toLowerCase\(\)\]/);
  for (const locale of ["en", "de"]) {
    const common = JSON.parse(await readFile(localeUrl(locale, "common"), "utf8"));
    for (const key of ["active", "pending", "suspended", "cancelled", "terminated"]) {
      assert.ok(common.status.service[key], `${locale} common.status.service.${key}`);
    }
  }
});

test("admin.list locale keys exist and match between en and de", async () => {
  const en = JSON.parse(await readFile(localeUrl("en", "admin"), "utf8"));
  const de = JSON.parse(await readFile(localeUrl("de", "admin"), "utf8"));
  assert.deepEqual(Object.keys(de.list ?? {}).sort(), Object.keys(en.list ?? {}).sort());
  for (const key of ["selected", "markPaid", "markUnpaid", "deleteSelected", "confirmDelete", "changeStatus", "statusSaved", "statusFailed", "selectAll", "selectRow", "bulkDone", "bulkFailed", "clearSelection"]) {
    assert.ok(en.list[key], `en admin.list.${key}`);
    assert.ok(de.list[key], `de admin.list.${key}`);
  }
});
