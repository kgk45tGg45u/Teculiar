"use client";

import { Check, Globe } from "lucide-react";
import type { Route } from "next";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import { currentCurrency, persistClientLocale, storeLocale, storeCurrency } from "../../lib/api";
import { useCurrency } from "../../lib/use-prefs";
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
  // Reactive: stays in sync on toggle, browser back/forward and bfcache restore, so the button never
  // shows a stale currency while the page's <Price>s show another.
  const currency = useCurrency(currencies[0] ?? "EUR");
  const [open, setOpen] = useState(false);
  // Pending (unsaved) selections — language and currency are picked together and committed on Apply.
  const [draftLocale, setDraftLocale] = useState<Locale>(locale);
  const [draftCurrency, setDraftCurrency] = useState<Currency>(currencies[0] ?? "EUR");
  const copy = getDictionary(locale).common.preferences;

  const showLanguages = languages.length > 1;
  const showCurrencies = currencies.length > 1;
  if (!showLanguages && !showCurrencies) {
    return null;
  }

  function openModal() {
    // Seed the drafts from the live preferences each time the modal opens.
    setDraftLocale(locale);
    setDraftCurrency(currentCurrency());
    setOpen(true);
  }

  function apply() {
    const localeChanged = draftLocale !== locale;
    const currencyChanged = draftCurrency !== currency;
    if (currencyChanged) {
      // storeCurrency fires the prefs-changed event, so useCurrency() updates the button live.
      storeCurrency(draftCurrency);
    }
    if (localeChanged) {
      storeLocale(draftLocale);
      // Save the explicit choice to the account (no-op for guests/admin).
      persistClientLocale(draftLocale);
    }
    setOpen(false);
    if (localeChanged) {
      // A language change navigates to the new locale path, which re-renders with the new
      // currency cookie too, so it also covers a simultaneous currency change.
      if (LOCALE_PATH_PREFIX.test(pathname)) {
        const nextPath = pathname.replace(LOCALE_PATH_PREFIX, `/${draftLocale}`);
        const qs = searchParams.toString();
        router.push(`${nextPath}${qs ? `?${qs}` : ""}` as Route);
      } else {
        window.location.reload();
      }
    } else if (currencyChanged) {
      router.refresh();
    }
  }

  const summary = [showLanguages ? locale.toUpperCase() : null, showCurrencies ? currencySymbol(currency) : null]
    .filter(Boolean)
    .join(" · ");

  return (
    <>
      <button
        aria-haspopup="dialog"
        className={styles.languageToggle}
        onClick={openModal}
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
                  className={`${styles.prefsOption}${draftLocale === code ? ` ${styles.prefsOptionActive}` : ""}`}
                  key={`lang:${code}`}
                  onClick={() => setDraftLocale(code)}
                  type="button"
                >
                  <span>{languageFlag(code)} {languageNativeName(code)}</span>
                  {draftLocale === code ? <Check aria-hidden size={15} /> : null}
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
                  className={`${styles.prefsOption}${draftCurrency === code ? ` ${styles.prefsOptionActive}` : ""}`}
                  key={`cur:${code}`}
                  onClick={() => setDraftCurrency(code)}
                  type="button"
                >
                  <span>{currencySymbol(code)} {code}</span>
                  {draftCurrency === code ? <Check aria-hidden size={15} /> : null}
                </button>
              ))}
            </div>
          </section>
        ) : null}
        <div className={styles.prefsFooter}>
          <button className={styles.prefsApply} onClick={apply} type="button">
            {copy.apply}
          </button>
        </div>
      </Modal>
    </>
  );
}
