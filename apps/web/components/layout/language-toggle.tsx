"use client";

import { Languages } from "lucide-react";
import type { Route } from "next";
import { usePathname, useRouter } from "next/navigation";
import { storeLocale } from "../../lib/api";
import type { Locale } from "../../lib/i18n";
import styles from "./site-header.module.css";

export function LanguageToggle({ locale }: { locale: Locale }) {
  const pathname = usePathname();
  const router = useRouter();
  const nextLocale: Locale = locale === "de" ? "en" : "de";

  function switchLocale() {
    storeLocale(nextLocale);
    const nextPath = pathname.replace(/^\/(de|en)(?=\/|$)/, `/${nextLocale}`);
    router.push((nextPath || `/${nextLocale}`) as Route);
    router.refresh();
  }

  return (
    <button className={styles.languageToggle} onClick={switchLocale} type="button" aria-label={locale === "de" ? "Switch to English" : "Zu Deutsch wechseln"}>
      <Languages aria-hidden size={17} />
      <span>{nextLocale.toUpperCase()}</span>
    </button>
  );
}
