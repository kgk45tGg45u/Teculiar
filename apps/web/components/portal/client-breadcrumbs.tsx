"use client";

import type { Route } from "next";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { getDictionary, type Dictionary } from "@teculiar/web-core/lib/dictionary";
import { internalPath, surfaceHref } from "@teculiar/web-core/lib/surface";
import { useLocale } from "@teculiar/web-core/components/layout/locale-provider";
import styles from "../admin/admin-breadcrumbs.module.css";

type ClientDict = Dictionary["client"];

// Friendly labels for client-portal path segments (from the client pack, so they follow the
// configured language). Unknown segments fall back to a title-cased slug.
function segmentLabels(c: ClientDict): Record<string, string> {
  return {
    client: c.clientPortal,
    services: c.dash.title.services,
    domains: c.dash.title.domains,
    invoices: c.dash.title.invoices,
    tickets: c.dash.title.tickets,
    profile: c.dash.title.profile,
    payments: c.dash.title.payment,
    billing: c.accountBalance,
    knowledgebase: c.dash.title.knowledgebase
  };
}

// A record id under a section is labelled by the singular entity it belongs to.
function entityByParent(c: ClientDict): Record<string, string> {
  return {
    services: c.dash.service,
    invoices: c.dash.invoice,
    tickets: c.dash.ticket,
    domains: c.domain
  };
}

function isRecordId(segment: string) {
  return /^c[a-z0-9]{20,}$/i.test(segment) || /^[a-f0-9]{16,}$/i.test(segment);
}

function titleCase(segment: string) {
  return segment.replace(/-/g, " ").replace(/\b\w/g, (char) => char.toUpperCase());
}

// Rendered inline in the PageShell top bar (desktop) and in the mobile crumb row below it — the
// same slot the admin dashboard uses. Returns null on the client home so no empty row shows.
export function ClientBreadcrumbs() {
  const copy = getDictionary(useLocale()).client;
  const browserPath = usePathname() ?? "/client";
  const pathname = internalPath(browserPath, "client");
  if (!pathname.startsWith("/client")) {
    return null;
  }
  const segments = pathname.split("/").filter(Boolean); // e.g. ["client", "services", "<id>"]
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
      ? (parent ? ENTITY_BY_PARENT[parent] : undefined) ?? titleCase(segment)
      : SEGMENT_LABELS[segment] ?? titleCase(segment);
    crumbs.push({ href, label });
  });

  return (
    <nav aria-label={copy.dash.navAria} className={`${styles.breadcrumbs} ${styles.inlineVariant}`}>
      <ol className={styles.list}>
        {crumbs.map((crumb, index) => {
          const isLast = index === crumbs.length - 1;
          return (
            <li className={styles.item} key={crumb.href}>
              {isLast ? (
                <span aria-current="page" className={styles.current}>{crumb.label}</span>
              ) : (
                <Link className={styles.link} href={surfaceHref(browserPath, crumb.href) as Route}>{crumb.label}</Link>
              )}
              {!isLast ? <span aria-hidden className={styles.separator}>/</span> : null}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
