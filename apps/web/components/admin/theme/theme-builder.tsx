"use client";

import { Check } from "lucide-react";
import { useCallback, useEffect, useState, type ComponentProps } from "react";
import { API_BASE_URL, authFetch } from "@teculiar/web-core/lib/api";
import { getDictionary } from "@teculiar/web-core/lib/dictionary";
import { useLocale } from "@teculiar/web-core/components/layout/locale-provider";
import { notifyResponse } from "@teculiar/web-core/components/ui/toast-provider";
import styles from "../admin-dashboard.module.css";
import { ThemeBlueForm } from "../theme-blue-form";
import { FooterTab } from "./footer-tab";
import { MenusTab } from "./menus-tab";
import { PagesTab } from "./pages-tab";
import { RedirectsTab } from "./redirects-tab";
import type { AdminThemeData, TB } from "./types";

type TabKey = "theme" | "menus" | "pages" | "footer" | "redirects";
type HeroImages = ComponentProps<typeof ThemeBlueForm>["initialImages"];

export function ThemeBuilder({ initialImages }: { initialImages: HeroImages }) {
  const locale = useLocale();
  const t = getDictionary(locale).admin.themeBuilder;
  const [data, setData] = useState<AdminThemeData | null>(null);
  const [tab, setTab] = useState<TabKey>("theme");

  const reload = useCallback(async () => {
    const res = await authFetch(`${API_BASE_URL}/admin/dev/theme`, {}, "admin");
    if (res.ok) {
      setData((await res.json()) as AdminThemeData);
    }
  }, []);

  useEffect(() => { void reload(); }, [reload]);

  if (!data) {
    return <p style={{ color: "var(--muted)" }}>{t.loading}</p>;
  }

  const adminLocale = data.locales.includes(locale) ? locale : (data.locales[0] ?? "de");
  const common = { locales: data.locales, adminLocale, canTranslate: data.canTranslate, t, reload };
  const tabs: Array<{ key: TabKey; label: string }> = [
    { key: "theme", label: t.tabTheme },
    { key: "menus", label: t.tabMenus },
    { key: "pages", label: t.tabPages },
    { key: "footer", label: t.tabFooter },
    { key: "redirects", label: t.tabRedirects }
  ];

  return (
    <div style={{ display: "grid", gap: 18 }}>
      <div style={{ display: "flex", gap: 6, borderBottom: "1px solid var(--border)" }}>
        {tabs.map((entry) => (
          <button
            key={entry.key}
            onClick={() => setTab(entry.key)}
            style={{
              padding: "10px 16px",
              border: "none",
              borderBottom: `2px solid ${tab === entry.key ? "var(--accent)" : "transparent"}`,
              background: "none",
              cursor: "pointer",
              fontWeight: tab === entry.key ? 600 : 400,
              color: tab === entry.key ? "var(--text, inherit)" : "var(--muted)"
            }}
            type="button"
          >
            {entry.label}
          </button>
        ))}
      </div>

      {tab === "theme" ? <ThemeTab data={data} initialImages={initialImages} t={t} reload={reload} /> : null}
      {tab === "menus" ? <MenusTab menuItems={data.menuItems} pages={data.pages} {...common} /> : null}
      {tab === "pages" ? <PagesTab pages={data.pages} {...common} /> : null}
      {tab === "footer" ? <FooterTab footer={data.theme.footer} {...common} /> : null}
      {tab === "redirects" ? <RedirectsTab t={t} /> : null}
    </div>
  );
}

function ThemeTab({ data, initialImages, t, reload }: { data: AdminThemeData; initialImages: HeroImages; t: TB; reload: () => void }) {
  async function apply(key: string) {
    const response = await authFetch(`${API_BASE_URL}/admin/dev/theme/${key}/activate`, { method: "POST" }, "admin");
    await notifyResponse(response, t.applied, t.saveFailed);
    if (response.ok) {
      reload();
    }
  }

  return (
    <>
      <section className={styles.panel}>
        <div className={styles.panelHeader}><div><span className="eyebrow">{t.tabTheme}</span><h2>{t.themeHeading}</h2></div></div>
        <p style={{ color: "var(--muted)", fontSize: "0.9rem" }}>{t.themeHint}</p>
        <div style={{ display: "flex", gap: 14, flexWrap: "wrap", marginTop: 8 }}>
          {data.themes.map((theme) => (
            <div key={theme.id} style={{ width: 220, border: `2px solid ${theme.active ? "var(--accent)" : "var(--border)"}`, borderRadius: 12, overflow: "hidden" }}>
              <div style={{ height: 110, background: "var(--border)", display: "grid", placeItems: "center" }}>
                {theme.thumbnail ? <img alt={theme.name} src={theme.thumbnail} style={{ width: "100%", height: "100%", objectFit: "cover" }} /> : <span style={{ color: "var(--muted)" }}>{theme.name}</span>}
              </div>
              <div style={{ padding: "10px 12px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <strong>{theme.name}</strong>
                {theme.active
                  ? <span style={{ display: "inline-flex", alignItems: "center", gap: 4, color: "var(--accent)", fontSize: "0.82rem" }}><Check size={14} /> {t.active}</span>
                  : <button className={styles.linkBtn} onClick={() => void apply(theme.key)} type="button">{t.apply}</button>}
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className={styles.panel}>
        <div className={styles.panelHeader}><div><span className="eyebrow">{t.tabTheme}</span><h2>{t.heroImagesHeading}</h2></div></div>
        <ThemeBlueForm initialImages={initialImages} />
      </section>
    </>
  );
}
