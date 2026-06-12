"use client";

import { useCallback, useEffect, useState } from "react";
import { API_BASE_URL, authHeaders, dateLabel, type ApiActionLog } from "../../lib/api";
import type { Locale } from "../../lib/i18n";
import { cronJobSummary, cronLogStatus } from "../../lib/cron-log";
import { StatusPill } from "../ui/status-pill";
import styles from "./admin-dashboard.module.css";

type Tab = "system" | "cron";
type LogPage = { items: ApiActionLog[]; page: number; pageSize: number; total: number };

const PAGE_SIZE = 25;

function timeLabel(value: string, locale: Locale, timezone: string) {
  return dateLabel(value, locale, { dateStyle: "short", timeStyle: "short", timeZone: timezone });
}

export function LogsExplorer({ locale, timezone }: { locale: Locale; timezone: string }) {
  const [tab, setTab] = useState<Tab>("system");
  const [page, setPage] = useState(1);
  const [data, setData] = useState<LogPage>({ items: [], page: 1, pageSize: PAGE_SIZE, total: 0 });
  const [loading, setLoading] = useState(false);

  // Log retention setting (days). 0 = keep forever.
  const [retention, setRetention] = useState<number>(0);
  const [retentionSaved, setRetentionSaved] = useState<number>(0);
  const [savingRetention, setSavingRetention] = useState(false);
  const [retentionMsg, setRetentionMsg] = useState("");

  const load = useCallback(async (which: Tab, pageNum: number) => {
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE_URL}/admin/dev/logs?kind=${which}&page=${pageNum}&pageSize=${PAGE_SIZE}`, {
        headers: authHeaders()
      });
      const body = (await res.json()) as LogPage;
      setData({ items: body.items ?? [], page: body.page ?? pageNum, pageSize: body.pageSize ?? PAGE_SIZE, total: body.total ?? 0 });
    } catch {
      setData({ items: [], page: pageNum, pageSize: PAGE_SIZE, total: 0 });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(tab, page); }, [tab, page, load]);

  useEffect(() => {
    void fetch(`${API_BASE_URL}/admin/dev/billing/settings`, { headers: authHeaders() })
      .then((r) => r.json())
      .then((p) => { setRetention(Number(p.logRetentionDays ?? 0)); setRetentionSaved(Number(p.logRetentionDays ?? 0)); })
      .catch(() => undefined);
  }, []);

  async function saveRetention() {
    setSavingRetention(true);
    setRetentionMsg("");
    try {
      const res = await fetch(`${API_BASE_URL}/admin/dev/billing/settings`, {
        body: JSON.stringify({ logRetentionDays: Math.max(0, Math.trunc(retention)) }),
        headers: { "Content-Type": "application/json", ...authHeaders() },
        method: "PATCH"
      });
      if (!res.ok) throw new Error("save failed");
      setRetentionSaved(Math.max(0, Math.trunc(retention)));
      setRetentionMsg("Saved");
    } catch {
      setRetentionMsg("Could not save");
    } finally {
      setSavingRetention(false);
    }
  }

  const totalPages = Math.max(1, Math.ceil(data.total / PAGE_SIZE));
  const switchTab = (next: Tab) => { setTab(next); setPage(1); };

  return (
    <section className={styles.panel}>
      <div className={styles.panelHeader}>
        <div>
          <span className="eyebrow">System</span>
          <h2>Logs</h2>
        </div>
        <StatusPill label={`${data.total} ${tab === "cron" ? "cron events" : "events"}`} tone={data.total ? "good" : "neutral"} />
      </div>

      {/* Tabs */}
      <div role="tablist" style={{ display: "flex", gap: 8, padding: "0 16px 12px", borderBottom: "1px solid var(--border)" }}>
        <button
          aria-selected={tab === "system"}
          onClick={() => switchTab("system")}
          role="tab"
          type="button"
          style={tabStyle(tab === "system")}
        >
          System logs
        </button>
        <button
          aria-selected={tab === "cron"}
          onClick={() => switchTab("cron")}
          role="tab"
          type="button"
          style={tabStyle(tab === "cron")}
        >
          Cron logs
        </button>
      </div>

      {/* Retention control */}
      <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", padding: "12px 16px", color: "var(--muted)", fontSize: "0.85rem" }}>
        <label htmlFor="logRetentionDays">Keep logs for</label>
        <input
          id="logRetentionDays"
          type="number"
          min={0}
          value={retention}
          onChange={(e) => setRetention(Number(e.target.value))}
          style={{ width: 80, padding: "4px 8px", border: "1px solid var(--border)", borderRadius: 6 }}
        />
        <span>day(s) — 0 keeps logs forever. Older logs are deleted on the next cron run.</span>
        <button
          type="button"
          onClick={saveRetention}
          disabled={savingRetention || retention === retentionSaved}
          style={{ padding: "4px 12px", borderRadius: 6, border: "1px solid var(--border)", cursor: "pointer", background: retention === retentionSaved ? "var(--surface)" : "var(--dezhost)", color: retention === retentionSaved ? "var(--muted)" : "white" }}
        >
          {savingRetention ? "Saving…" : "Save"}
        </button>
        {retentionMsg && <span>{retentionMsg}</span>}
      </div>

      {/* Table */}
      {tab === "system" ? (
        <table className="table">
          <thead><tr><th>Time ({timezone})</th><th>Source</th><th>Action</th><th>Subject</th><th>Actor</th><th>Status</th><th>Message</th></tr></thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={7}>Loading…</td></tr>
            ) : data.items.length ? data.items.map((log) => (
              <tr key={`${log.source}-${log.id}`}>
                <td style={{ whiteSpace: "nowrap" }}>{timeLabel(log.createdAt, locale, timezone)}</td>
                <td>{log.source}</td>
                <td>{log.action}</td>
                <td>{log.subject}{log.subjectId ? `:${String(log.subjectId).slice(-6)}` : ""}</td>
                <td>{log.actor?.email ?? "-"}</td>
                <td>{log.status}</td>
                <td>{log.message ?? "-"}</td>
              </tr>
            )) : <tr><td colSpan={7}>No logs yet.</td></tr>}
          </tbody>
        </table>
      ) : (
        <table className="table">
          <thead><tr><th>Time ({timezone})</th><th>Job</th><th>Status</th><th>Details</th></tr></thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={4}>Loading…</td></tr>
            ) : data.items.length ? data.items.map((log) => {
              const status = cronLogStatus(log);
              return (
                <tr key={log.id}>
                  <td style={{ whiteSpace: "nowrap" }}>{timeLabel(log.createdAt, locale, timezone)}</td>
                  <td>{log.action.replace(/^cron\./, "")}</td>
                  <td><StatusPill label={status.label} tone={status.tone} /></td>
                  <td style={{ fontSize: "0.84rem" }}>{cronJobSummary(log.action, log.metadata)}</td>
                </tr>
              );
            }) : <tr><td colSpan={4}>No cron activity yet.</td></tr>}
          </tbody>
        </table>
      )}

      {/* Pagination */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 12, padding: "12px 16px" }}>
        <button type="button" onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={loading || page <= 1} style={pagerStyle(page <= 1)}>
          ← Previous
        </button>
        <span style={{ color: "var(--muted)", fontSize: "0.85rem" }}>Page {data.page} of {totalPages}</span>
        <button type="button" onClick={() => setPage((p) => Math.min(totalPages, p + 1))} disabled={loading || page >= totalPages} style={pagerStyle(page >= totalPages)}>
          Next →
        </button>
      </div>
    </section>
  );
}

function tabStyle(active: boolean): React.CSSProperties {
  return {
    background: "none",
    border: "none",
    borderBottom: active ? "2px solid var(--dezhost)" : "2px solid transparent",
    color: active ? "var(--text)" : "var(--muted)",
    cursor: "pointer",
    fontWeight: active ? 700 : 500,
    padding: "6px 4px"
  };
}

function pagerStyle(disabled: boolean): React.CSSProperties {
  return {
    background: "var(--surface)",
    border: "1px solid var(--border)",
    borderRadius: 6,
    color: disabled ? "var(--muted)" : "var(--text)",
    cursor: disabled ? "default" : "pointer",
    opacity: disabled ? 0.5 : 1,
    padding: "6px 14px"
  };
}
