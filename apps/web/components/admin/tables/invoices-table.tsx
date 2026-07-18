"use client";

import { useState } from "react";
import { invoiceDisplayNumber, money, type ApiInvoice } from "@teculiar/web-core/lib/api";
import { getDictionary } from "@teculiar/web-core/lib/dictionary";
import type { Locale } from "@teculiar/web-core/lib/i18n";
import { invoiceStatusLabel } from "@teculiar/web-core/lib/status-labels";
import { Button } from "@teculiar/web-core/components/ui/button";
import { DataTable, type DataTableColumn } from "@teculiar/web-core/components/ui/data-table";
import { StatusPillSelect } from "@teculiar/web-core/components/ui/status-pill-select";
import { notify, notifyResponse } from "@teculiar/web-core/components/ui/toast-provider";
import { useSurfaceHref } from "@teculiar/web-core/lib/use-surface-href";
import { adminMutate, bulkSummary, runBulk, shortDate, ts } from "./shared";

function invoiceTone(status: string) {
  if (status === "PAID") return "good";
  if (["REFUNDED", "CANCELLED"].includes(status)) return "neutral";
  return "warn";
}

export function InvoicesTable({ invoices, locale }: { invoices: ApiInvoice[]; locale: Locale }) {
  const href = useSurfaceHref();
  const copy = getDictionary(locale).admin;
  const [rows, setRows] = useState(invoices);

  function markLocal(ids: string[], status: "PAID" | "PENDING") {
    const paidAt = status === "PAID" ? new Date().toISOString() : undefined;
    setRows((current) => current.map((row) => (ids.includes(row.id) ? { ...row, paidAt, status } : row)));
  }

  async function changeStatus(invoice: ApiInvoice, value: string) {
    const action = value === "PAID" ? "mark-paid" : "mark-unpaid";
    const response = await adminMutate("POST", `/billing/invoices/${invoice.id}/${action}`, {});
    await notifyResponse(response, copy.list.statusSaved, copy.list.statusFailed);
    if (response.ok) markLocal([invoice.id], value === "PAID" ? "PAID" : "PENDING");
  }

  async function bulkMark(selected: ApiInvoice[], clear: () => void, status: "PAID" | "PENDING") {
    const action = status === "PAID" ? "mark-paid" : "mark-unpaid";
    const { failed, ok } = await runBulk(selected.map((row) => row.id), (id) => adminMutate("POST", `/billing/invoices/${id}/${action}`, {}));
    markLocal(ok, status);
    (failed ? notify.error : notify.success)(bulkSummary(ok.length, failed, copy.list.bulkDone, copy.list.bulkFailed));
    clear();
  }

  async function bulkDelete(selected: ApiInvoice[], clear: () => void) {
    if (!window.confirm(copy.list.confirmDelete)) return;
    const { failed, ok } = await runBulk(selected.map((row) => row.id), (id) => adminMutate("DELETE", `/billing/invoices/${id}`));
    setRows((current) => current.filter((row) => !ok.includes(row.id)));
    (failed ? notify.error : notify.success)(bulkSummary(ok.length, failed, copy.list.bulkDone, copy.list.bulkFailed));
    clear();
  }

  const columns: DataTableColumn<ApiInvoice>[] = [
    {
      header: copy.col.invoice,
      key: "number",
      render: (invoice) => <a href={href(`/admin/invoices/${invoice.id}`)}>{invoiceDisplayNumber(invoice)}</a>,
      sortValue: (invoice) => invoiceDisplayNumber(invoice)
    },
    {
      header: copy.client,
      key: "client",
      render: (invoice) => invoice.customerSnapshot?.name ?? "—",
      sortValue: (invoice) => invoice.customerSnapshot?.name ?? null,
      truncate: true
    },
    {
      header: copy.col.issued,
      key: "issued",
      priority: 3,
      render: (invoice) => shortDate(invoice.issuedAt, locale),
      sortValue: (invoice) => ts(invoice.issuedAt)
    },
    {
      header: copy.col.duePaid,
      key: "duePaid",
      priority: 2,
      render: (invoice) => shortDate(invoice.status === "PAID" ? invoice.paidAt : invoice.dueAt, locale),
      sortValue: (invoice) => ts(invoice.status === "PAID" ? invoice.paidAt : invoice.dueAt)
    },
    {
      header: copy.total,
      key: "total",
      render: (invoice) => <span className="cell-nowrap">{money(invoice.totalCents, invoice.currency, locale)}</span>,
      sortValue: (invoice) => invoice.totalCents
    },
    {
      header: copy.status,
      key: "status",
      render: (invoice) => (
        <StatusPillSelect
          label={invoiceStatusLabel(invoice.status, locale)}
          menuLabel={copy.list.changeStatus}
          onSelect={(value) => changeStatus(invoice, value)}
          options={[
            { label: invoiceStatusLabel("PAID", locale), value: "PAID" },
            { label: invoiceStatusLabel("PENDING", locale), value: "PENDING" }
          ]}
          tone={invoiceTone(invoice.status)}
          value={invoice.status === "PAID" ? "PAID" : "PENDING"}
        />
      ),
      sortValue: (invoice) => invoiceStatusLabel(invoice.status, locale)
    }
  ];

  return (
    <DataTable
      bulkBar={(selected, clear) => (
        <>
          <strong>{selected.length} {copy.list.selected}</strong>
          <Button onClick={() => bulkMark(selected, clear, "PAID")} size="sm" variant="secondary">{copy.list.markPaid}</Button>
          <Button onClick={() => bulkMark(selected, clear, "PENDING")} size="sm" variant="secondary">{copy.list.markUnpaid}</Button>
          <Button onClick={() => bulkDelete(selected, clear)} size="sm" variant="danger">{copy.list.deleteSelected}</Button>
          <Button onClick={clear} size="sm" variant="ghost">{copy.list.clearSelection}</Button>
        </>
      )}
      columns={columns}
      empty={copy.misc.noInvoicesYet}
      rowKey={(invoice) => invoice.id}
      rows={rows}
      selectLabels={{ all: copy.list.selectAll, row: copy.list.selectRow }}
      selectable
    />
  );
}
