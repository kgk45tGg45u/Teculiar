"use client";

import { X } from "lucide-react";
import { useEffect, type ReactNode } from "react";
import { createPortal } from "react-dom";
import styles from "./modal.module.css";

/**
 * Reusable controlled modal: a centered panel over a click-to-dismiss backdrop, rendered through a
 * portal on document.body so header/stacking contexts never clip it. Closes on Escape and backdrop
 * click; locks body scroll while open. Pass `title` for the titled header with a close button.
 */
export function Modal({
  open,
  onClose,
  title,
  closeLabel = "Close",
  children,
  className
}: {
  open: boolean;
  onClose: () => void;
  title?: string;
  closeLabel?: string;
  children: ReactNode;
  className?: string;
}) {
  useEffect(() => {
    if (!open) {
      return;
    }
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onClose();
      }
    };
    document.addEventListener("keydown", onKey);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = previousOverflow;
    };
  }, [open, onClose]);

  if (!open || typeof document === "undefined") {
    return null;
  }

  return createPortal(
    <div className={styles.backdrop} onClick={onClose}>
      <div
        aria-label={title}
        aria-modal="true"
        className={`${styles.panel}${className ? ` ${className}` : ""}`}
        onClick={(event) => event.stopPropagation()}
        role="dialog"
      >
        {title ? (
          <div className={styles.header}>
            <h2 className={styles.title}>{title}</h2>
            <button aria-label={closeLabel} className={styles.close} onClick={onClose} type="button">
              <X aria-hidden size={18} />
            </button>
          </div>
        ) : null}
        <div className={styles.body}>{children}</div>
      </div>
    </div>,
    document.body
  );
}
