"use client";

import { useEffect, useState } from "react";
import { Modal } from "@dezhost/web-core/components/ui/modal";
import { notifyResponse } from "@dezhost/web-core/components/ui/toast-provider";
import { listVersions, revertTo, type PageVersionRow } from "./api";
import styles from "./customizer.module.css";
import type { CustomizerT } from "./types";

// Publish history + rollback. Reverting re-publishes a past snapshot as a NEW version (append-only),
// then the builder reloads the doc so the canvas reflects the rolled-back layout.
export function VersionsModal({
  pageId,
  open,
  onClose,
  onReverted,
  t
}: {
  pageId: string;
  open: boolean;
  onClose: () => void;
  onReverted: () => void;
  t: CustomizerT;
}) {
  const [rows, setRows] = useState<PageVersionRow[] | null>(null);

  useEffect(() => {
    if (!open) {
      return;
    }
    setRows(null);
    void listVersions(pageId).then(setRows);
  }, [open, pageId]);

  async function revert(version: number) {
    const response = await revertTo(pageId, version);
    await notifyResponse(response, t.reverted, t.revertFailed);
    if (response.ok) {
      onReverted();
      onClose();
    }
  }

  return (
    <Modal closeLabel={t.done} onClose={onClose} open={open} title={t.versions}>
      <div style={{ minWidth: 380 }}>
        {rows === null ? (
          <p style={{ color: "var(--muted)" }}>{t.loading}</p>
        ) : rows.length === 0 ? (
          <p style={{ color: "var(--muted)" }}>{t.noVersions}</p>
        ) : (
          rows.map((row) => (
            <div className={styles.versionRow} key={row.version}>
              <strong>v{row.version}</strong>
              <span style={{ flex: 1, color: "var(--muted)", fontSize: "0.82rem" }}>
                {row.label ? `${row.label} · ` : ""}
                {new Date(row.publishedAt).toLocaleString()}
              </span>
              <button
                onClick={() => void revert(row.version)}
                style={{ padding: "6px 12px", borderRadius: 8, border: "1px solid var(--border)", background: "var(--surface, #fff)", cursor: "pointer" }}
                type="button"
              >
                {t.revert}
              </button>
            </div>
          ))
        )}
      </div>
    </Modal>
  );
}
