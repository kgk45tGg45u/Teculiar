"use client";

import { Plus, Trash2 } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { API_BASE_URL, authFetch } from "@dezhost/web-core/lib/api";
import { Button } from "@dezhost/web-core/components/ui/button";
import { notifyResponse } from "@dezhost/web-core/components/ui/toast-provider";
import styles from "../admin-dashboard.module.css";
import type { AdminRedirect, TB } from "./types";

const lbl: React.CSSProperties = { display: "grid", gap: 4, fontSize: "0.84rem", color: "var(--muted)" };
const chk: React.CSSProperties = { display: "inline-flex", alignItems: "center", gap: 6 };

export function RedirectsTab({ t }: { t: TB }) {
  const [rows, setRows] = useState<AdminRedirect[] | null>(null);
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");

  const reload = useCallback(async () => {
    const res = await authFetch(`${API_BASE_URL}/admin/dev/redirects`, {}, "admin");
    if (res.ok) {
      setRows((await res.json()) as AdminRedirect[]);
    }
  }, []);

  useEffect(() => { void reload(); }, [reload]);

  async function add() {
    if (!from.trim() || !to.trim()) {
      return;
    }
    const response = await authFetch(`${API_BASE_URL}/admin/dev/redirects`, {
      body: JSON.stringify({ fromPath: from.trim(), toPath: to.trim() }),
      headers: { "Content-Type": "application/json" },
      method: "POST"
    }, "admin");
    await notifyResponse(response, t.saved, t.saveFailed);
    if (response.ok) {
      setFrom("");
      setTo("");
      void reload();
    }
  }

  return (
    <section className={styles.panel}>
      <div className={styles.panelHeader}><div><span className="eyebrow">{t.tabRedirects}</span><h2>{t.redirectsHeading}</h2></div></div>
      <p style={{ color: "var(--muted)", fontSize: "0.9rem" }}>{t.redirectsHint}</p>

      <div style={{ display: "grid", gap: 12, marginTop: 8 }}>
        {rows?.length ? rows.map((row) => <RedirectRow key={row.id} row={row} t={t} reload={reload} />) : null}
        {rows && !rows.length ? <p style={{ color: "var(--muted)", fontSize: "0.86rem" }}>{t.redirectsEmpty}</p> : null}
      </div>

      <div className={styles.inlineForm} style={{ marginTop: 18 }}>
        <label>{t.colFrom}<input onChange={(e) => setFrom(e.target.value)} placeholder="/de/alte-seite" value={from} /></label>
        <label>{t.colTo}<input onChange={(e) => setTo(e.target.value)} placeholder="/de/neue-seite" value={to} /></label>
        <Button icon={Plus} onClick={() => void add()} type="button">{t.addRedirect}</Button>
      </div>
    </section>
  );
}

function RedirectRow({ row, t, reload }: { row: AdminRedirect; t: TB; reload: () => void }) {
  const [fromPath, setFromPath] = useState(row.fromPath);
  const [toPath, setToPath] = useState(row.toPath);
  const [permanent, setPermanent] = useState(row.permanent);
  const [enabled, setEnabled] = useState(row.enabled);
  const [busy, setBusy] = useState(false);

  async function save() {
    setBusy(true);
    const response = await authFetch(`${API_BASE_URL}/admin/dev/redirects/${row.id}`, {
      body: JSON.stringify({ fromPath, toPath, permanent, enabled }),
      headers: { "Content-Type": "application/json" },
      method: "PATCH"
    }, "admin");
    setBusy(false);
    await notifyResponse(response, t.saved, t.saveFailed);
    if (response.ok) {
      void reload();
    }
  }

  async function remove() {
    const response = await authFetch(`${API_BASE_URL}/admin/dev/redirects/${row.id}`, { method: "DELETE" }, "admin");
    await notifyResponse(response, t.deleted, t.deleteFailed);
    if (response.ok) {
      void reload();
    }
  }

  return (
    <div style={{ border: "1px solid var(--border)", borderRadius: 10, padding: 14, display: "grid", gap: 10 }}>
      <div style={{ display: "grid", gap: 10, gridTemplateColumns: "1fr 1fr" }}>
        <label style={lbl}>{t.colFrom}<input onChange={(e) => setFromPath(e.target.value)} value={fromPath} /></label>
        <label style={lbl}>{t.colTo}<input onChange={(e) => setToPath(e.target.value)} value={toPath} /></label>
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 16, flexWrap: "wrap" }}>
        <label style={chk}>
          <input checked={permanent} onChange={(e) => setPermanent(e.target.checked)} style={{ width: "auto" }} type="checkbox" /> {t.colPermanent}
        </label>
        <label style={chk}>
          <input checked={enabled} onChange={(e) => setEnabled(e.target.checked)} style={{ width: "auto" }} type="checkbox" /> {t.colEnabled}
        </label>
        <button className={styles.linkBtn} disabled={busy} onClick={() => void save()} type="button">{t.save}</button>
        <button className={styles.dangerLinkBtn} onClick={() => void remove()} type="button"><Trash2 size={14} /></button>
      </div>
    </div>
  );
}
