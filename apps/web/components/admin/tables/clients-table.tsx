"use client";

import { formatCustomerNumber, money, type ApiClient } from "@teculiar/web-core/lib/api";
import { getDictionary } from "@teculiar/web-core/lib/dictionary";
import type { Locale } from "@teculiar/web-core/lib/i18n";
import { DataTable, type DataTableColumn } from "@teculiar/web-core/components/ui/data-table";
import { useSurfaceHref } from "@teculiar/web-core/lib/use-surface-href";

function activeServices(client: ApiClient) {
  return client.services?.filter((service) => service.status === "ACTIVE").length ?? 0;
}

function unpaidInvoices(client: ApiClient) {
  return client.invoices?.filter((invoice) => invoice.status !== "PAID").length ?? 0;
}

function revenueCents(client: ApiClient) {
  return client.invoices?.filter((invoice) => invoice.status === "PAID").reduce((sum, invoice) => sum + invoice.totalCents, 0) ?? 0;
}

export function ClientsTable({ clients, locale }: { clients: ApiClient[]; locale: Locale }) {
  const href = useSurfaceHref();
  const copy = getDictionary(locale).admin;
  const c = copy.forms;

  const columns: DataTableColumn<ApiClient>[] = [
    {
      // nowrap header so "Client #" / "Kunde #" never breaks onto two lines when the Name column
      // (flexible) squeezes this one.
      header: <span className="cell-nowrap">{copy.col.clientNo}</span>,
      key: "clientNo",
      render: (client) => <span className="cell-nowrap">{formatCustomerNumber(client.customerNumber)}</span>,
      sortValue: (client) => client.customerNumber ?? null
    },
    {
      // Name is the flexible column: it ellipsizes instead of wrapping onto several lines (long
      // names looked cramped) and keeps the table inside the phone width. Email column removed.
      header: c.name,
      key: "name",
      truncate: true,
      render: (client) => <a href={href(`/admin/clients/${client.id}`)}><strong>{client.name}</strong></a>,
      sortValue: (client) => client.name
    },
    {
      header: c.active,
      key: "active",
      priority: 2,
      render: (client) => activeServices(client),
      sortValue: activeServices
    },
    {
      header: c.domains,
      key: "domains",
      priority: 3,
      render: (client) => client.domainRecords?.length ?? 0,
      sortValue: (client) => client.domainRecords?.length ?? 0
    },
    {
      header: <span className="cell-nowrap">{c.unpaidInv}</span>,
      key: "unpaid",
      priority: 2,
      render: unpaidInvoices,
      sortValue: unpaidInvoices
    },
    {
      header: c.revenue,
      key: "revenue",
      priority: 3,
      render: (client) => <span className="cell-nowrap">{money(revenueCents(client), "EUR", locale)}</span>,
      sortValue: revenueCents
    }
  ];

  return (
    <DataTable
      columns={columns}
      empty={c.noClients}
      initialSort={{ dir: "asc", key: "name" }}
      rowKey={(client) => client.id}
      rows={clients}
    />
  );
}
