"use client";

import { ChevronDown } from "lucide-react";
import type { Route } from "next";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { currentCurrency, persistClientLocale, storeLocale, storeCurrency } from "../../lib/api";
import type { Currency, Locale } from "../../lib/i18n";
import { currencySymbol, languageFlag, languageNativeName } from "../../lib/i18n-catalog";
import { LOCALE_PATH_PREFIX, SUPPORTED_LOCALES } from "../../lib/supported-locales";
import styles from "./site-header.module.css";

/**
 * Two grouped selectors (languages and currencies) built from the configured lists, so adding
 * a language/currency never causes a combinatorial blow-up. The whole toggle is hidden when a
 * single language AND a single currency are configured; each selector hides on its own when
 * only one option exists.
 */
export function LanguageToggle({ locale, languages = SUPPORTED_LOCALES, currencies = ["EUR", "USD"] }: { locale: Locale; languages?: string[]; currencies?: string[] }) {
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [currency, setCurrency] = useState<Currency>(() => currencies[0] ?? "EUR");
  const detailsRef = useRef<HTMLDetailsElement>(null);

  useEffect(() => {
    setCurrency(currentCurrency());
  }, []);

  const showLanguages = languages.length > 1;
  const showCurrencies = currencies.length > 1;
  if (!showLanguages && !showCurrencies) {
    return null;
  }

  function close() {
    if (detailsRef.current) detailsRef.current.open = false;
  }

  function selectLanguage(newLocale: Locale) {
    close();
    storeLocale(newLocale);
    // Save the explicit choice to the account immediately (no-op for guests/admin).
    persistClientLocale(newLocale);
    if (newLocale === locale) {
      return;
    }
    if (LOCALE_PATH_PREFIX.test(pathname)) {
      const nextPath = pathname.replace(LOCALE_PATH_PREFIX, `/${newLocale}`);
      const qs = searchParams.toString();
      router.push(`${nextPath}${qs ? `?${qs}` : ""}` as Route);
    } else {
      window.location.reload();
    }
  }

  function selectCurrency(newCurrency: Currency) {
    close();
    storeCurrency(newCurrency);
    setCurrency(newCurrency);
    router.refresh();
  }

  const summary = [showLanguages ? locale.toUpperCase() : null, showCurrencies ? currencySymbol(currency) : null]
    .filter(Boolean)
    .join(" · ");

  return (
    <details ref={detailsRef} className={styles.languageDropdown}>
      <summary className={styles.languageToggle}>
        <span>{summary}</span>
        <ChevronDown aria-hidden size={13} className={styles.languageChevron} />
      </summary>
      <div className={styles.languageDropdownMenu}>
        {showLanguages && languages.map((code) => (
          <button
            key={`lang:${code}`}
            type="button"
            className={`${styles.languageOption}${locale === code ? ` ${styles.languageOptionActive}` : ""}`}
            onClick={() => selectLanguage(code)}
          >
            {languageFlag(code)} {languageNativeName(code)}
          </button>
        ))}
        {showCurrencies && currencies.map((code) => (
          <button
            key={`cur:${code}`}
            type="button"
            className={`${styles.languageOption}${currency === code ? ` ${styles.languageOptionActive}` : ""}`}
            onClick={() => selectCurrency(code)}
          >
            {currencySymbol(code)} {code}
          </button>
        ))}
      </div>
    </details>
  );
}
