"use client";

import { ChevronRight, LogOut, Menu } from "lucide-react";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { ADMIN_AUTH_COOKIE, clearAuth, currentLocale } from "../../lib/api";
import { getDictionary, type Dictionary } from "../../lib/dictionary";
import { AdminBreadcrumbs } from "./admin-breadcrumbs";
import styles from "./admin-sidebar.module.css";

type AdminDict = Dictionary["admin"];
type NavLeaf = { href: string; label: string };
type NavGroup = { children: NavLeaf[]; label: string };
type NavEntry = NavLeaf | NavGroup;

function buildBaseNav(c: AdminDict): NavEntry[] {
  return [
    { href: "/admin", label: c.home },
    {
      label: c.clients,
      children: [
        { href: "/admin/clients", label: c.nav.allClients },
        { href: "/admin/clients/new", label: c.view.addClient }
      ]
    },
    {
      label: c.orders,
      children: [
        { href: "/admin/orders", label: c.nav.allOrders },
        { href: "/admin/orders/new", label: c.view.newOrder }
      ]
    },
    { href: "/admin/services", label: c.nav.domainsServices },
    {
      label: c.view.products,
      children: [
        { href: "/admin/products", label: c.view.products },
        { href: "/admin/products/categories", label: c.view.categories },
        { href: "/admin/products/modules", label: c.view.modules }
      ]
    },
    {
      label: c.eyebrow.billing,
      children: [{ href: "/admin/invoices", label: c.invoices }]
    },
    {
      label: c.emails,
      children: [
        { href: "/admin/emails", label: c.emails },
        { href: "/admin/emails/settings", label: c.settings },
        { href: "/admin/emails/template", label: c.nav.templates },
        { href: "/admin/emails/logs", label: c.logs }
      ]
    },
    {
      label: c.eyebrow.support,
      children: [
        { href: "/admin/tickets", label: c.nav.allTickets },
        { href: "/admin/tickets/new", label: c.view.newTicket },
        { href: "/admin/tickets/departments", label: c.view.departments },
        { href: "/admin/knowledgebase", label: c.knowledgebase }
      ]
    },
    {
      label: c.blog,
      children: [
        { href: "/admin/blog", label: c.nav.posts },
        { href: "/admin/blog/new", label: c.nav.newPost },
        { href: "/admin/blog/categories", label: c.view.categoriesTags },
        { href: "/admin/blog/ai-content", label: c.view.aiContent },
        { href: "/admin/blog/ai-settings", label: c.view.aiJobSettings }
      ]
    },
    { href: "/admin/announcements", label: c.announcements },
    {
      label: c.nav.theme,
      children: [
        { href: "/admin/theme/blue", label: "Blue" }
      ]
    }
  ];
}

function buildSettingsNav(c: AdminDict): NavEntry {
  return {
    label: c.settings,
    children: [
      { href: "/admin/settings", label: c.view.generalSettings },
      { href: "/admin/settings/seo", label: c.view.seoSocial },
      { href: "/admin/settings/cron", label: c.view.cronSettings },
      { href: "/admin/settings/admins", label: c.view.admins },
      { href: "/admin/payment-gateways", label: c.paymentGateways },
      { href: "/admin/logs", label: c.logs }
    ]
  };
}

function adminRolesFromToken(): string[] {
  if (typeof window === "undefined") return [];
  try {
    const token = window.localStorage.getItem(ADMIN_AUTH_COOKIE) ??
      document.cookie.split("; ").find((c) => c.startsWith(`${ADMIN_AUTH_COOKIE}=`))
        ?.split("=")[1];
    if (!token) return [];
    const payload = JSON.parse(atob(token.split(".")[1] ?? "")) as { roles?: string[] };
    return payload.roles ?? [];
  } catch {
    return [];
  }
}

function isSuperAdmin(roles: string[]) {
  return roles.some((r) => r === "admin" || r === "super_admin");
}

function isGroup(entry: NavEntry): entry is NavGroup {
  return "children" in entry;
}

function groupContainsPath(group: NavGroup, path: string) {
  return group.children.some((child) => path === child.href || path.startsWith(child.href + "/"));
}

export function AdminSidebar(_props: { brandLogo?: string }) {
  const copy = getDictionary(currentLocale()).admin;
  const baseNav = buildBaseNav(copy);
  const settingsNav = buildSettingsNav(copy);
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [nav, setNav] = useState<NavEntry[]>(baseNav);

  useEffect(() => {
    const roles = adminRolesFromToken();
    setNav(isSuperAdmin(roles) ? [...baseNav, settingsNav] : baseNav);
  }, []);

  const [open, setOpen] = useState<Set<string>>(() => {
    const initial = new Set<string>();
    for (const entry of baseNav) {
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
  }, [pathname, nav]);

  function toggle(label: string) {
    setOpen((prev) => {
      const next = new Set(prev);
      if (next.has(label)) next.delete(label);
      else next.add(label);
      return next;
    });
  }

  function logout() {
    clearAuth("admin");
    window.location.assign("/admin/login");
  }

  return (
    <aside className={styles.sidebar}>
      {/* Mobile-only top bar: Menu toggle on the left, a compact Log out link on the right. */}
      <div className={styles.mobileBar}>
        <button
          aria-expanded={mobileOpen}
          aria-label={copy.nav.toggleNav}
          className={styles.mobileToggle}
          onClick={() => setMobileOpen((prev) => !prev)}
          type="button"
        >
          <Menu aria-hidden size={16} />
          <span>{copy.nav.menu}</span>
          <ChevronRight
            aria-hidden
            className={`${styles.chevron}${mobileOpen ? ` ${styles.chevronOpen}` : ""}`}
            size={14}
          />
        </button>
        <button className={styles.mobileLogout} onClick={logout} type="button">
          <LogOut aria-hidden size={13} />
          <span>{copy.logout}</span>
        </button>
      </div>

      {/* Mobile-only breadcrumb row, sticky under the menu/logout bar (desktop uses the layout bar). */}
      <AdminBreadcrumbs variant="sidebar" />

      <strong className={styles.brandName}>Teculiar</strong>

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
              <div className={styles.groupRow}>
                <a
                  className={`${styles.groupLink}${hasActive ? ` ${styles.groupLinkActive}` : ""}`}
                  href={entry.children[0]?.href ?? "#"}
                >
                  {entry.label}
                </a>
                <button
                  aria-expanded={isOpen}
                  aria-label={copy.nav.toggleGroup.replace("{label}", entry.label)}
                  className={styles.chevronBtn}
                  onClick={() => toggle(entry.label)}
                  type="button"
                >
                  <ChevronRight
                    aria-hidden
                    className={`${styles.chevron}${isOpen ? ` ${styles.chevronOpen}` : ""}`}
                    size={14}
                  />
                </button>
              </div>
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

      <button className={styles.logoutBtn} onClick={logout} type="button">
        <LogOut aria-hidden size={14} />
        {copy.logout}
      </button>
    </aside>
  );
}
