"use client";

import { Menu, X } from "lucide-react";
import { usePathname } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import styles from "./page-shell.module.css";

type PageShellProps = {
  sidebar: ReactNode;
  /** Brand/logo slot at the left of the top bar (all viewports). */
  brand?: ReactNode;
  breadcrumbs?: ReactNode;
  actions?: ReactNode;
  menuLabel: string;
  closeLabel?: string;
  /** Paths rendered without the shell chrome (e.g. the login page living under the same layout). */
  plainPaths?: string[];
  children: ReactNode;
};

/**
 * Dashboard chrome (D1): a full-width sticky top bar (brand, breadcrumbs, actions) with
 * the sidebar starting UNDER it — fixed left column on desktop, overlay drawer with its
 * own close button below 1024px. The content area owns consistent page padding, so pages
 * never touch the viewport edges.
 */
export function PageShell({ sidebar, brand, breadcrumbs, actions, menuLabel, closeLabel, plainPaths, children }: PageShellProps) {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();
  // Match both the internal path (/admin/login) and per-surface hosts where the
  // /admin segment is stripped from the browser path (/login).
  const plain = plainPaths?.some((p) => pathname === p || pathname.endsWith(p)) ?? false;

  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  if (plain) {
    return <>{children}</>;
  }

  return (
    <div className={`${styles.shell}${open ? ` ${styles.open}` : ""}`}>
      <header className={styles.topBar}>
        {brand ? <div className={styles.brandSlot}>{brand}</div> : null}
        <div className={styles.breadcrumbSlot}>{breadcrumbs}</div>
        {actions ? <div className={styles.actions}>{actions}</div> : null}
        <button
          aria-expanded={open}
          aria-label={menuLabel}
          className={styles.hamburger}
          onClick={() => setOpen((v) => !v)}
          type="button"
        >
          <Menu aria-hidden size={17} />
        </button>
      </header>
      {/* Mobile-only breadcrumb row: the top bar is too crowded on phones (brand + locale + logout
          + menu), so below 1024px the crumbs move to their own full-width row under it. Empty on the
          section home (breadcrumbs render null there) — :empty hides the row so no gap appears. */}
      {breadcrumbs ? <div className={styles.mobileCrumbs}>{breadcrumbs}</div> : null}
      <div className={styles.body}>
        <div className={styles.sidebarSlot}>{sidebar}</div>
        <main className={styles.main}>{children}</main>
      </div>
      <div aria-hidden className={styles.backdrop} onClick={() => setOpen(false)} />
      <div className={styles.drawer}>
        <div className={styles.drawerTop}>
          <button
            aria-label={closeLabel ?? menuLabel}
            className={styles.drawerClose}
            onClick={() => setOpen(false)}
            type="button"
          >
            <X aria-hidden size={16} />
          </button>
        </div>
        {sidebar}
      </div>
    </div>
  );
}
