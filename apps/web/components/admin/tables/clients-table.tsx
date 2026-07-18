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
      header: c.name,
      key: "name",
      render: (client) => (
        <>
          <a href={href(`/admin/clients/${client.id}`)}><strong>{client.name}</strong></a>
          <br />
          <span style={{ color: "var(--muted)", fontSize: "0.85em" }}>{formatCustomerNumber(client.customerNumber)}</span>
        </>
      ),
      sortValue: (client) => client.name
    },
    {
      header: c.email,
      key: "email",
      render: (client) => client.email,
      sortValue: (client) => client.email,
      truncate: true
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
      header: c.unpaidInv,
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
