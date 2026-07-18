"use client";

import { useMemo, useState, type ReactNode } from "react";
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
  /**
   * Presence makes the column sortable (Phase 5): the header becomes a toggle button
   * with aria-sort. Return the comparable value — numbers compare numerically, strings
   * via localeCompare; null/undefined always sort last.
   */
  sortValue?: (row: T) => string | number | null | undefined;
};

export type DataTableSort = { key: string; dir: "asc" | "desc" };

type DataTableProps<T> = {
  columns: DataTableColumn<T>[];
  rows: T[];
  rowKey: (row: T) => string;
  empty?: ReactNode;
  className?: string;
  initialSort?: DataTableSort;
  /** Adds a leading checkbox column; selected rows feed the bulkBar. */
  selectable?: boolean;
  /** Rendered above the table while at least one row is selected. */
  bulkBar?: (selected: T[], clear: () => void) => ReactNode;
  /** Localized aria labels for the selection checkboxes. */
  selectLabels?: { all: string; row: string };
};

function compareValues(a: string | number | null | undefined, b: string | number | null | undefined) {
  if (a == null && b == null) return 0;
  if (a == null) return 1; // nulls last regardless of direction sign flip below
  if (b == null) return -1;
  if (typeof a === "number" && typeof b === "number") return a - b;
  return String(a).localeCompare(String(b), undefined, { numeric: true, sensitivity: "base" });
}

/**
 * Responsive table (D1): low-priority columns hide as the viewport narrows and the
 * flexible column ellipsizes, so the table never forces horizontal page scroll.
 * Phase 5 adds client-side column sorting and multi-select with a bulk-action bar.
 */
export function DataTable<T>({ columns, rows, rowKey, empty, className, initialSort, selectable, bulkBar, selectLabels }: DataTableProps<T>) {
  const [sort, setSort] = useState<DataTableSort | null>(initialSort ?? null);
  const [selectedKeys, setSelectedKeys] = useState<ReadonlySet<string>>(new Set());

  const sorted = useMemo(() => {
    const col = sort ? columns.find((c) => c.key === sort.key && c.sortValue) : undefined;
    if (!sort || !col?.sortValue) return rows;
    const value = col.sortValue;
    const sign = sort.dir === "asc" ? 1 : -1;
    return [...rows]
      .map((row, index) => ({ index, row }))
      .sort((a, b) => {
        const byValue = compareValues(value(a.row), value(b.row));
        // nulls stay last in both directions; equal values keep the incoming order
        if (value(a.row) == null || value(b.row) == null) return byValue;
        return byValue !== 0 ? sign * byValue : a.index - b.index;
      })
      .map((entry) => entry.row);
  }, [columns, rows, sort]);

  const selected = useMemo(() => rows.filter((row) => selectedKeys.has(rowKey(row))), [rows, rowKey, selectedKeys]);
  const allSelected = rows.length > 0 && selected.length === rows.length;

  function toggleSort(key: string) {
    setSort((current) => (current?.key === key ? { dir: current.dir === "asc" ? "desc" : "asc", key } : { dir: "asc", key }));
  }

  function toggleRow(key: string) {
    setSelectedKeys((current) => {
      const next = new Set(current);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  function toggleAll() {
    setSelectedKeys(allSelected ? new Set() : new Set(rows.map(rowKey)));
  }

  function clearSelection() {
    setSelectedKeys(new Set());
  }

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
      {bulkBar && selected.length > 0 ? <div className={styles.bulkBar}>{bulkBar(selected, clearSelection)}</div> : null}
      <table className="compact-table">
        <thead>
          <tr>
            {selectable ? (
              <th className={styles.checkCol}>
                <input aria-label={selectLabels?.all ?? "Select all"} checked={allSelected} onChange={toggleAll} type="checkbox" />
              </th>
            ) : null}
            {columns.map((col) => (
              <th
                aria-sort={sort?.key === col.key ? (sort.dir === "asc" ? "ascending" : "descending") : undefined}
                className={colClass(col)}
                key={col.key}
              >
                {col.sortValue ? (
                  <button className={styles.sortBtn} onClick={() => toggleSort(col.key)} type="button">
                    {col.header}
                    <span aria-hidden className={styles.sortMark}>
                      {sort?.key === col.key ? (sort.dir === "asc" ? "▲" : "▼") : "↕"}
                    </span>
                  </button>
                ) : (
                  col.header
                )}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {sorted.map((row) => {
            const key = rowKey(row);
            return (
              <tr className={selectedKeys.has(key) ? styles.rowSelected : undefined} key={key}>
                {selectable ? (
                  <td className={styles.checkCol}>
                    <input aria-label={selectLabels?.row ?? "Select row"} checked={selectedKeys.has(key)} onChange={() => toggleRow(key)} type="checkbox" />
                  </td>
                ) : null}
                {columns.map((col) => (
                  <td className={colClass(col)} key={col.key}>
                    {col.truncate ? <span className={styles.trunc}>{col.render(row)}</span> : col.render(row)}
                  </td>
                ))}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
