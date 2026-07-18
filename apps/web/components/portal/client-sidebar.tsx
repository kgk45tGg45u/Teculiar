"use client";

import { ChevronRight, LogOut, Wallet } from "lucide-react";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { API_BASE_URL, authHeaders, authToken, clearAuth, money } from "@teculiar/web-core/lib/api";
import { getDictionary } from "@teculiar/web-core/lib/dictionary";
import { internalPath, surfaceHref } from "@teculiar/web-core/lib/surface";
import { useLocale } from "@teculiar/web-core/components/layout/locale-provider";
import { SidebarNav, SidebarNavItem } from "@teculiar/web-core/components/ui/sidebar-nav";
import styles from "./client-sidebar.module.css";

type NavEntry = { href: string; label: string; exact?: boolean };

/** Client portal sidebar (D1) — rendered by PageShell in the client layout. */
export function ClientSidebar() {
  const copy = getDictionary(useLocale()).client;
  const browserPath = usePathname();
  const pathname = internalPath(browserPath, "client");
  const href = (target: string) => surfaceHref(browserPath, target);
  const [balanceCents, setBalanceCents] = useState(0);

  useEffect(() => {
    if (!authToken("client")) return;
    fetch(`${API_BASE_URL}/users/me`, { headers: authHeaders("client") })
      .then((res) => (res.ok ? res.json() : null))
      .then((profile: { balanceCents?: number } | null) => setBalanceCents(profile?.balanceCents ?? 0))
      .catch(() => {});
  }, []);

  const entries: NavEntry[] = [
    { href: "/client", label: copy.overview, exact: true },
    { href: "/client/services", label: copy.services },
    { href: "/client/domains", label: copy.domains },
    { href: "/client/invoices", label: copy.invoices },
    { href: "/client/billing/add-funds", label: copy.addFunds },
    { href: "/client/payments", label: copy.payments },
    { href: "/client/knowledgebase", label: copy.knowledgebase }
  ];
  const ticketChildren: NavEntry[] = [
    { href: "/client/tickets", label: copy.allTickets, exact: true },
    { href: "/client/tickets/new", label: copy.newTicket }
  ];
  const inTickets = pathname === "/client/tickets" || pathname.startsWith("/client/tickets/");
  const [ticketsOpen, setTicketsOpen] = useState(inTickets);

  useEffect(() => {
    if (inTickets) setTicketsOpen(true);
  }, [inTickets]);

  function isActive(entry: NavEntry) {
    if (entry.exact) return pathname === entry.href;
    return pathname === entry.href || pathname.startsWith(entry.href + "/");
  }

  function logout() {
    clearAuth("client");
    window.location.assign(href("/login"));
  }

  return (
    <aside className={styles.sidebar}>
      <SidebarNav aria-label={copy.dash.navAria} className={styles.nav}>
        {entries.map((entry) => (
          <SidebarNavItem active={isActive(entry)} href={href(entry.href)} key={entry.href}>
            {entry.label}
          </SidebarNavItem>
        ))}
        <div className={styles.group}>
          <div className={styles.groupRow}>
            <a
              className={`${styles.groupLink}${inTickets ? ` ${styles.groupLinkActive}` : ""}`}
              href={href("/client/tickets")}
            >
              {copy.tickets}
            </a>
            <button
              aria-expanded={ticketsOpen}
              aria-label={copy.tickets}
              className={styles.chevronBtn}
              onClick={() => setTicketsOpen((v) => !v)}
              type="button"
            >
              <ChevronRight
                aria-hidden
                className={`${styles.chevron}${ticketsOpen ? ` ${styles.chevronOpen}` : ""}`}
                size={14}
              />
            </button>
          </div>
          <div className={`${styles.submenu}${ticketsOpen ? ` ${styles.submenuOpen}` : ""}`}>
            {ticketChildren.map((child) => (
              <a
                aria-current={isActive(child) ? "page" : undefined}
                className={styles.subItem}
                href={href(child.href)}
                key={child.href}
              >
                {child.label}
              </a>
            ))}
          </div>
        </div>
        <SidebarNavItem active={isActive({ href: "/client/profile", label: "" })} href={href("/client/profile")}>
          {copy.profile}
        </SidebarNavItem>
      </SidebarNav>
      {balanceCents > 0 ? (
        <div className={styles.balanceCard}>
          <Wallet aria-hidden size={20} />
          <strong>{money(balanceCents)}</strong>
          <span>{copy.accountBalance}</span>
        </div>
      ) : null}
      <button className={styles.logoutBtn} onClick={logout} type="button">
        <LogOut aria-hidden size={14} />
        {copy.logout}
      </button>
    </aside>
  );
}
