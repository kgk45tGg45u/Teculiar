"use client";

import { ChevronDown } from "lucide-react";
import type { Route } from "next";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
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
  const [currency, setCurrency] = useState<Currency>(() => currentCurrency());

  function onChange(event: React.ChangeEvent<HTMLSelectElement>) {
    const [newLocale, newCurrency] = event.target.value.split(":") as [Locale, Currency];
    storeLocale(newLocale);
    storeCurrency(newCurrency);
    setCurrency(newCurrency);
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
    <span className={styles.languageDropdown}>
      <span className={styles.languageLabel}>
        {localeFlags[locale]} {locale.toUpperCase()} · {currencySymbols[currency]}
      </span>
      <ChevronDown aria-hidden size={13} />
      <select
        aria-label="Language and currency"
        className={styles.languageSelect}
        value={`${locale}:${currency}`}
        onChange={onChange}
      >
        {COMBOS.map(({ locale: l, currency: c }) => (
          <option key={`${l}:${c}`} value={`${l}:${c}`}>
            {localeFlags[l]} {l.toUpperCase()} · {currencySymbols[c]}
          </option>
        ))}
      </select>
    </span>
  );
}
