"use client";

import Link from "next/link";
import { LogOut, UserRound } from "lucide-react";
import { API_BASE_URL, authToken, clearAuth } from "../../lib/api";
import styles from "./site-header.module.css";
import { useEffect, useState } from "react";
import { MenuLink } from "./menu-link";

/**
 * Storefront/panel account menu. `clientBaseUrl` (Phase 2.3, from /storefront/settings) is where
 * the tenant's client area lives: `https://<apex>/client` for apex-path tenants or the dedicated
 * `https://<clientLabel>.<domain>` origin. When that origin differs from the current one, the
 * logged-in dashboard link routes through /sso/handoff (Phase 2.4) so the session crosses origins
 * via the one-time-code exchange; same-origin stays a plain link. Without the setting the
 * historical relative `/client` link is used (single-tenant/local unchanged).
 */
export function AccountMenu({ clientBaseUrl }: { clientBaseUrl?: string }) {
  const [loggedIn, setLoggedIn] = useState(false);
  const clientHome = clientBaseUrl?.trim() || "/client";

  useEffect(() => {
    const token = authToken("client");
    if (!token) {
      return;
    }
    fetch(`${API_BASE_URL}/users/me`, { headers: { Authorization: `Bearer ${token}` } })
      .then((res) => {
        if (res.ok) {
          setLoggedIn(true);
        } else {
          clearAuth("client");
        }
      })
      .catch(() => undefined);
  }, []);

  if (!loggedIn) {
    return (
      <Link className={styles.clientLogin} href={clientHome as never}>
        <UserRound aria-hidden size={14} />
      </Link>
    );
  }

  // loggedIn only flips after mount, so window is available here and the SSR markup (logged-out
  // icon) never depends on the origin comparison — no hydration mismatch.
  const crossOrigin = (() => {
    try {
      return new URL(clientHome, window.location.href).origin !== window.location.origin;
    } catch {
      return false;
    }
  })();
  const dashboardHref = crossOrigin ? `/sso/handoff?to=${encodeURIComponent(clientHome)}` : clientHome;

  return (
    <details className={styles.accountMenu}>
      <summary>
        <UserRound aria-hidden size={16} />
      </summary>
      <div className={styles.accountDropdown}>
        <MenuLink href={dashboardHref as never}>Dashboard</MenuLink>
        <button
          type="button"
          onClick={() => {
            clearAuth("client");
            window.location.assign("/");
          }}
        >
          <LogOut aria-hidden size={15} />
          Log out
        </button>
      </div>
    </details>
  );
}
