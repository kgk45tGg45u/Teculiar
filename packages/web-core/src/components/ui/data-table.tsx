"use client";

import type { ReactNode } from "react";
import styles from "./data-table.module.css";

export type DataTableColumn<T> = {
  key: string;
  header: ReactNode;
  render: (row: T) => ReactNode;
  /**
   * 1 (default) — always visible; 2 — hidden on phones (<768px); 3 — hidden below
   * desktop (<1024px). Rank columns so the essentials survive on small screens; hidden
   * values stay reachable on the record's detail page.
   */
  priority?: 1 | 2 | 3;
  align?: "left" | "right";
  /**
   * Marks the flexible column: it absorbs the remaining width and ellipsizes its
   * content instead of forcing the table wider than its container. Give exactly one
   * column (the longest text, e.g. an email) truncate: true.
   */
  truncate?: boolean;
};

type DataTableProps<T> = {
  columns: DataTableColumn<T>[];
  rows: T[];
  rowKey: (row: T) => string;
  empty?: ReactNode;
  className?: string;
};

/**
 * Responsive table (D1): low-priority columns hide as the viewport narrows and the
 * flexible column ellipsizes, so the table never forces horizontal page scroll.
 */
export function DataTable<T>({ columns, rows, rowKey, empty, className }: DataTableProps<T>) {
  function colClass(col: DataTableColumn<T>) {
    const p = col.priority ?? 1;
    return [
      p === 2 ? styles.c2 : p === 3 ? styles.c3 : undefined,
      col.align === "right" ? styles.right : undefined,
      col.truncate ? styles.truncCell : undefined
    ]
      .filter(Boolean)
      .join(" ") || undefined;
  }

  if (rows.length === 0 && empty) {
    return (
      <div className={[styles.wrap, className].filter(Boolean).join(" ")}>
        <div className={styles.empty}>{empty}</div>
      </div>
    );
  }

  return (
    <div className={[styles.wrap, className].filter(Boolean).join(" ")}>
      <table className="compact-table">
        <thead>
          <tr>
            {columns.map((col) => (
              <th className={colClass(col)} key={col.key}>
                {col.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={rowKey(row)}>
              {columns.map((col) => (
                <td className={colClass(col)} key={col.key}>
                  {col.truncate ? <span className={styles.trunc}>{col.render(row)}</span> : col.render(row)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
