"use client";

import Link from "next/link";
import { ChevronDown, LogOut, UserRound } from "lucide-react";
import { authToken, clearAuth } from "../../lib/api";
import styles from "./site-header.module.css";
import { useEffect, useState } from "react";

export function AccountMenu({ clientLabel }: { clientLabel: string }) {
  const [dashboard, setDashboard] = useState<"/admin" | "/client">();

  useEffect(() => {
    if (authToken("admin")) {
      setDashboard("/admin");
      return;
    }
    if (authToken("client")) {
      setDashboard("/client");
    }
  }, []);

  if (!dashboard) {
    return (
      <Link className={styles.clientLogin} href="/client">
        {clientLabel}
        <UserRound aria-hidden size={14} />
      </Link>
    );
  }

  return (
    <details className={styles.accountMenu}>
      <summary>
        <UserRound aria-hidden size={16} />
        <span>Konto</span>
        <ChevronDown aria-hidden size={14} />
      </summary>
      <div className={styles.accountDropdown}>
        <Link href={dashboard}>Dashboard</Link>
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
