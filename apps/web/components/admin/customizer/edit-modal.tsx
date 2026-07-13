"use client";

import { Wand2 } from "lucide-react";
import { useState } from "react";
import type { ElementDef } from "@teculiar/web-core/lib/customizer/registry";
import type { PropField, TextSlot } from "@teculiar/web-core/lib/customizer/registry/types";
import type { JsonValue, LocaleMap, Node } from "@teculiar/web-core/lib/customizer/types";
import { localized } from "@teculiar/web-core/lib/storefront-theme";
import { localeName } from "../theme/types";
import { Modal } from "@teculiar/web-core/components/ui/modal";
import { notify } from "@teculiar/web-core/components/ui/toast-provider";
import { translateTexts } from "./api";
import styles from "./customizer.module.css";
import type { CustomizerT } from "./types";

type TextMap = Record<string, LocaleMap>;
type PropMap = Record<string, JsonValue>;

// Pencil → edit modal. Fields are generated from the element's ElementDef: one translatable group per
// textSlot (every configured language inline + per-slot DeepSeek auto-translate when ≥2 languages),
// and a typed input per propSchema entry. Every change applies immediately to the in-memory doc, so
// closing via Escape / backdrop never loses edits (the doc is the single source of truth).
export function EditModal({
  node,
  def,
  locales,
  adminLocale,
  mainLocale,
  canTranslate,
  t,
  onClose,
  onChange
}: {
  node: Node;
  def: ElementDef;
  locales: string[];
  adminLocale: string;
  mainLocale: string;
  canTranslate: boolean;
  t: CustomizerT;
  onClose: () => void;
  onChange: (next: Node) => void;
}) {
  const [text, setText] = useState<TextMap>(() => JSON.parse(JSON.stringify(node.text ?? {})) as TextMap);
  const [props, setProps] = useState<PropMap>(() => ({ ...(node.props ?? {}) }));
  const [busySlot, setBusySlot] = useState<string | null>(null);

  const applyText = (next: TextMap) => {
    setText(next);
    onChange({ ...node, text: pruneText(next), props });
  };
  const applyProps = (next: PropMap) => {
    setProps(next);
    onChange({ ...node, text: pruneText(text), props: next });
  };

  async function autoTranslate(slot: string) {
    const current = text[slot] ?? {};
    const sourceLocale = current[mainLocale]?.trim() ? mainLocale : adminLocale;
    const source = (current[sourceLocale] ?? "").trim();
    if (!source) {
      notify.info(t.translateEmpty);
      return;
    }
    setBusySlot(slot);
    const next: LocaleMap = { ...current };
    let failed = false;
    for (const target of locales) {
      if (target === sourceLocale) {
        continue;
      }
      const items = await translateTexts([source], target, sourceLocale);
      if (items && typeof items[0] === "string") {
        next[target] = items[0];
      } else {
        failed = true;
      }
    }
    setBusySlot(null);
    applyText({ ...text, [slot]: next });
    if (failed) {
      notify.error(t.translateFailed);
    } else {
      notify.success(t.translated);
    }
  }

  return (
    <Modal closeLabel={t.done} onClose={onClose} open title={localized(def.label, adminLocale, mainLocale)}>
      <div style={{ display: "grid", gap: 16, minWidth: 360 }}>
        {def.textSlots.map((slot) => (
          <SlotField
            adminLocale={adminLocale}
            busy={busySlot === slot.key}
            canTranslate={canTranslate}
            key={slot.key}
            locales={locales}
            onAutoTranslate={() => void autoTranslate(slot.key)}
            onChange={(value) => applyText({ ...text, [slot.key]: value })}
            slot={slot}
            t={t}
            value={text[slot.key] ?? {}}
          />
        ))}
        {def.propSchema.map((field) => (
          <PropFieldInput
            field={field}
            key={field.key}
            onChange={(value) => applyProps({ ...props, [field.key]: value })}
            t={t}
            value={props[field.key]}
          />
        ))}
        <div style={{ display: "flex", justifyContent: "flex-end" }}>
          <button
            onClick={onClose}
            style={{ padding: "8px 16px", borderRadius: 8, border: "1px solid var(--border)", background: "var(--surface, #fff)", cursor: "pointer" }}
            type="button"
          >
            {t.done}
          </button>
        </div>
      </div>
    </Modal>
  );
}

