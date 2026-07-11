"use client";

import { useEffect, useState } from "react";
import type { Locale } from "../../lib/i18n";
import { getDictionary } from "../../lib/dictionary";
import { Button } from "../ui/button";
import styles from "./cookie-banner.module.css";

const ACK_KEY = "cookie_ack";

/**
 * Minimal cookie notice: Accept / Settings / Deny all record the choice under
 * one localStorage flag and dismiss — no real consent gating yet. Pure client
 * component with no host assumptions, so it works on apex-path and subdomain
 * tenants alike.
 */
export function CookieBanner({ locale }: { locale: Locale }) {
  const c = getDictionary(locale).common.cookieBanner;
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    try {
      if (!window.localStorage.getItem(ACK_KEY)) {
        setVisible(true);
      }
    } catch {
      setVisible(true);
    }
  }, []);

  if (!visible) {
    return null;
  }

  const dismiss = (choice: "accepted" | "settings" | "denied") => {
    try {
      window.localStorage.setItem(ACK_KEY, choice);
    } catch {
      // storage unavailable — still dismiss for this page view
    }
    setVisible(false);
  };

  return (
    <div aria-label={c.title} className={styles.banner} role="region">
      <p className={styles.message}>{c.message}</p>
      <div className={styles.actions}>
        <Button onClick={() => dismiss("denied")} size="sm" variant="ghost">
          {c.deny}
        </Button>
        <Button onClick={() => dismiss("settings")} size="sm" variant="secondary">
          {c.settings}
        </Button>
        <Button onClick={() => dismiss("accepted")} size="sm">
          {c.accept}
        </Button>
      </div>
    </div>
  );
}
