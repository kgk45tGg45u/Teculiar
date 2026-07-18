"use client";

import { useState } from "react";
import type { ApiTicket } from "@teculiar/web-core/lib/api";
import { getDictionary } from "@teculiar/web-core/lib/dictionary";
import type { Locale } from "@teculiar/web-core/lib/i18n";
import { TICKET_STATUS_VALUES, ticketStatusLabel, ticketStatusTone } from "@teculiar/web-core/lib/status-labels";
import { Button } from "@teculiar/web-core/components/ui/button";
import { DataTable, type DataTableColumn } from "@teculiar/web-core/components/ui/data-table";
import { StatusPillSelect } from "@teculiar/web-core/components/ui/status-pill-select";
import { notify, notifyResponse } from "@teculiar/web-core/components/ui/toast-provider";
import { useSurfaceHref } from "@teculiar/web-core/lib/use-surface-href";
import { adminMutate, bulkSummary, runBulk, shortDate, ts } from "./shared";

export function TicketsTable({ locale, tickets }: { locale: Locale; tickets: ApiTicket[] }) {
  const href = useSurfaceHref();
  const copy = getDictionary(locale).admin;
  const [rows, setRows] = useState(tickets);

  async function changeStatus(ticket: ApiTicket, value: string) {
    const response = await adminMutate("PATCH", `/tickets/${ticket.id}/status`, { status: value });
    await notifyResponse(response, copy.list.statusSaved, copy.list.statusFailed);
    if (response.ok) {
      setRows((current) => current.map((row) => (row.id === ticket.id ? { ...row, status: value } : row)));
    }
  }

  // Bulk hard-delete for spam tickets (admin/super_admin only server-side).
  async function bulkDelete(selected: ApiTicket[], clear: () => void) {
    if (!window.confirm(copy.list.confirmDelete)) return;
    const { failed, ok } = await runBulk(selected.map((row) => row.id), (id) => adminMutate("DELETE", `/tickets/${id}`));
    setRows((current) => current.filter((row) => !ok.includes(row.id)));
    (failed ? notify.error : notify.success)(bulkSummary(ok.length, failed, copy.list.bulkDone, copy.list.bulkFailed));
    clear();
  }

  const columns: DataTableColumn<ApiTicket>[] = [
    {
      header: copy.department,
      key: "department",
      priority: 2,
      render: (ticket) => ticket.department?.name ?? "",
      sortValue: (ticket) => ticket.department?.name ?? null
    },
    {
      header: copy.subject,
      key: "subject",
      render: (ticket) => (
        <a href={href(`/admin/tickets/${ticket.id}`)}>#{ticket.publicId ?? ticket.id.slice(-6).toUpperCase()} {ticket.subject}</a>
      ),
      sortValue: (ticket) => ticket.subject,
      truncate: true
    },
    {
      header: copy.status,
      key: "status",
      render: (ticket) => (
        <StatusPillSelect
          label={ticketStatusLabel(ticket.status, locale)}
          menuLabel={copy.list.changeStatus}
          onSelect={(value) => changeStatus(ticket, value)}
          options={TICKET_STATUS_VALUES.map((value) => ({ label: ticketStatusLabel(value, locale), value }))}
          tone={ticketStatusTone(ticket.status)}
          value={ticket.status}
        />
      ),
      sortValue: (ticket) => ticketStatusLabel(ticket.status, locale)
    },
    {
      header: copy.lastUpdate,
      key: "updated",
      priority: 3,
      render: (ticket) => <span className="cell-nowrap">{shortDate(ticket.updatedAt, locale)}</span>,
      sortValue: (ticket) => ts(ticket.updatedAt)
    }
  ];

  return (
    <DataTable
      bulkBar={(selected, clear) => (
        <>
          <strong>{selected.length} {copy.list.selected}</strong>
          <Button onClick={() => bulkDelete(selected, clear)} size="sm" variant="danger">{copy.list.deleteSelected}</Button>
          <Button onClick={clear} size="sm" variant="ghost">{copy.list.clearSelection}</Button>
        </>
      )}
      columns={columns}
      empty={copy.noTickets}
      initialSort={{ dir: "desc", key: "updated" }}
      rowKey={(ticket) => ticket.id}
      rows={rows}
      selectLabels={{ all: copy.list.selectAll, row: copy.list.selectRow }}
      selectable
    />
  );
}