function SlotField({
  slot,
  value,
  onChange,
  locales,
  adminLocale,
  canTranslate,
  busy,
  onAutoTranslate,
  t
}: {
  slot: TextSlot;
  value: LocaleMap;
  onChange: (next: LocaleMap) => void;
  locales: string[];
  adminLocale: string;
  canTranslate: boolean;
  busy: boolean;
  onAutoTranslate: () => void;
  t: CustomizerT;
}) {
  const set = (locale: string, next: string) => onChange({ ...value, [locale]: next });
  // Single-language stores: just the one field. Multi-language: every locale inline + auto-translate.
  const shown = canTranslate ? locales : [adminLocale];
  return (
    <div className={styles.field}>
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <strong style={{ color: "var(--text, inherit)" }}>{labelForSlot(slot.key, t)}</strong>
        {canTranslate ? (
          <button aria-label={t.autoTranslate} className={styles.iconBtn} disabled={busy} onClick={onAutoTranslate} style={{ width: 30, height: 30 }} title={t.autoTranslate} type="button">
            <Wand2 size={14} />
          </button>
        ) : null}
        {busy ? <span style={{ fontSize: "0.78rem" }}>{t.translating}</span> : null}
      </div>
      {shown.map((locale) => (
        <label key={locale} style={{ display: "grid", gap: 2 }}>
          {canTranslate ? <span style={{ fontSize: "0.76rem" }}>{localeName(locale)}{locale === adminLocale ? " ·" : ""}</span> : null}
          {slot.multiline ? (
            <textarea onChange={(event) => set(locale, event.target.value)} rows={3} style={{ width: "100%" }} value={value[locale] ?? ""} />
          ) : (
            <input onChange={(event) => set(locale, event.target.value)} style={{ width: "100%" }} value={value[locale] ?? ""} />
          )}
        </label>
      ))}
    </div>
  );
}

function PropFieldInput({ field, value, onChange, t }: { field: PropField; value: JsonValue | undefined; onChange: (next: JsonValue) => void; t: CustomizerT }) {
  return (
    <div className={styles.field}>
      <strong style={{ color: "var(--text, inherit)" }}>{labelForProp(field.key, t)}</strong>
      {field.type === "select" ? (
        <select onChange={(event) => onChange(event.target.value)} value={typeof value === "string" ? value : field.options[0]}>
          {field.options.map((option) => (
            <option key={option} value={option}>{option}</option>
          ))}
        </select>
      ) : field.type === "number" ? (
        <input onChange={(event) => onChange(event.target.value === "" ? 0 : Number(event.target.value))} type="number" value={typeof value === "number" ? value : 0} />
      ) : field.type === "responsiveNumber" ? (
        <ResponsiveInput onChange={onChange} t={t} value={value} />
      ) : (
        <input onChange={(event) => onChange(event.target.value)} value={typeof value === "string" ? value : ""} />
      )}
    </div>
  );
}

// Per-viewport number control: desktop (base, required) + tablet/mobile (inherit when blank).
function ResponsiveInput({ value, onChange, t }: { value: JsonValue | undefined; onChange: (next: JsonValue) => void; t: CustomizerT }) {
  const map = value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, JsonValue>) : {};
  const current = {
    base: typeof map.base === "number" ? map.base : typeof value === "number" ? value : 1,
    md: typeof map.md === "number" ? map.md : null,
    sm: typeof map.sm === "number" ? map.sm : null
  };
  const set = (key: "base" | "md" | "sm", raw: string) => {
    const parsed = raw === "" ? (key === "base" ? 1 : null) : Math.max(1, Math.round(Number(raw)));
    onChange({ ...current, [key]: parsed } as JsonValue);
  };
  const cells: Array<["base" | "md" | "sm", string]> = [
    ["base", t.viewports.desktop],
    ["md", t.viewports.tablet],
    ["sm", t.viewports.mobile]
  ];
  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 8 }}>
      {cells.map(([key, label]) => (
        <label key={key} style={{ display: "grid", gap: 2 }}>
          <span style={{ fontSize: "0.74rem" }}>{label}</span>
          <input
            min={1}
            onChange={(event) => set(key, event.target.value)}
            placeholder={key === "base" ? "" : "↑"}
            type="number"
            value={current[key] ?? ""}
          />
        </label>
      ))}
    </div>
  );
}

// Friendly label for the common text slots; unknown slot keys fall back to the raw key.
function labelForSlot(key: string, t: CustomizerT): string {
  const labels = t.slots as Record<string, string>;
  return labels[key] ?? key;
}

// Friendly label for the common structural props; unknown keys fall back to the raw key.
function labelForProp(key: string, t: CustomizerT): string {
  const labels = t.props as Record<string, string>;
  return labels[key] ?? key;
}

/** Drop slots whose every locale value is blank so the doc stays clean. */
function pruneText(text: TextMap): TextMap {
  const next: TextMap = {};
  for (const [slot, map] of Object.entries(text)) {
    if (Object.values(map).some((value) => value.trim())) {
      next[slot] = map;
    }
  }
  return next;
}
