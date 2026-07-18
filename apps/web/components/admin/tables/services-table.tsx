"use client";

import { useState } from "react";
import { cycleLabel, money, serviceUnitPriceCents, type ApiService } from "@teculiar/web-core/lib/api";
import { getDictionary } from "@teculiar/web-core/lib/dictionary";
import type { Locale } from "@teculiar/web-core/lib/i18n";
import { serviceStatusLabel } from "@teculiar/web-core/lib/status-labels";
import { DataTable, type DataTableColumn } from "@teculiar/web-core/components/ui/data-table";
import { StatusPillSelect } from "@teculiar/web-core/components/ui/status-pill-select";
import { notifyResponse } from "@teculiar/web-core/components/ui/toast-provider";
import { useSurfaceHref } from "@teculiar/web-core/lib/use-surface-href";
import { adminMutate, shortDate, ts } from "./shared";

// Admin-changeable target states; machine states (PENDING/PROVISIONING/…_FAILED) are
// set by provisioning only and stay out of the dropdown.
const SERVICE_TARGETS = ["ACTIVE", "SUSPENDED", "CANCELLED", "TERMINATED"] as const;

function serviceTone(status: string) {
  if (status === "ACTIVE") return "good";
  if (["CANCELLED", "TERMINATED"].includes(status)) return "neutral";
  return "warn";
}

function serviceKindLabel(type: string) {
  return { DOMAIN: "Domain", SHARED_HOSTING: "Hosting", VPS: "VPS" }[type] ?? type.toLowerCase().replaceAll("_", " ");
}

function stringValue(value: unknown) {
  return typeof value === "string" && value ? value : undefined;
}

export function ServicesTable({ locale, services }: { locale: Locale; services: ApiService[] }) {
  const href = useSurfaceHref();
  const copy = getDictionary(locale).admin;
  const [rows, setRows] = useState(services);

  async function changeStatus(service: ApiService, value: string) {
    const response = await adminMutate("PATCH", `/admin/dev/services/${service.id}/status`, { status: value });
    await notifyResponse(response, copy.list.statusSaved, copy.list.statusFailed);
    if (response.ok) {
      setRows((current) => current.map((row) => (row.id === service.id ? { ...row, status: value } : row)));
    }
  }

  const columns: DataTableColumn<ApiService>[] = [
    {
      header: copy.col.service,
      key: "service",
      render: (service) => (
        <>
          <a href={href(`/admin/services/${service.id}`)}>{service.product.name}</a>
          <br />
          {service.domainRecords?.[0]?.domain ?? stringValue(service.configuration?.domainName) ?? serviceKindLabel(service.product.type)}
        </>
      ),
      sortValue: (service) => service.product.name,
      truncate: true
    },
    {
      header: copy.col.pricing,
      key: "pricing",
      priority: 3,
      render: (service) => `${money(serviceUnitPriceCents(service), service.productPrice.currency, locale)} / ${cycleLabel(service.productPrice.billingCycle, locale)}`,
      sortValue: (service) => serviceUnitPriceCents(service)
    },
    {
      header: copy.col.nextDue,
      key: "nextDue",
      priority: 2,
      render: (service) => <span className="cell-nowrap">{shortDate(service.renewsAt, locale)}</span>,
      sortValue: (service) => ts(service.renewsAt)
    },
    {
      header: copy.status,
      key: "status",
      render: (service) => (
        <StatusPillSelect
          label={serviceStatusLabel(service.status, locale)}
          menuLabel={copy.list.changeStatus}
          onSelect={(value) => changeStatus(service, value)}
          options={SERVICE_TARGETS.map((value) => ({ label: serviceStatusLabel(value, locale), value }))}
          tone={serviceTone(service.status)}
          value={service.status}
        />
      ),
      sortValue: (service) => serviceStatusLabel(service.status, locale)
    }
  ];

  return (
    <DataTable
      columns={columns}
      empty={copy.noServices}
      rowKey={(service) => service.id}
      rows={rows}
    />
  );
}
