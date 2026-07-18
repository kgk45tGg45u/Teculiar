"use client";

import { useEffect, useRef, useState } from "react";
import styles from "./status-pill-select.module.css";
import pillStyles from "./status-pill.module.css";

export type StatusPillOption = {
  value: string;
  label: string;
  tone?: "good" | "warn" | "neutral" | "danger";
};

type StatusPillSelectProps = {
  value: string;
  label: string;
  tone?: "good" | "warn" | "neutral" | "danger";
  options: StatusPillOption[];
  /** Called with the picked option value; reject/throw keeps the old status. */
  onSelect: (value: string) => void | Promise<void>;
  /** Localized aria label for the trigger, e.g. "Change status". */
  menuLabel: string;
  disabled?: boolean;
};

/**
 * Phase 5.3 — a StatusPill that opens a dropdown of allowed target statuses.
 * Presentational only: callers wire the mutation in onSelect (optimistic update +
 * error toast live app-side).
 */
export function StatusPillSelect({ value, label, tone = "neutral", options, onSelect, menuLabel, disabled }: StatusPillSelectProps) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const wrapRef = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    if (!open) return;
    function onDocPointer(event: MouseEvent) {
      if (!wrapRef.current?.contains(event.target as Node)) setOpen(false);
    }
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onDocPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDocPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  async function pick(next: string) {
    setOpen(false);
    if (next === value) return;
    setBusy(true);
    try {
      await onSelect(next);
    } finally {
      setBusy(false);
    }
  }

  return (
    <span className={styles.wrap} ref={wrapRef}>
      <button
        aria-expanded={open}
        aria-haspopup="listbox"
        aria-label={menuLabel}
        className={`${pillStyles.pill} ${pillStyles[tone]} ${styles.trigger}`}
        disabled={disabled || busy}
        onClick={() => setOpen((current) => !current)}
        type="button"
      >
        {label}
        <span aria-hidden className={styles.caret}>▾</span>
      </button>
      {open ? (
        <span className={styles.menu} role="listbox">
          {options.map((option) => (
            <button
              aria-selected={option.value === value}
              className={`${styles.option} ${option.value === value ? styles.current : ""}`}
              key={option.value}
              onClick={() => pick(option.value)}
              role="option"
              type="button"
            >
              {option.label}
            </button>
          ))}
        </span>
      ) : null}
    </span>
  );
}
