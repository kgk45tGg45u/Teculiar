"use client";

import { Check, Globe } from "lucide-react";
import type { Route } from "next";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { currentCurrency, persistClientLocale, storeLocale, storeCurrency } from "../../lib/api";
import { getDictionary } from "../../lib/dictionary";
import type { Currency, Locale } from "../../lib/i18n";
import { currencySymbol, languageFlag, languageNativeName } from "../../lib/i18n-catalog";
import { LOCALE_PATH_PREFIX, SUPPORTED_LOCALES } from "../../lib/supported-locales";
import { Modal } from "../ui/modal";
import styles from "./site-header.module.css";

/**
 * A single button that opens a modal where language and currency are chosen as two separate lists,
 * so the two-axis nature is obvious. Built from the configured lists, so adding a language/currency
 * never causes a combinatorial blow-up. The whole control is hidden when a single language AND a
 * single currency are configured; each section hides on its own when only one option exists.
 */
export function LanguageToggle({ locale, languages = SUPPORTED_LOCALES, currencies = ["EUR", "USD"] }: { locale: Locale; languages?: string[]; currencies?: string[] }) {
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [currency, setCurrency] = useState<Currency>(() => currencies[0] ?? "EUR");
  const [open, setOpen] = useState(false);
  const copy = getDictionary(locale).common.preferences;

  useEffect(() => {
    setCurrency(currentCurrency());
  }, []);

  const showLanguages = languages.length > 1;
  const showCurrencies = currencies.length > 1;
  if (!showLanguages && !showCurrencies) {
    return null;
  }

  function selectLanguage(newLocale: Locale) {
    storeLocale(newLocale);
    // Save the explicit choice to the account immediately (no-op for guests/admin).
    persistClientLocale(newLocale);
    setOpen(false);
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
    storeCurrency(newCurrency);
    setCurrency(newCurrency);
    setOpen(false);
    router.refresh();
  }

  const summary = [showLanguages ? locale.toUpperCase() : null, showCurrencies ? currencySymbol(currency) : null]
    .filter(Boolean)
    .join(" · ");

  return (
    <>
      <button
        aria-haspopup="dialog"
        className={styles.languageToggle}
        onClick={() => setOpen(true)}
        title={copy.open}
        type="button"
      >
        <Globe aria-hidden size={14} />
        <span>{summary}</span>
      </button>
      <Modal closeLabel={copy.close} onClose={() => setOpen(false)} open={open} title={copy.title}>
        {showLanguages ? (
          <section className={styles.prefsSection}>
            <span className={styles.prefsSectionLabel}>{copy.language}</span>
            <div className={styles.prefsGrid}>
              {languages.map((code) => (
                <button
                  className={`${styles.prefsOption}${locale === code ? ` ${styles.prefsOptionActive}` : ""}`}
                  key={`lang:${code}`}
                  onClick={() => selectLanguage(code)}
                  type="button"
                >
                  <span>{languageFlag(code)} {languageNativeName(code)}</span>
                  {locale === code ? <Check aria-hidden size={15} /> : null}
                </button>
              ))}
            </div>
          </section>
        ) : null}
        {showCurrencies ? (
          <section className={styles.prefsSection}>
            <span className={styles.prefsSectionLabel}>{copy.currency}</span>
            <div className={styles.prefsGrid}>
              {currencies.map((code) => (
                <button
                  className={`${styles.prefsOption}${currency === code ? ` ${styles.prefsOptionActive}` : ""}`}
                  key={`cur:${code}`}
                  onClick={() => selectCurrency(code)}
                  type="button"
                >
                  <span>{currencySymbol(code)} {code}</span>
                  {currency === code ? <Check aria-hidden size={15} /> : null}
                </button>
              ))}
            </div>
          </section>
        ) : null}
      </Modal>
    </>
  );
}
