import Link from "next/link";
import type { Route } from "next";
import { ArrowRight, Globe } from "lucide-react";
import type { Locale } from "../../lib/i18n";
import { Button } from "../ui/button";
import styles from "./site-footer.module.css";

export function SiteFooter({ locale }: { locale: Locale }) {
  const isDe = locale === "de";
  const base = `/${locale}`;

  const quickLinks = isDe
    ? [
        { label: "Webhosting", href: `${base}/hosting` },
        { label: "Domains", href: `${base}/domains` },
        { label: "IT-Lösungen", href: `${base}/vps` },
        { label: "Webdesign", href: `${base}/webdesign` },
        { label: "Preisliste", href: `${base}/pricing` },
        { label: "Blog", href: `${base}/blog` },
        { label: "Über uns", href: `${base}/about` },
        { label: "Kontakt", href: `${base}/contact` }
      ]
    : [
        { label: "Web Hosting", href: `${base}/hosting` },
        { label: "Domains", href: `${base}/domains` },
        { label: "IT Solutions", href: `${base}/vps` },
        { label: "Web Design", href: `${base}/webdesign` },
        { label: "Pricing", href: `${base}/pricing` },
        { label: "Blog", href: `${base}/blog` },
        { label: "About", href: `${base}/about` },
        { label: "Contact", href: `${base}/contact` }
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
    <footer className={styles.footer}>
      <div className="container">
        <div className={styles.top}>
          <div className={styles.brand}>
            <div className={styles.brandName}>
              <Globe aria-hidden size={20} />
              <strong>Dezhost</strong>
            </div>
            <p className={styles.mission}>
              {isDe
                ? "Unabhängiges Hosting für Vereine, NGOs, Initiativen und kleine Unternehmen. Persönlich. Transparent. Zuverlässig."
                : "Independent hosting for associations, NGOs, initiatives and small businesses. Personal. Transparent. Reliable."}
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
              <Button href={`${base}/contact` as Route} icon={ArrowRight}>
                {isDe ? "Kostenlos beraten lassen" : "Get free consultation"}
              </Button>
            </div>
          </div>
        </div>

        <div className={styles.bottom}>
          <span>© {new Date().getFullYear()} Dezhost. {isDe ? "Alle Rechte vorbehalten." : "All rights reserved."}</span>
          <span className={styles.tagline}>
            {isDe ? "Hosting mit Haltung. Gemacht in Deutschland." : "Hosting with values. Made in Germany."}
          </span>
        </div>
      </div>
    </footer>
  );
}
