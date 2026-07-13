"use client";

import { useState } from "react";
import { API_BASE_URL, authFetch } from "@teculiar/web-core/lib/api";
import { Button } from "@teculiar/web-core/components/ui/button";
import { notifyResponse } from "@teculiar/web-core/components/ui/toast-provider";
import styles from "../admin-dashboard.module.css";
import { TranslateField } from "./translate-field";
import type { LocaleMap, TB } from "./types";

const lbl: React.CSSProperties = { display: "grid", gap: 4, fontSize: "0.84rem", color: "var(--muted)" };

type Props = { footer: Record<string, unknown> | null; locales: string[]; adminLocale: string; canTranslate: boolean; t: TB; reload: () => void };

// Localized footer text fields, in display order. multiline for the longer blurbs.
const TEXT_FIELDS: Array<{ key: string; labelKey: keyof TB; multiline?: boolean }> = [
  { key: "mission", labelKey: "fMission", multiline: true },
  { key: "tagline", labelKey: "fTagline" },
  { key: "servicesHeading", labelKey: "fServicesHeading" },
  { key: "legalHeading", labelKey: "fLegalHeading" },
  { key: "ctaHeading", labelKey: "fCtaHeading" },
  { key: "ctaText", labelKey: "fCtaText", multiline: true },
  { key: "ctaButton", labelKey: "fCtaButton" },
  { key: "rightsReserved", labelKey: "fRightsReserved" }
];

const asMap = (value: unknown): LocaleMap => (value && typeof value === "object" ? (value as LocaleMap) : {});
const asStr = (value: unknown): string => (typeof value === "string" ? value : "");

export function FooterTab({ footer, locales, adminLocale, canTranslate, t, reload }: Props) {
  const initial = footer ?? {};
  const [maps, setMaps] = useState<Record<string, LocaleMap>>(() =>
    Object.fromEntries(TEXT_FIELDS.map((field) => [field.key, asMap(initial[field.key])]))
  );
  const [contactEmail, setContactEmail] = useState(asStr(initial.contactEmail));
  const [ctaHref, setCtaHref] = useState(asStr(initial.ctaHref));
  const [busy, setBusy] = useState(false);
  const tf = { locales, adminLocale, canTranslate, translationsLabel: t.translations, doneLabel: t.done };

  async function save() {
    setBusy(true);
    const response = await authFetch(`${API_BASE_URL}/admin/dev/theme/footer`, {
      body: JSON.stringify({ footer: { ...maps, contactEmail, ctaHref } }),
      headers: { "Content-Type": "application/json" },
      method: "PATCH"
    }, "admin");
    setBusy(false);
    await notifyResponse(response, t.saved, t.saveFailed);
    if (response.ok) {
      reload();
    }
  }

  return (
    <section className={styles.panel}>
      <div className={styles.panelHeader}><div><span className="eyebrow">{t.tabFooter}</span><h2>{t.footerHeading}</h2></div></div>
      <p style={{ color: "var(--muted)", fontSize: "0.9rem" }}>{t.footerHint}</p>

      <div style={{ display: "grid", gap: 12, marginTop: 8 }}>
        {TEXT_FIELDS.map((field) => (
          <label key={field.key} style={lbl}>{t[field.labelKey]}
            <TranslateField
              modalTitle={t[field.labelKey]}
              multiline={field.multiline}
              onChange={(next) => setMaps((current) => ({ ...current, [field.key]: next }))}
              value={maps[field.key] ?? {}}
              {...tf}
            />
          </label>
        ))}
        <label style={lbl}>{t.fContactEmail}<input onChange={(e) => setContactEmail(e.target.value)} type="email" value={contactEmail} /></label>
        <label style={lbl}>{t.fCtaHref}<input onChange={(e) => setCtaHref(e.target.value)} value={ctaHref} /></label>
      </div>

      <div style={{ marginTop: 16 }}>
        <Button disabled={busy} onClick={() => void save()} type="button">{t.save}</Button>
      </div>
    </section>
  );
}
