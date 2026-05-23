"use client";

import { ArrowRight } from "lucide-react";
import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { Button } from "../../../../components/ui/button";
import { API_BASE_URL, money, type ApiDomainPrice } from "../../../../lib/api";
import type { Locale } from "../../../../lib/i18n";
import styles from "./domain-pricing.module.css";

type Tab = "register" | "renew" | "transfer";

export default function DomainPricingPage() {
  const [prices, setPrices] = useState<ApiDomainPrice[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<Tab>("register");
  const pathname = usePathname();
  const locale: Locale = pathname.startsWith("/en") ? "en" : "de";
  const isDe = locale === "de";

  useEffect(() => {
    fetch(`${API_BASE_URL}/storefront/domain-prices`)
      .then((r) => r.ok ? r.json() : [])
      .then((data: ApiDomainPrice[]) => {
        setPrices(Array.isArray(data) ? data.filter((price) => price.amountCents > 0) : []);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  // Group by TLD, then by action, then by years
  const byTld = prices.reduce<Record<string, Record<string, Record<number, ApiDomainPrice>>>>((acc, p) => {
    const tldEntry = acc[p.tld] ?? {};
    const actionEntry = tldEntry[p.action] ?? {};
    actionEntry[p.years] = p;
    tldEntry[p.action] = actionEntry;
    acc[p.tld] = tldEntry;
    return acc;
  }, {});

  const currentAction = tab === "register" ? "register" : tab === "renew" ? "renew" : "transfer";

  // Get all TLDs that have prices for the current tab
  const tlds = Object.keys(byTld)
    .filter((tld) => {
      const entry = byTld[tld];
      return entry !== undefined && entry[currentAction] !== undefined && Object.keys(entry[currentAction] as object).length > 0;
    })
    .sort();

  // Get all year columns for current tab
  const allYears = Array.from(
    new Set(
      tlds.flatMap((tld) => {
        const entry = byTld[tld]?.[currentAction];
        return entry ? Object.keys(entry).map(Number) : [];
      })
    )
  ).sort((a, b) => a - b);

  return (
    <>
      <section className={styles.hero}>
        <div className="container">
          <span className="eyebrow">Domains</span>
          <h1>{isDe ? "Domain-Preisliste" : "Domain Pricing"}</h1>
          <p>
            {isDe
              ? "Alle Preise werden direkt aus unserem System geladen. Preise zzgl. 19% MwSt."
              : "All prices are loaded directly from our system. Prices excl. 19% VAT."}
          </p>
        </div>
      </section>

      <section className="section tight">
        <div className="container">
          <div className={styles.tabs}>
            <button
              className={`${styles.tab} ${tab === "register" ? styles.active : ""}`}
              onClick={() => setTab("register")}
              type="button"
            >
              {isDe ? "Neuregistrierung" : "Registration"}
            </button>
            <button
              className={`${styles.tab} ${tab === "renew" ? styles.active : ""}`}
              onClick={() => setTab("renew")}
              type="button"
            >
              {isDe ? "Verlängerung" : "Renewal"}
            </button>
            <button
              className={`${styles.tab} ${tab === "transfer" ? styles.active : ""}`}
              onClick={() => setTab("transfer")}
              type="button"
            >
              Transfer
            </button>
          </div>

          {loading ? (
            <div className={styles.loading}>
              <span>{isDe ? "Preise werden geladen…" : "Loading prices…"}</span>
            </div>
          ) : tlds.length === 0 ? (
            <div className={styles.empty}>
              <p>
                {isDe
                  ? "Für diese Kategorie sind noch keine Preise hinterlegt."
                  : "No prices available for this category yet."}
              </p>
            </div>
          ) : (
            <div className={styles.tableWrap}>
              <table className={styles.table}>
                <thead>
                  <tr>
                    <th>Domain</th>
                    {allYears.map((y) => (
                      <th key={y}>
                        {y} {isDe ? (y === 1 ? "Jahr" : "Jahre") : y === 1 ? "year" : "years"}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {tlds.map((tld) => (
                    <tr key={tld}>
                      <td className={styles.tldCell}><strong>{tld}</strong></td>
                      {allYears.map((y) => {
                        const p = byTld[tld]?.[currentAction]?.[y];
                        return (
                          <td key={y} className={styles.priceCell}>
                            {p ? money(p.amountCents, p.currency, locale) : <span className={styles.na}>–</span>}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <div className={styles.cta}>
            <p>{isDe ? "Alle Preise zzgl. 19% MwSt. Preise können sich ändern." : "All prices excl. 19% VAT. Prices may change."}</p>
            <Button href={`/${locale}/domains`} icon={ArrowRight}>
              {isDe ? "Domain registrieren" : "Register a domain"}
            </Button>
          </div>
        </div>
      </section>
    </>
  );
}
