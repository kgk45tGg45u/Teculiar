import Link from "next/link";
import type { Route } from "next";
import { ArrowRight, Globe } from "lucide-react";
import type { Locale } from "../../lib/i18n";
import { Button } from "../ui/button";
import styles from "./site-footer.module.css";

export function SiteFooter({ brandLogo, locale, variant = "site" }: { brandLogo?: string; locale: Locale; variant?: "site" | "admin" }) {
  const isDe = locale === "de";
  const isPanel = variant === "admin";
  const brandLabel = isPanel ? "Teculiar" : "Dezhost";
  const base = `/${locale}`;

  const quickLinks = isDe
    ? [
        { label: "Webhosting", href: `${base}/webhosting` },
        { label: "Domains", href: `${base}/domains` },
        { label: "IT-Lösungen", href: `${base}/it-losungen` },
        { label: "Webdesign", href: `${base}/webdesign` },
        { label: "Blog", href: `${base}/blog` },
        { label: "Über uns", href: `${base}/uber-uns` },
        { label: "Kontakt", href: `${base}/kontakt` }
      ]
    : [
        { label: "Web Hosting", href: `${base}/webhosting` },
        { label: "Domains", href: `${base}/domains` },
        { label: "IT Solutions", href: `${base}/it-losungen` },
        { label: "Web Design", href: `${base}/webdesign` },
        { label: "Blog", href: `${base}/blog` },
        { label: "About", href: `${base}/uber-uns` },
        { label: "Contact", href: `${base}/kontakt` }
      ];

  const legalLinks = isDe
    ? [
        { label: "Impressum", href: `${base}/legal/impressum` },
        { label: "Datenschutz", href: `${base}/legal/datenschutz` },
        { label: "AGB", href: `${base}/legal/agb` },
        { label: "Zahlungsinformationen", href: `${base}/legal/zahlung` },
        { label: "Widerrufsbelehrung", href: `${base}/legal/widerruf` }
      ]
    : [
        { label: "Legal Notice", href: `${base}/legal/impressum` },
        { label: "Privacy Policy", href: `${base}/legal/datenschutz` },
        { label: "Terms", href: `${base}/legal/agb` },
        { label: "Payment Info", href: `${base}/legal/zahlung` },
        { label: "Cancellation", href: `${base}/legal/widerruf` }
      ];

  return (
    <footer className={`${styles.footer}${variant === "admin" ? ` ${styles.footerWide}` : ""}`}>
      <div className={styles.inner}>
        <div className={styles.top}>
          <div className={styles.brand}>
            <div className={styles.brandName}>
              {!isPanel && brandLogo ? <img alt={brandLabel} className={styles.brandLogo} src={brandLogo} /> : <><Globe aria-hidden size={20} /><strong>{brandLabel}</strong></>}
            </div>
            <p className={styles.mission}>
              {isPanel
                ? isDe
                  ? "Billing- und Automatisierungspanel für Dezhost Dienste."
                  : "Billing and automation panel for Dezhost services."
                : isDe
                ? "Sicheres Hosting für Vereine, NGOs, Initiativen und kleine Unternehmen. Persönlich. Transparent. Zuverlässig."
                : "Secure hosting for associations, NGOs, initiatives and small businesses. Personal. Transparent. Reliable."}
            </p>
            <div className={styles.contact}>
              <span>kontakt@dezhost.de</span>
            </div>
          </div>

          <div className={styles.links}>
            <div>
              <h4>{isDe ? "Angebote" : "Services"}</h4>
              <nav>
                {quickLinks.map((link) => (
                  <Link href={link.href as Route} key={link.label}>
                    {link.label}
                  </Link>
                ))}
              </nav>
            </div>
            <div>
              <h4>{isDe ? "Rechtliches" : "Legal"}</h4>
              <nav>
                {legalLinks.map((link) => (
                  <Link href={link.href as Route} key={link.label}>
                    {link.label}
                  </Link>
                ))}
              </nav>
            </div>
            <div className={styles.ctaBlock}>
              <h4>{isDe ? "Noch unsicher?" : "Not sure yet?"}</h4>
              <p>
                {isDe
                  ? "Wir erklären alles Schritt für Schritt. Kostenlos und ohne Verpflichtung."
                  : "We explain everything step by step. Free and without obligation."}
              </p>
              <Button href={`${base}/kontakt` as Route} icon={ArrowRight}>
                {isDe ? "Jetzt beraten lassen" : "Get consultation"}
              </Button>
            </div>
          </div>
        </div>

        <div className={styles.bottom}>
          <span>© {new Date().getFullYear()} {brandLabel}. {isDe ? "Alle Rechte vorbehalten." : "All rights reserved."}</span>
          <span className={styles.tagline}>
            {isPanel
              ? isDe
                ? "Automation für Dezhost Hosting."
                : "Automation for Dezhost hosting."
              : isDe
                ? "Hosting mit Haltung. Gemacht in Deutschland."
                : "Hosting with values. Made in Germany."}
          </span>
        </div>
      </div>
    </footer>
  );
}
