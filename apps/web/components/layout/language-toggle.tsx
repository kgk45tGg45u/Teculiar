"use client";

import { ChevronDown } from "lucide-react";
import type { Route } from "next";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { currentCurrency, storeLocale, storeCurrency } from "../../lib/api";
import { currencySymbols, localeFlags, type Currency, type Locale } from "../../lib/i18n";
import styles from "./site-header.module.css";

const COMBOS: Array<{ locale: Locale; currency: Currency }> = [
  { locale: "de", currency: "EUR" },
  { locale: "de", currency: "USD" },
  { locale: "en", currency: "EUR" },
  { locale: "en", currency: "USD" }
];

export function LanguageToggle({ locale }: { locale: Locale }) {
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [currency, setCurrency] = useState<Currency>(() => locale === "en" ? "USD" : "EUR");
  const detailsRef = useRef<HTMLDetailsElement>(null);

  useEffect(() => {
    setCurrency(currentCurrency());
  }, []);

  function selectCombo(newLocale: Locale, newCurrency: Currency) {
    storeLocale(newLocale);
    storeCurrency(newCurrency);
    setCurrency(newCurrency);
    if (detailsRef.current) detailsRef.current.open = false;
    const localeChanged = newLocale !== locale;
    if (/^\/(de|en)(\/|$)/.test(pathname)) {
      if (localeChanged) {
        const nextPath = pathname.replace(/^\/(de|en)/, `/${newLocale}`);
        const qs = searchParams.toString();
        router.push(`${nextPath}${qs ? `?${qs}` : ""}` as Route);
      } else {
        router.refresh();
      }
    } else {
      window.location.reload();
    }
  }

  return (
    <details ref={detailsRef} className={styles.languageDropdown}>
      <summary className={styles.languageToggle}>
        <span>{localeFlags[locale]} {locale.toUpperCase()} · {currencySymbols[currency]}</span>
        <ChevronDown aria-hidden size={13} className={styles.languageChevron} />
      </summary>
      <div className={styles.languageDropdownMenu}>
        {COMBOS.map(({ locale: l, currency: c }) => (
          <button
            key={`${l}:${c}`}
            type="button"
            className={`${styles.languageOption}${locale === l && currency === c ? ` ${styles.languageOptionActive}` : ""}`}
            onClick={() => selectCombo(l, c)}
          >
            {localeFlags[l]} {l.toUpperCase()} · {currencySymbols[c]}
          </button>
        ))}
      </div>
    </details>
  );
}
