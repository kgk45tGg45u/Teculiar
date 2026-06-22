"use client";

import type { Route } from "next";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { getDictionary, type Dictionary } from "../../lib/dictionary";
import { useLocale } from "../layout/locale-provider";
import styles from "./admin-breadcrumbs.module.css";

type AdminDict = Dictionary["admin"];

// Friendly labels for known admin path segments (sourced from the shared admin pack so they
// follow the configured language). Anything not listed falls back to a title-cased slug.
function segmentLabels(c: AdminDict): Record<string, string> {
  return {
    admin: c.eyebrow.admin,
    clients: c.clients,
    orders: c.orders,
    services: c.nav.domainsServices,
    products: c.view.products,
    categories: c.view.categories,
    modules: c.view.modules,
    invoices: c.invoices,
    emails: c.emails,
    settings: c.settings,
    seo: c.crumb.seo,
    cron: c.view.cronSettings,
    admins: c.view.admins,
    logs: c.logs,
    tickets: c.crumb.tickets,
    departments: c.view.departments,
    knowledgebase: c.knowledgebase,
    blog: c.blog,
    "ai-content": c.view.aiContent,
    "ai-settings": c.view.aiJobSettings,
    announcements: c.announcements,
    "domain-prices": c.domainPrices,
    "payment-gateways": c.paymentGateways,
    theme: c.nav.theme,
    template: c.nav.templates,
    new: c.crumb.new
  };
}

// When a segment is a record id (cuid-like), label it by the section it belongs to.
function entityByParent(c: AdminDict): Record<string, string> {
  return {
    clients: c.client,
    orders: c.order,
    services: c.col.service,
    invoices: c.col.invoice,
    tickets: c.crumb.ticket
  };
}

function isRecordId(segment: string) {
  return /^c[a-z0-9]{20,}$/i.test(segment) || /^[a-f0-9]{16,}$/i.test(segment);
}

function titleCase(segment: string) {
  return segment.replace(/-/g, " ").replace(/\b\w/g, (char) => char.toUpperCase());
}

// "bar" = full-width bar under the header (desktop). "sidebar" = rendered inside the admin
// sidebar's sticky mobile header (mobile). CSS shows exactly one of them per breakpoint.
export function AdminBreadcrumbs({ variant = "bar" }: { variant?: "bar" | "sidebar" }) {
  const copy = getDictionary(useLocale()).admin;
  const pathname = usePathname() ?? "/admin";
  if (!pathname.startsWith("/admin")) {
    return null;
  }
  const segments = pathname.split("/").filter(Boolean); // e.g. ["admin", "settings", "cron"]
  // No breadcrumbs on the admin home or the login screen.
  if (segments.length <= 1 || segments.includes("login")) {
    return null;
  }

  const SEGMENT_LABELS = segmentLabels(copy);
  const ENTITY_BY_PARENT = entityByParent(copy);
  const crumbs: Array<{ href: string; label: string }> = [];
  let href = "";
  segments.forEach((segment, index) => {
    href += `/${segment}`;
    const parent = index > 0 ? segments[index - 1] : undefined;
    const label = isRecordId(segment)
      ? (parent ? ENTITY_BY_PARENT[parent] : undefined) ?? copy.crumb.detail
      : SEGMENT_LABELS[segment] ?? titleCase(segment);
    crumbs.push({ href, label });
  });

  return (
    <nav aria-label={copy.crumb.breadcrumb} className={`${styles.breadcrumbs} ${variant === "sidebar" ? styles.sidebarVariant : styles.barVariant}`}>
      <ol className={styles.list}>
        {crumbs.map((crumb, index) => {
          const isLast = index === crumbs.length - 1;
          return (
            <li className={styles.item} key={crumb.href}>
              {isLast ? (
                <span aria-current="page" className={styles.current}>{crumb.label}</span>
              ) : (
                <Link className={styles.link} href={crumb.href as Route}>{crumb.label}</Link>
              )}
              {!isLast ? <span aria-hidden className={styles.separator}>/</span> : null}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
