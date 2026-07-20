"use client";

import { Languages, Wand2 } from "lucide-react";
import { useState } from "react";
import { API_BASE_URL, authHeaders } from "@teculiar/web-core/lib/api";
import { notify } from "@teculiar/web-core/components/ui/toast-provider";
import { Modal } from "@teculiar/web-core/components/ui/modal";
import { localeName, type LocaleMap } from "./types";

// A single text field that edits the value in the admin's own language inline. When the store has
// ≥2 languages a small one-glyph language button appears next to it; clicking opens a modal with one
// field per configured language. Hidden entirely for single-language stores (canTranslate=false).
//
// When `autoTranslate` is set the modal also shows a DeepSeek "auto-translate" button that fills the
// empty other-language fields from the admin-locale text (reuses POST customizer/translate). Existing
// values are never overwritten, so manual edits are safe.
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
  doneLabel,
  autoTranslate
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
  autoTranslate?: { label: string; runningLabel: string; failedLabel: string };
}) {
  const [open, setOpen] = useState(false);
  const [translating, setTranslating] = useState(false);
  const set = (locale: string, next: string) => onChange({ ...value, [locale]: next });

  async function runAutoTranslate() {
    const source = (value[adminLocale] ?? "").trim();
    if (!source || !autoTranslate) {
      return;
    }
    setTranslating(true);
    try {
      const next: LocaleMap = { ...value };
      for (const locale of locales) {
        if (locale === adminLocale || (next[locale] ?? "").trim()) {
          continue; // skip the source field and any locale already filled
        }
        const response = await fetch(`${API_BASE_URL}/admin/dev/customizer/translate`, {
          body: JSON.stringify({ texts: [source], target: locale, source: adminLocale }),
          headers: { "Content-Type": "application/json", ...authHeaders() },
          method: "POST"
        });
        if (!response.ok) {
          throw new Error("translate failed");
        }
        const payload = (await response.json()) as { items?: string[] };
        if (payload.items?.[0]?.trim()) {
          next[locale] = payload.items[0];
        }
      }
      onChange(next);
    } catch {
      notify.error(autoTranslate.failedLabel);
    } finally {
      setTranslating(false);
    }
  }

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
              <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
                {autoTranslate ? (
                  <button
                    disabled={translating}
                    onClick={runAutoTranslate}
                    style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "8px 14px", borderRadius: 8, border: "1px solid var(--border)", background: "var(--surface, #fff)", cursor: translating ? "wait" : "pointer" }}
                    type="button"
                  >
                    <Wand2 aria-hidden size={15} />
                    {translating ? autoTranslate.runningLabel : autoTranslate.label}
                  </button>
                ) : <span />}
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
