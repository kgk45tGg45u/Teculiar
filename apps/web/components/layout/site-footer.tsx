import Link from "next/link";
import type { Route } from "next";
import { ArrowRight, Globe } from "lucide-react";
import type { Locale } from "../../lib/i18n";
import { getDictionary } from "../../lib/dictionary";
import { Button } from "../ui/button";
import styles from "./site-footer.module.css";

export function SiteFooter({ brandLogo, locale, variant = "site" }: { brandLogo?: string; locale: Locale; variant?: "site" | "admin" }) {
  const f = getDictionary(locale).storefront.footer;
  const isPanel = variant === "admin";
  const brandLabel = isPanel ? "Teculiar" : "Dezhost";
  const base = `/${locale}`;

  const quickLinks = [
    { label: f.links.webhosting, href: `${base}/webhosting` },
    { label: f.links.vps, href: `${base}/virtual-servers` },
    { label: f.links.reseller, href: `${base}/reseller` },
    { label: f.links.domains, href: `${base}/domains` },
    { label: f.links.itSolutions, href: `${base}/it-losungen` },
    { label: f.links.webdesign, href: `${base}/webdesign` },
    { label: f.links.blog, href: `${base}/blog` },
    { label: f.links.about, href: `${base}/uber-uns` },
    { label: f.links.contact, href: `${base}/kontakt` }
  ];

  const legalLinks = [
    { label: f.legal.impressum, href: `${base}/legal/impressum` },
    { label: f.legal.datenschutz, href: `${base}/legal/datenschutz` },
    { label: f.legal.agb, href: `${base}/legal/agb` },
    { label: f.legal.zahlung, href: `${base}/legal/zahlung` },
    { label: f.legal.widerruf, href: `${base}/legal/widerruf` }
  ];

  return (
    <footer className={`${styles.footer}${variant === "admin" ? ` ${styles.footerWide}` : ""}`}>
      <div className={styles.inner}>
        <div className={styles.top}>
          <div className={styles.brand}>
            <div className={styles.brandName}>
              {!isPanel && brandLogo ? <img alt={brandLabel} className={styles.brandLogo} src={brandLogo} /> : <><Globe aria-hidden size={20} /><strong>{brandLabel}</strong></>}
            </div>
            <p className={styles.mission}>{isPanel ? f.missionPanel : f.mission}</p>
            <div className={styles.contact}>
              <span>sales@dezhost.com</span>
            </div>
          </div>

          <div className={styles.links}>
            <div>
              <h4>{f.servicesHeading}</h4>
              <nav>
                {quickLinks.map((link) => (
                  <Link href={link.href as Route} key={link.label}>
                    {link.label}
                  </Link>
                ))}
              </nav>
            </div>
            <div>
              <h4>{f.legalHeading}</h4>
              <nav>
                {legalLinks.map((link) => (
                  <Link href={link.href as Route} key={link.label}>
                    {link.label}
                  </Link>
                ))}
              </nav>
            </div>
            <div className={styles.ctaBlock}>
              <h4>{f.ctaHeading}</h4>
              <p>{f.ctaText}</p>
              <Button href={`${base}/kontakt` as Route} icon={ArrowRight}>
                {f.ctaButton}
              </Button>
            </div>
          </div>
        </div>

        <div className={styles.bottom}>
          <span>© {new Date().getFullYear()} {brandLabel}. {f.rightsReserved}</span>
          <span className={styles.tagline}>{isPanel ? f.taglinePanel : f.tagline}</span>
        </div>
      </div>
    </footer>
  );
}
