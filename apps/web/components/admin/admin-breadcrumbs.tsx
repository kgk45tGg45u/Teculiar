"use client";

import type { Route } from "next";
import Link from "next/link";
import { usePathname } from "next/navigation";
import styles from "./admin-breadcrumbs.module.css";

// Friendly labels for known admin path segments. Anything not listed falls back to a
// title-cased version of the slug.
const SEGMENT_LABELS: Record<string, string> = {
  admin: "Admin",
  clients: "Clients",
  orders: "Orders",
  services: "Domains & Services",
  products: "Products",
  categories: "Categories",
  modules: "Modules",
  invoices: "Invoices",
  emails: "Emails",
  settings: "Settings",
  seo: "SEO & Social",
  cron: "Cron Settings",
  admins: "Admins & Roles",
  logs: "Logs",
  tickets: "Tickets",
  departments: "Departments",
  knowledgebase: "Knowledgebase",
  blog: "Blog",
  "ai-content": "AI Content",
  "ai-settings": "AI Job Settings",
  announcements: "Announcements",
  "domain-prices": "Domain Prices",
  "payment-gateways": "Payment Gateways",
  theme: "Theme",
  template: "Templates",
  new: "New"
};

// When a segment is a record id (cuid-like), label it by the section it belongs to.
const ENTITY_BY_PARENT: Record<string, string> = {
  clients: "Client",
  orders: "Order",
  services: "Service",
  invoices: "Invoice",
  tickets: "Ticket"
};

function isRecordId(segment: string) {
  return /^c[a-z0-9]{20,}$/i.test(segment) || /^[a-f0-9]{16,}$/i.test(segment);
}

function titleCase(segment: string) {
  return segment.replace(/-/g, " ").replace(/\b\w/g, (char) => char.toUpperCase());
}

// "bar" = full-width bar under the header (desktop). "sidebar" = rendered inside the admin
// sidebar's sticky mobile header (mobile). CSS shows exactly one of them per breakpoint.
export function AdminBreadcrumbs({ variant = "bar" }: { variant?: "bar" | "sidebar" }) {
  const pathname = usePathname() ?? "/admin";
  if (!pathname.startsWith("/admin")) {
    return null;
  }
  const segments = pathname.split("/").filter(Boolean); // e.g. ["admin", "settings", "cron"]
  // No breadcrumbs on the admin home or the login screen.
  if (segments.length <= 1 || segments.includes("login")) {
    return null;
  }

  const crumbs: Array<{ href: string; label: string }> = [];
  let href = "";
  segments.forEach((segment, index) => {
    href += `/${segment}`;
    const parent = index > 0 ? segments[index - 1] : undefined;
    const label = isRecordId(segment)
      ? (parent ? ENTITY_BY_PARENT[parent] : undefined) ?? "Detail"
      : SEGMENT_LABELS[segment] ?? titleCase(segment);
    crumbs.push({ href, label });
  });

  return (
    <nav aria-label="Breadcrumb" className={`${styles.breadcrumbs} ${variant === "sidebar" ? styles.sidebarVariant : styles.barVariant}`}>
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
