"use client";

import { ChevronRight, LogOut, Menu } from "lucide-react";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { clearAuth } from "../../lib/api";
import styles from "./admin-sidebar.module.css";

type NavLeaf = { href: string; label: string };
type NavGroup = { children: NavLeaf[]; label: string };
type NavEntry = NavLeaf | NavGroup;

const nav: NavEntry[] = [
  { href: "/admin", label: "Home" },
  {
    label: "Clients",
    children: [
      { href: "/admin/clients", label: "All Clients" },
      { href: "/admin/clients/new", label: "Add Client" }
    ]
  },
  {
    label: "Orders",
    children: [
      { href: "/admin/orders", label: "All Orders" },
      { href: "/admin/orders/new", label: "New Order" }
    ]
  },
  { href: "/admin/services", label: "Domains & Services" },
  {
    label: "Products",
    children: [
      { href: "/admin/products", label: "Products" },
      { href: "/admin/products/categories", label: "Categories" },
      { href: "/admin/products/modules", label: "Modules" }
    ]
  },
  {
    label: "Billing",
    children: [{ href: "/admin/invoices", label: "Invoices" }]
  },
  {
    label: "Emails",
    children: [
      { href: "/admin/emails", label: "All Emails" },
      { href: "/admin/emails/settings", label: "Settings" },
      { href: "/admin/emails/template", label: "Templates" },
      { href: "/admin/emails/logs", label: "Logs" }
    ]
  },
  {
    label: "Support",
    children: [
      { href: "/admin/tickets", label: "All Tickets" },
      { href: "/admin/tickets/new", label: "New Ticket" },
      { href: "/admin/tickets/departments", label: "Departments" },
      { href: "/admin/knowledgebase", label: "Knowledgebase" }
    ]
  },
  {
    label: "Blog",
    children: [
      { href: "/admin/blog", label: "Posts" },
      { href: "/admin/blog/new", label: "New Post" },
      { href: "/admin/blog/categories", label: "Categories & Tags" }
    ]
  },
  { href: "/admin/announcements", label: "Announcements" },
  {
    label: "Settings",
    children: [
      { href: "/admin/settings", label: "General Settings" },
      { href: "/admin/settings/cron", label: "Cron Settings" },
      { href: "/admin/payment-gateways", label: "Payment Gateways" },
      { href: "/admin/logs", label: "Logs" }
    ]
  }
];

function isGroup(entry: NavEntry): entry is NavGroup {
  return "children" in entry;
}

function groupContainsPath(group: NavGroup, path: string) {
  return group.children.some((child) => path === child.href || path.startsWith(child.href + "/"));
}

export function AdminSidebar({ brandLogo }: { brandLogo?: string }) {
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [open, setOpen] = useState<Set<string>>(() => {
    const initial = new Set<string>();
    for (const entry of nav) {
      if (isGroup(entry) && groupContainsPath(entry, pathname)) {
        initial.add(entry.label);
      }
    }
    return initial;
  });

  useEffect(() => {
    setOpen((prev) => {
      const next = new Set(prev);
      for (const entry of nav) {
        if (isGroup(entry) && groupContainsPath(entry, pathname)) {
          next.add(entry.label);
        }
      }
      return next;
    });
    setMobileOpen(false);
  }, [pathname]);

  function toggle(label: string) {
    setOpen((prev) => {
      const next = new Set(prev);
      if (next.has(label)) next.delete(label);
      else next.add(label);
      return next;
    });
  }

  return (
    <aside className={styles.sidebar}>
      <button
        aria-expanded={mobileOpen}
        aria-label="Toggle navigation"
        className={styles.mobileToggle}
        onClick={() => setMobileOpen((prev) => !prev)}
        type="button"
      >
        <Menu aria-hidden size={16} />
        <span>Menu</span>
        <ChevronRight
          aria-hidden
          className={`${styles.chevron}${mobileOpen ? ` ${styles.chevronOpen}` : ""}`}
          size={14}
        />
      </button>

      {brandLogo ? (
        <img alt="Logo" className={styles.brandLogo} src={brandLogo} />
      ) : (
        <strong className={styles.brandName}>Admin</strong>
      )}

      <nav className={`${styles.nav}${mobileOpen ? ` ${styles.navOpen}` : ""}`}>
        {nav.map((entry) => {
          if (!isGroup(entry)) {
            const active = pathname === entry.href;
            return (
              <a
                aria-current={active ? "page" : undefined}
                className={styles.navItem}
                href={entry.href}
                key={entry.href}
              >
                {entry.label}
              </a>
            );
          }
          const isOpen = open.has(entry.label);
          const hasActive = groupContainsPath(entry, pathname);
          const exactMatch = entry.children.find((c) => pathname === c.href);
          return (
            <div className={styles.group} key={entry.label}>
              <button
                aria-expanded={isOpen}
                className={`${styles.groupBtn}${hasActive ? ` ${styles.groupBtnActive}` : ""}`}
                onClick={() => toggle(entry.label)}
                type="button"
              >
                <span>{entry.label}</span>
                <ChevronRight
                  aria-hidden
                  className={`${styles.chevron}${isOpen ? ` ${styles.chevronOpen}` : ""}`}
                  size={14}
                />
              </button>
              <div className={`${styles.submenu}${isOpen ? ` ${styles.submenuOpen}` : ""}`}>
                {entry.children.map((child) => {
                  const active = exactMatch
                    ? pathname === child.href
                    : child.href !== "/admin" && pathname.startsWith(child.href + "/");
                  return (
                    <a
                      aria-current={active ? "page" : undefined}
                      className={styles.subItem}
                      href={child.href}
                      key={child.href}
                    >
                      {child.label}
                    </a>
                  );
                })}
              </div>
            </div>
          );
        })}
      </nav>

      <button
        className={styles.logoutBtn}
        type="button"
        onClick={() => {
          clearAuth("admin");
          window.location.assign("/admin/login");
        }}
      >
        <LogOut aria-hidden size={14} />
        Log out
      </button>
    </aside>
  );
}
