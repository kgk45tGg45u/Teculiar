"use client";

import { useState } from "react";
import { invoiceDisplayNumber, money, type ApiOrder } from "@teculiar/web-core/lib/api";
import { getDictionary } from "@teculiar/web-core/lib/dictionary";
import type { Locale } from "@teculiar/web-core/lib/i18n";
import { orderStatusLabel, serviceStatusLabel } from "@teculiar/web-core/lib/status-labels";
import { DataTable, type DataTableColumn } from "@teculiar/web-core/components/ui/data-table";
import { StatusPillSelect } from "@teculiar/web-core/components/ui/status-pill-select";
import { notifyResponse } from "@teculiar/web-core/components/ui/toast-provider";
import { useSurfaceHref } from "@teculiar/web-core/lib/use-surface-href";
import { adminMutate, shortDate, ts } from "./shared";
import styles from "../admin-dashboard.module.css";

// Admin values the PATCH /orders/:id/status endpoint accepts → resulting enum.
const ORDER_TARGETS = [
  { enumValue: "COMPLETE", value: "completed" },
  { enumValue: "PENDING", value: "pending" },
  { enumValue: "CANCELLED", value: "canceled" }
] as const;

function orderTone(status: string) {
  return status === "COMPLETE" ? "good" : status === "CANCELLED" ? "neutral" : "warn";
}

export function OrdersTable({ locale, orders }: { locale: Locale; orders: ApiOrder[] }) {
  const href = useSurfaceHref();
  const copy = getDictionary(locale).admin;
  const [rows, setRows] = useState(orders);

  async function changeStatus(order: ApiOrder, value: string) {
    const target = ORDER_TARGETS.find((t) => t.value === value);
    if (!target) return;
    const response = await adminMutate("PATCH", `/orders/${order.id}/status`, { status: value });
    await notifyResponse(response, copy.list.statusSaved, copy.list.statusFailed);
    if (response.ok) {
      setRows((current) => current.map((row) => (row.id === order.id ? { ...row, status: target.enumValue } : row)));
    }
  }

  const columns: DataTableColumn<ApiOrder>[] = [
    {
      header: copy.order,
      key: "order",
      render: (order) => (
        <details>
          <summary><a href={href(`/admin/orders/${order.id}`)}>{order.orderNumber}</a></summary>
          <div className={styles.orderDetails}>
            <p><strong>{copy.invoices}:</strong> {order.invoice ? invoiceDisplayNumber(order.invoice) : "-"} ({order.invoice?.status ?? copy.misc.noInvoice})</p>
            <table className="table">
              <tbody>
                {order.items.map((item) => (
                  <tr key={item.id}>
                    <td>{item.description}</td>
                    <td>{item.domainName ?? "-"}</td>
                    <td>{serviceStatusLabel(item.provisioningStatus, locale)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </details>
      ),
      sortValue: (order) => order.orderNumber
    },
    {
      header: copy.col.date,
      key: "date",
      priority: 2,
      render: (order) => <span className="cell-nowrap">{shortDate(order.placedAt ?? order.createdAt, locale)}</span>,
      sortValue: (order) => ts(order.placedAt ?? order.createdAt)
    },
    {
      header: copy.client,
      key: "client",
      // Flexible column: the client name absorbs the leftover width between order# and status/total
      // and ellipsizes (header clips too). Order line items are not shown here — the list response
      // doesn't carry them (the column was always empty); expand the order row to see the items.
      truncate: true,
      render: (order) => order.user?.name ?? order.user?.email ?? copy.misc.unknown,
      sortValue: (order) => order.user?.name ?? order.user?.email ?? null
    },
    {
      header: copy.status,
      key: "status",
      render: (order) => (
        <StatusPillSelect
          label={orderStatusLabel(order.status, locale)}
          menuLabel={copy.list.changeStatus}
          onSelect={(value) => changeStatus(order, value)}
          options={ORDER_TARGETS.map((t) => ({ label: orderStatusLabel(t.enumValue, locale), value: t.value }))}
          tone={orderTone(order.status)}
          value={ORDER_TARGETS.find((t) => t.enumValue === order.status)?.value ?? "pending"}
        />
      )
    },
    {
      header: copy.invoices,
      key: "invoice",
      priority: 3,
      render: (order) => (order.invoice ? <a href={href(`/admin/invoices/${order.invoice.id}`)}>{invoiceDisplayNumber(order.invoice)}</a> : "-")
    },
    {
      header: copy.total,
      key: "total",
      // Right-aligned so the amount hugs the table's right edge — otherwise, as the last column
      // absorbing the slack width, the left-aligned amount left a big empty gap on the right.
      align: "right",
      render: (order) => <span className="cell-nowrap">{money(order.totalCents, order.currency, locale)}</span>,
      sortValue: (order) => order.totalCents
    }
  ];

  return (
    <DataTable
      columns={columns}
      empty={copy.noOrders}
      initialSort={{ dir: "desc", key: "date" }}
      rowKey={(order) => order.id}
      rows={rows}
    />
  );
}
