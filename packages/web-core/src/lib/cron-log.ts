// Cron audit rows carry their detail in `metadata`. These helpers turn that into a status pill
// label/tone and a one-line, human-readable summary per job (counts, invoice numbers, status
// changes, …). Shared between the server admin dashboard and the client Logs explorer.
import type { ApiActionLog } from "./api";

export type CronTone = "good" | "warn" | "neutral" | "danger";

export function cnum(v: unknown): number {
  return typeof v === "number" && Number.isFinite(v) ? v : 0;
}
export function crec(v: unknown): Record<string, unknown> {
  return v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : {};
}
export function carr(v: unknown): unknown[] {
  return Array.isArray(v) ? v : [];
}
function cronInvoiceList(v: unknown, max = 4): string {
  const items = carr(v).map((x) => `#${crec(x).invoiceNumber ?? crec(x).id ?? "?"}`);
  if (!items.length) return "";
  return items.length > max ? `${items.slice(0, max).join(", ")} +${items.length - max}` : items.join(", ");
}
function cronDuration(ms: unknown): string {
  const n = cnum(ms);
  return n < 1000 ? `${n} ms` : `${(n / 1000).toFixed(1)} s`;
}
function cronGenericSummary(r: Record<string, unknown>): string {
  const keys = Object.keys(r);
  if (!keys.length) return "OK";
  const nums = keys.filter((k) => typeof r[k] === "number");
  if (nums.length) return nums.map((k) => `${k}: ${cnum(r[k])}`).join(", ");
  const s = JSON.stringify(r);
  return s.length > 120 ? `${s.slice(0, 117)}…` : s;
}

export function cronLogStatus(log: ApiActionLog): { label: string; tone: CronTone } {
  const m = crec(log.metadata);
  if (log.action === "cron.unauthorized") return { label: "rejected", tone: "danger" };
  if (log.action === "cron.started") return { label: "started", tone: "neutral" };
  if (log.action === "cron.completed") {
    const failed = cnum(m.failedCount);
    return failed ? { label: `${failed} failed`, tone: "danger" } : { label: "completed", tone: "good" };
  }
  if (m.status === "failed" || m.error) return { label: "failed", tone: "danger" };
  if (crec(m.result).skipped) return { label: "skipped", tone: "warn" };
  return { label: "ran", tone: "good" };
}

export function cronJobSummary(action: string, metadata?: Record<string, unknown> | null): string {
  const m = crec(metadata);
  if (action === "cron.unauthorized") return String(m.reason ?? "Invalid or missing cron secret");
  if (action === "cron.started") return "Cron triggered — checking which jobs are due";
  if (action === "cron.completed") {
    return `${cnum(m.ranCount)} ran · ${cnum(m.failedCount)} failed · ${cnum(m.skippedCount)} skipped · ${cronDuration(m.durationMs)}`;
  }
  if (m.error) return `Failed: ${String(m.error)}`;
  const r = crec(m.result);
  if (r.skipped) return `Skipped: ${String(r.reason ?? "not due")}`;

  switch (action) {
    case "cron.billingMaintenance": {
      const ap = crec(r.automaticPayments);
      const parts = [
        `${cnum(r.generatedInvoices)} invoice(s) generated`,
        `${cnum(r.overdueInvoices)} overdue`,
        `${cnum(r.suspendedServices)} suspended`,
        `${cnum(ap.paid)} auto-paid${cronInvoiceList(ap.paidInvoices) ? ` (${cronInvoiceList(ap.paidInvoices)})` : ""}`
      ];
      if (cnum(ap.failed)) parts.push(`${cnum(ap.failed)} payment(s) failed`);
      const pruned = crec(r.prunedLogs);
      if (cnum(pruned.auditLogs) || cnum(pruned.moduleLogs)) {
        parts.push(`pruned ${cnum(pruned.auditLogs) + cnum(pruned.moduleLogs)} old log(s)`);
      }
      return parts.join(" · ");
    }
    case "cron.invoiceReminders": {
      const n = cnum(r.invoiceReminders);
      return n ? `Sent ${n} reminder(s): ${cronInvoiceList(r.reminderList)}` : "No reminders due";
    }
    case "cron.ticketsClose": {
      const n = cnum(r.count);
      return n ? `Closed ${n} answered ticket(s)` : "No tickets to close";
    }
    case "cron.mailboxes": {
      const imported = cnum(r.imported);
      const byDept = crec(r.byDepartment);
      const dept = Object.keys(byDept).length
        ? ` — ${Object.entries(byDept).map(([d, c]) => `${d}: ${cnum(c)}`).join(", ")}`
        : "";
      const errs = carr(r.mailboxes)
        .filter((mb) => crec(mb).error)
        .map((mb) => `${crec(mb).address}: ${crec(mb).error}`);
      const base = imported ? `Imported ${imported} email(s)${dept}` : "No new emails";
      return errs.length ? `${base} · errors: ${errs.join("; ")}` : base;
    }
    case "cron.hostingStatuses": {
      const changes = carr(r.changed);
      if (!changes.length) return `${cnum(r.checked)} checked, no status changes`;
      return `${changes.length} change(s): ${changes.map((c) => `${crec(c).domain} ${crec(c).from}→${crec(c).to}`).join(", ")}`;
    }
    case "cron.domainStatuses":
    case "cron.domainExpirations":
      return `${cnum(r.refreshed)}/${cnum(r.checked)} domain(s) refreshed`;
    case "cron.sitemap":
      return `${cnum(r.urls)} URLs (de ${cnum(r.de)}, en ${cnum(r.en)})${cnum(r.posts) ? `, ${cnum(r.posts)} blog post(s)` : ""} · live route`;
    case "cron.aiBlogPost": {
      // The main cron only TRIGGERS this job; the article is generated asynchronously and logs its
      // own completion row, so handle both the trigger and the result here.
      if (r.triggered === true) return "AI generation started in background";
      if (r.triggered === false) return `Not triggered: ${String(r.reason ?? "already running")}`;
      const created = cnum(r.created);
      if (created) {
        const titles = carr(r.titles).map((t) => `“${String(t)}”`);
        return `Created ${created} article(s)${titles.length ? `: ${titles.join(", ")}` : ""}`;
      }
      return r.reason ? `Skipped: ${String(r.reason)}` : "No article created";
    }
    default:
      return cronGenericSummary(r);
  }
}
