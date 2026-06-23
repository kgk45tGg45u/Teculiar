"use client";

import { Languages } from "lucide-react";
import { useState } from "react";
import { Modal } from "../../ui/modal";
import { localeName, type LocaleMap } from "./types";

// A single text field that edits the value in the admin's own language inline. When the store has
// ≥2 languages a small one-glyph language button appears next to it; clicking opens a modal with one
// field per configured language. Hidden entirely for single-language stores (canTranslate=false).
export function TranslateField({
  value,
  onChange,
  locales,
  adminLocale,
  canTranslate,
  multiline = false,
  placeholder,
  modalTitle,
  translationsLabel,
  doneLabel
}: {
  value: LocaleMap;
  onChange: (next: LocaleMap) => void;
  locales: string[];
  adminLocale: string;
  canTranslate: boolean;
  multiline?: boolean;
  placeholder?: string;
  modalTitle: string;
  translationsLabel: string;
  doneLabel: string;
}) {
  const [open, setOpen] = useState(false);
  const set = (locale: string, next: string) => onChange({ ...value, [locale]: next });

  return (
    <div style={{ display: "flex", gap: 6, alignItems: "flex-start" }}>
      <div style={{ flex: 1 }}>
        <LocaleInput value={value[adminLocale] ?? ""} onChange={(v) => set(adminLocale, v)} multiline={multiline} placeholder={placeholder} />
      </div>
      {canTranslate ? (
        <>
          <button
            aria-label={translationsLabel}
            title={translationsLabel}
            onClick={() => setOpen(true)}
            style={{ flex: "0 0 auto", display: "inline-flex", alignItems: "center", justifyContent: "center", width: 34, height: 34, border: "1px solid var(--border)", borderRadius: 8, background: "var(--surface, #fff)", cursor: "pointer" }}
            type="button"
          >
            <Languages aria-hidden size={16} />
          </button>
          <Modal onClose={() => setOpen(false)} open={open} title={modalTitle}>
            <div style={{ display: "grid", gap: 12, minWidth: 320 }}>
              {locales.map((locale) => (
                <label key={locale} style={{ display: "grid", gap: 4 }}>
                  <span style={{ fontSize: "0.82rem", color: "var(--muted)" }}>
                    {localeName(locale)}{locale === adminLocale ? " ·" : ""}
                  </span>
                  <LocaleInput value={value[locale] ?? ""} onChange={(v) => set(locale, v)} multiline={multiline} placeholder={placeholder} />
                </label>
              ))}
              <div style={{ display: "flex", justifyContent: "flex-end" }}>
                <button onClick={() => setOpen(false)} style={{ padding: "8px 16px", borderRadius: 8, border: "1px solid var(--border)", background: "var(--surface, #fff)", cursor: "pointer" }} type="button">
                  {doneLabel}
                </button>
              </div>
            </div>
          </Modal>
        </>
      ) : null}
    </div>
  );
}

function LocaleInput({ value, onChange, multiline, placeholder }: { value: string; onChange: (v: string) => void; multiline?: boolean; placeholder?: string }) {
  if (multiline) {
    return <textarea onChange={(e) => onChange(e.target.value)} placeholder={placeholder} rows={3} style={{ width: "100%" }} value={value} />;
  }
  return <input onChange={(e) => onChange(e.target.value)} placeholder={placeholder} style={{ width: "100%" }} value={value} />;
}
