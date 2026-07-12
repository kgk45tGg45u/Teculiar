"use client";

import { Plus, Trash2 } from "lucide-react";
import { useState } from "react";
import { API_BASE_URL, authFetch } from "@dezhost/web-core/lib/api";
import { Button } from "@dezhost/web-core/components/ui/button";
import { notifyResponse } from "@dezhost/web-core/components/ui/toast-provider";
import styles from "../admin-dashboard.module.css";
import { TranslateField } from "./translate-field";
import type { AdminPage, LocaleMap, TB } from "./types";
import { useSurfaceHref } from "@dezhost/web-core/lib/use-surface-href";

const lbl: React.CSSProperties = { display: "grid", gap: 4, fontSize: "0.84rem", color: "var(--muted)" };
const badge: React.CSSProperties = { fontSize: "0.72rem", padding: "2px 8px", borderRadius: 999, background: "var(--border)", color: "var(--muted)" };

type Common = { locales: string[]; adminLocale: string; canTranslate: boolean; t: TB; reload: () => void };

export function PagesTab({ pages, ...common }: Common & { pages: AdminPage[] }) {
  const { t, adminLocale, reload } = common;
  const [newName, setNewName] = useState("");
  const [newSlug, setNewSlug] = useState("");

  async function addPage() {
    if (!newName.trim()) {
      return;
    }
    const response = await authFetch(`${API_BASE_URL}/admin/dev/theme/pages`, {
      body: JSON.stringify({ name: { [adminLocale]: newName.trim() }, slug: { [adminLocale]: newSlug.trim() } }),
      headers: { "Content-Type": "application/json" },
      method: "POST"
    }, "admin");
    await notifyResponse(response, t.saved, t.saveFailed);
    if (response.ok) {
      setNewName("");
      setNewSlug("");
      reload();
    }
  }

  return (
    <section className={styles.panel}>
      <div className={styles.panelHeader}><div><span className="eyebrow">{t.tabPages}</span><h2>{t.pagesHeading}</h2></div></div>
      <p style={{ color: "var(--muted)", fontSize: "0.9rem" }}>{t.pagesHint}</p>

      <div style={{ display: "grid", gap: 14, marginTop: 8 }}>
        {pages.map((page) => <PageRow key={page.id} page={page} {...common} />)}
      </div>

      <div className={styles.inlineForm} style={{ marginTop: 18 }}>
        <label>{t.pageName}<input onChange={(e) => setNewName(e.target.value)} placeholder={t.pageName} value={newName} /></label>
        <label>{t.slug}<input onChange={(e) => setNewSlug(e.target.value)} placeholder="slug" value={newSlug} /></label>
        <Button icon={Plus} onClick={() => void addPage()} type="button">{t.addPage}</Button>
      </div>
    </section>
  );
}

function PageRow({ page, locales, adminLocale, canTranslate, t, reload }: Common & { page: AdminPage }) {
  const href = useSurfaceHref();
  const [name, setName] = useState<LocaleMap>(page.name);
  const [slug, setSlug] = useState<LocaleMap>(page.slug);
  const [seoTitle, setSeoTitle] = useState<LocaleMap>(page.seoTitle);
  const [seoDescription, setSeoDescription] = useState<LocaleMap>(page.seoDescription);
  const [published, setPublished] = useState(page.published);
  const [busy, setBusy] = useState(false);
  const tf = { locales, adminLocale, canTranslate, translationsLabel: t.translations, doneLabel: t.done };

  async function save() {
    setBusy(true);
    const response = await authFetch(`${API_BASE_URL}/admin/dev/theme/pages/${page.id}`, {
      body: JSON.stringify({ name, slug, seoTitle, seoDescription, published }),
      headers: { "Content-Type": "application/json" },
      method: "PATCH"
    }, "admin");
    setBusy(false);
    await notifyResponse(response, t.saved, t.saveFailed);
    if (response.ok) {
      reload();
    }
  }

  async function remove() {
    const response = await authFetch(`${API_BASE_URL}/admin/dev/theme/pages/${page.id}`, { method: "DELETE" }, "admin");
    await notifyResponse(response, t.deleted, t.deleteFailed);
    if (response.ok) {
      reload();
    }
  }

  return (
    <div style={{ border: "1px solid var(--border)", borderRadius: 10, padding: 14, display: "grid", gap: 10 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <strong>{page.key}</strong>
        {page.isSystem ? <span style={badge}>{t.builtIn}</span> : null}
      </div>
      <label style={lbl}>{t.colName}<TranslateField modalTitle={t.colName} onChange={setName} value={name} {...tf} /></label>
      <label style={lbl}>{t.colSlug}<TranslateField modalTitle={t.colSlug} onChange={setSlug} placeholder={t.slugHint} value={slug} {...tf} /></label>
      <details>
        <summary style={{ cursor: "pointer", color: "var(--muted)", fontSize: "0.84rem" }}>{t.seo}</summary>
        <div style={{ display: "grid", gap: 8, marginTop: 8 }}>
          <label style={lbl}>{t.seoTitle}<TranslateField modalTitle={t.seoTitle} onChange={setSeoTitle} value={seoTitle} {...tf} /></label>
          <label style={lbl}>{t.seoDescription}<TranslateField modalTitle={t.seoDescription} multiline onChange={setSeoDescription} value={seoDescription} {...tf} /></label>
        </div>
      </details>
      <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
        <label style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
          <input checked={published} onChange={(e) => setPublished(e.target.checked)} style={{ width: "auto" }} type="checkbox" /> {t.colPublished}
        </label>
        <button className={styles.linkBtn} disabled={busy} onClick={() => void save()} type="button">{t.save}</button>
        <a className={styles.linkBtn} href={href(`/admin/theme/customizer/${page.key}`)} rel="noopener noreferrer" target="_blank">{t.customize}</a>
        {page.isSystem ? null : <button className={styles.dangerLinkBtn} onClick={() => void remove()} type="button"><Trash2 size={14} /></button>}
      </div>
    </div>
  );
}
