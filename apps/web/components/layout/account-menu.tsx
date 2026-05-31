"use client";

import Link from "next/link";
import { LogOut, UserRound } from "lucide-react";
import { authToken, clearAuth } from "../../lib/api";
import styles from "./site-header.module.css";
import { useEffect, useState } from "react";
import { MenuLink } from "./menu-link";

export function AccountMenu() {
  const [loggedIn, setLoggedIn] = useState(false);

  useEffect(() => {
    if (authToken("admin") || authToken("client")) {
      setLoggedIn(true);
    }
  }, []);

  if (!loggedIn) {
    return (
      <Link className={styles.clientLogin} href="/client">
        <UserRound aria-hidden size={14} />
      </Link>
    );
  }

  return (
    <details className={styles.accountMenu}>
      <summary>
        <UserRound aria-hidden size={16} />
      </summary>
      <div className={styles.accountDropdown}>
        <MenuLink href="/client">Dashboard</MenuLink>
        <button
          type="button"
          onClick={() => {
            clearAuth();
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
