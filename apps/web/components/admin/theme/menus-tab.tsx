"use client";

import { Plus, Trash2 } from "lucide-react";
import { useState } from "react";
import { API_BASE_URL, authFetch } from "../../../lib/api";
import { Button } from "../../ui/button";
import { notifyResponse } from "../../ui/toast-provider";
import styles from "../admin-dashboard.module.css";
import { TranslateField } from "./translate-field";
import type { AdminMenuItem, AdminPage, LocaleMap, TB } from "./types";

const lbl: React.CSSProperties = { display: "grid", gap: 4, fontSize: "0.84rem", color: "var(--muted)" };

type Common = { locales: string[]; adminLocale: string; canTranslate: boolean; t: TB; reload: () => void };
type Props = Common & { menuItems: AdminMenuItem[]; pages: AdminPage[] };

function pick(map: LocaleMap, adminLocale: string, fallback: string): string {
  return map[adminLocale] || Object.values(map).find(Boolean) || fallback;
}

export function MenusTab({ menuItems, pages, ...common }: Props) {
  const { t, adminLocale, reload } = common;
  const [newLabel, setNewLabel] = useState("");
  const [newMenu, setNewMenu] = useState<"MAIN" | "LEGAL">("MAIN");

  async function addItem() {
    if (!newLabel.trim()) {
      return;
    }
    const response = await authFetch(`${API_BASE_URL}/admin/dev/theme/menu-items`, {
      body: JSON.stringify({ menu: newMenu, label: { [adminLocale]: newLabel.trim() } }),
      headers: { "Content-Type": "application/json" },
      method: "POST"
    }, "admin");
    await notifyResponse(response, t.saved, t.saveFailed);
    if (response.ok) {
      setNewLabel("");
      reload();
    }
  }

  return (
    <section className={styles.panel}>
      <div className={styles.panelHeader}><div><span className="eyebrow">{t.tabMenus}</span><h2>{t.menusHeading}</h2></div></div>
      <p style={{ color: "var(--muted)", fontSize: "0.9rem" }}>{t.menusHint}</p>

      <div style={{ display: "grid", gap: 12, marginTop: 8 }}>
        {menuItems.map((item) => <MenuRow key={item.id} item={item} menuItems={menuItems} pages={pages} {...common} />)}
      </div>

      <div className={styles.inlineForm} style={{ marginTop: 18 }}>
        <label>{t.colMenuItem}<input onChange={(e) => setNewLabel(e.target.value)} placeholder={t.newItemLabel} value={newLabel} /></label>
        <label>{t.colMenu}
          <select onChange={(e) => setNewMenu(e.target.value as "MAIN" | "LEGAL")} value={newMenu}>
            <option value="MAIN">{t.menuMain}</option>
            <option value="LEGAL">{t.menuLegal}</option>
          </select>
        </label>
        <Button icon={Plus} onClick={() => void addItem()} type="button">{t.addMenuItem}</Button>
      </div>
    </section>
  );
}

function MenuRow({ item, menuItems, pages, locales, adminLocale, canTranslate, t, reload }: Common & { item: AdminMenuItem; menuItems: AdminMenuItem[]; pages: AdminPage[] }) {
  const [label, setLabel] = useState<LocaleMap>(item.label);
  const [menu, setMenu] = useState<"MAIN" | "LEGAL">(item.menu);
  const [parentId, setParentId] = useState<string>(item.parentId ?? "");
  const [pageId, setPageId] = useState<string>(item.pageId ?? "");
  const [newTab, setNewTab] = useState(item.newTab);
  const [order, setOrder] = useState(item.order);
  const [busy, setBusy] = useState(false);
  const tf = { locales, adminLocale, canTranslate, translationsLabel: t.translations, doneLabel: t.done };

  // Eligible parents: top-level items in the same menu, excluding self.
  const parentOptions = menuItems.filter((other) => other.menu === menu && !other.parentId && other.id !== item.id);

  async function save() {
    setBusy(true);
    const response = await authFetch(`${API_BASE_URL}/admin/dev/theme/menu-items/${item.id}`, {
      body: JSON.stringify({ label, menu, parentId: parentId || null, pageId: pageId || null, newTab, order }),
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
    const response = await authFetch(`${API_BASE_URL}/admin/dev/theme/menu-items/${item.id}`, { method: "DELETE" }, "admin");
    await notifyResponse(response, t.deleted, t.deleteFailed);
    if (response.ok) {
      reload();
    }
  }

  return (
    <div style={{ border: "1px solid var(--border)", borderRadius: 10, padding: 12, display: "grid", gap: 10, gridTemplateColumns: "minmax(220px, 2fr) repeat(4, minmax(120px, 1fr)) auto", alignItems: "end" }}>
      <label style={lbl}>{t.colMenuItem}<TranslateField modalTitle={t.colMenuItem} onChange={setLabel} value={label} {...tf} /></label>
      <label style={lbl}>{t.colMenu}
        <select onChange={(e) => { setMenu(e.target.value as "MAIN" | "LEGAL"); setParentId(""); }} value={menu}>
          <option value="MAIN">{t.menuMain}</option>
          <option value="LEGAL">{t.menuLegal}</option>
        </select>
      </label>
      <label style={lbl}>{t.colParent}
        <select onChange={(e) => setParentId(e.target.value)} value={parentId}>
          <option value="">{t.none}</option>
          {parentOptions.map((opt) => <option key={opt.id} value={opt.id}>{pick(opt.label, adminLocale, opt.id)}</option>)}
        </select>
      </label>
      <label style={lbl}>{t.colPage}
        <select onChange={(e) => setPageId(e.target.value)} value={pageId}>
          <option value="">{t.none}</option>
          {pages.map((page) => <option key={page.id} value={page.id}>{pick(page.name, adminLocale, page.key)}</option>)}
        </select>
      </label>
      <label style={lbl}>{t.colNewTab}
        <span style={{ display: "inline-flex", alignItems: "center", gap: 8, height: 34 }}>
          <input checked={newTab} onChange={(e) => setNewTab(e.target.checked)} style={{ width: "auto" }} type="checkbox" />
          <input aria-label="order" max={99} min={0} onChange={(e) => setOrder(Number(e.target.value))} style={{ width: 56 }} type="number" value={order} />
        </span>
      </label>
      <span style={{ display: "inline-flex", gap: 8, alignItems: "center" }}>
        <button className={styles.linkBtn} disabled={busy} onClick={() => void save()} type="button">{t.save}</button>
        <button className={styles.dangerLinkBtn} onClick={() => void remove()} type="button"><Trash2 size={14} /></button>
      </span>
    </div>
  );
}
