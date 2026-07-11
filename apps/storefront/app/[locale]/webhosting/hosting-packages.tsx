"use client";

import { ArrowRight, Check } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { cycleLabel, money, type ApiProduct } from "@dezhost/web-core/lib/api";
import { featuredCardClass, PopularBadge } from "@dezhost/web-core/components/marketing/popular-badge";
import type { Locale } from "@dezhost/web-core/lib/i18n";
import styles from "./webhosting.module.css";

export function HostingPackages({ isDe, locale, products }: { isDe: boolean; locale: string; products: ApiProduct[] }) {
  const [cycle, setCycle] = useState<"MONTHLY" | "YEAR_1">("MONTHLY");

  return (
    <section className={`section tight ${styles.packagesSection}`}>
      <div className="container">
        <div className={styles.packageHeader}>
          <div>
            <span className="eyebrow">{isDe ? "Hosting-Pakete" : "Hosting packages"}</span>
            <h2 className={styles.sectionTitle}>
              {isDe ? "Wähle das Paket, das zu dir passt." : "Choose the package that fits you."}
            </h2>
          </div>
          <div className={styles.billingToggle} role="group" aria-label={isDe ? "Abrechnung" : "Billing"}>
            <button className={cycle === "MONTHLY" ? styles.toggleActive : ""} type="button" onClick={() => setCycle("MONTHLY")}>
              {isDe ? "Monatlich" : "Monthly"}
            </button>
            <button className={cycle === "YEAR_1" ? styles.toggleActive : ""} type="button" onClick={() => setCycle("YEAR_1")}>
              {isDe ? "Jährlich" : "Yearly"}
            </button>
          </div>
        </div>
        <div className={styles.packageGrid}>
          {products.map((product) => {
            const price = selectedPrice(product, cycle);
            const setupFee = price?.setupFeeCents ?? 0;
            const specs = (product.configs ?? [])
              .filter((c) => !c.key.startsWith("virtualmin_"))
              .slice(0, 5);
            const isFeatured = product.featured === true;
            return (
              <div
                className={`${styles.packageCard} ${isFeatured ? featuredCardClass : ""}`}
                key={product.id}
              >
                {isFeatured && <PopularBadge locale={locale as Locale} />}
                <h3>{product.name}</h3>
                {price ? (
                  <div className={styles.packagePrice}>
                    <strong suppressHydrationWarning>{money(price.amountCents, price.currency, locale as Locale)}</strong>
                    <span>/ {periodLabel(price.billingCycle, isDe)}</span>
                  </div>
                ) : null}
                {setupFee > 0 && price ? (
                  <div className={styles.setupFee} suppressHydrationWarning>
                    {isDe ? "Einrichtung" : "Setup"}: {money(setupFee, price.currency, locale as Locale)}
                  </div>
                ) : (
                  <div className={styles.setupFree}>{isDe ? "Keine Einrichtungsgebühr" : "No setup fee"}</div>
                )}
                <p className={styles.packageDesc}>{product.description}</p>
                {specs.length > 0 && (
                  <ul className={styles.packageFeatures}>
                    {specs.map((spec) => (
                      <li key={spec.key}>
                        <Check aria-hidden size={13} />
                        {spec.label}{spec.values[0] ? `: ${String(spec.values[0])}` : ""}
                      </li>
                    ))}
                  </ul>
                )}
                <Link className={styles.packageCta} href={`/${locale}/order/${product.id}`}>
                  {isDe ? "Jetzt bestellen" : "Order now"}
                  <ArrowRight aria-hidden size={18} />
                </Link>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}

function selectedPrice(product: ApiProduct, cycle: "MONTHLY" | "YEAR_1") {
  const desired = product.prices.find((price) => price.billingCycle === cycle);
  if (desired) {
    return desired;
  }
  return product.prices.find((price) => price.billingCycle === "MONTHLY") ?? product.prices.find((price) => price.billingCycle === "YEAR_1") ?? product.prices[0];
}

function periodLabel(cycle: string, isDe: boolean) {
  if (cycle === "MONTHLY") {
    return isDe ? "Monat" : "month";
  }
  if (cycle === "YEAR_1") {
    return isDe ? "Jahr" : "year";
  }
  return cycleLabel(cycle);
}
