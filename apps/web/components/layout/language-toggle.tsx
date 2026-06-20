"use client";

import { ChevronDown } from "lucide-react";
import type { Route } from "next";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { currentCurrency, storeLocale, storeCurrency } from "../../lib/api";
import { currencies, currencySymbols, localeNames, type Currency, type Locale } from "../../lib/i18n";
import { LOCALE_PATH_PREFIX, SUPPORTED_LOCALES } from "../../lib/supported-locales";
import styles from "./site-header.module.css";

// Cartesian product of the configured languages and currencies. The grouped-selector
// redesign + hide-when-single behaviour lands with the admin settings work.
const COMBOS: Array<{ locale: Locale; currency: Currency }> = SUPPORTED_LOCALES.flatMap(
  (locale) => currencies.map((currency) => ({ locale, currency }))
);

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
    if (LOCALE_PATH_PREFIX.test(pathname)) {
      if (localeChanged) {
        const nextPath = pathname.replace(LOCALE_PATH_PREFIX, `/${newLocale}`);
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
        <span>{locale.toUpperCase()} · {currencySymbols[currency] ?? currency}</span>
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
            {localeNames[l] ?? l} · {currencySymbols[c] ?? c}
          </button>
        ))}
      </div>
    </details>
  );
}
