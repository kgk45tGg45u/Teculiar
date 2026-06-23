import Link from "next/link";
import type { Route } from "next";
import { ArrowRight, Globe } from "lucide-react";
import type { Locale } from "../../lib/i18n";
import { getDictionary } from "../../lib/dictionary";
import { flattenLinks, footerText, type NavNode, type StorefrontTheme, toNav } from "../../lib/storefront-theme";
import { Button } from "../ui/button";
import styles from "./site-footer.module.css";

export function SiteFooter({ brandLogo, locale, variant = "site", theme }: { brandLogo?: string; locale: Locale; variant?: "site" | "admin"; theme?: StorefrontTheme | null }) {
  const f = getDictionary(locale).storefront.footer;
  const isPanel = variant === "admin";
  const brandLabel = isPanel ? "Teculiar" : "Dezhost";
  const base = `/${locale}`;
  const mainLocale = theme?.languages?.[0] ?? locale;
  const footer = theme?.footer ?? null;

  const leaf = (label: string, path: string): NavNode => ({ label, href: `${base}/${path}`, newTab: false, children: [] });
  const quickLinks: NavNode[] = theme?.menus?.main?.length
    ? flattenLinks(theme.menus.main, locale, mainLocale)
    : [
        leaf(f.links.webhosting, "webhosting"),
        leaf(f.links.vps, "virtual-servers"),
        leaf(f.links.reseller, "reseller"),
        leaf(f.links.domains, "domains"),
        leaf(f.links.itSolutions, "it-losungen"),
        leaf(f.links.webdesign, "webdesign"),
        leaf(f.links.blog, "blog"),
        leaf(f.links.about, "uber-uns"),
        leaf(f.links.contact, "kontakt")
      ];
  const legalLinks: NavNode[] = theme?.menus?.legal?.length
    ? toNav(theme.menus.legal, locale, mainLocale)
    : [
        leaf(f.legal.impressum, "legal/impressum"),
        leaf(f.legal.datenschutz, "legal/datenschutz"),
        leaf(f.legal.agb, "legal/agb"),
        leaf(f.legal.zahlung, "legal/zahlung"),
        leaf(f.legal.widerruf, "legal/widerruf")
      ];

  const mission = isPanel ? f.missionPanel : footerText(footer, "mission", locale, mainLocale, f.mission);
  const servicesHeading = footerText(footer, "servicesHeading", locale, mainLocale, f.servicesHeading);
  const legalHeading = footerText(footer, "legalHeading", locale, mainLocale, f.legalHeading);
  const ctaHeading = footerText(footer, "ctaHeading", locale, mainLocale, f.ctaHeading);
  const ctaText = footerText(footer, "ctaText", locale, mainLocale, f.ctaText);
  const ctaButton = footerText(footer, "ctaButton", locale, mainLocale, f.ctaButton);
  const rightsReserved = footerText(footer, "rightsReserved", locale, mainLocale, f.rightsReserved);
  const tagline = isPanel ? f.taglinePanel : footerText(footer, "tagline", locale, mainLocale, f.tagline);
  const contactEmail = (footer && typeof footer.contactEmail === "string" && footer.contactEmail) || "sales@dezhost.com";
  const ctaHrefRaw = (footer && typeof footer.ctaHref === "string" && footer.ctaHref) || "/kontakt";

  return (
    <footer className={`${styles.footer}${variant === "admin" ? ` ${styles.footerWide}` : ""}`}>
      <div className={styles.inner}>
        <div className={styles.top}>
          <div className={styles.brand}>
            <div className={styles.brandName}>
              {!isPanel && brandLogo ? <img alt={brandLabel} className={styles.brandLogo} src={brandLogo} /> : <><Globe aria-hidden size={20} /><strong>{brandLabel}</strong></>}
            </div>
            <p className={styles.mission}>{mission}</p>
            <div className={styles.contact}>
              <span>{contactEmail}</span>
            </div>
          </div>

          <div className={styles.links}>
            <div>
              <h4>{servicesHeading}</h4>
              <nav>
                {quickLinks.map((link) => (
                  <Link href={(link.href ?? base) as Route} key={link.href ?? link.label} target={link.newTab ? "_blank" : undefined}>
                    {link.label}
                  </Link>
                ))}
              </nav>
            </div>
            <div>
              <h4>{legalHeading}</h4>
              <nav>
                {legalLinks.map((link) => (
                  <Link href={(link.href ?? base) as Route} key={link.href ?? link.label} target={link.newTab ? "_blank" : undefined}>
                    {link.label}
                  </Link>
                ))}
              </nav>
            </div>
            <div className={styles.ctaBlock}>
              <h4>{ctaHeading}</h4>
              <p>{ctaText}</p>
              <Button href={`${base}${ctaHrefRaw}` as Route} icon={ArrowRight}>
                {ctaButton}
              </Button>
            </div>
          </div>
        </div>

        <div className={styles.bottom}>
          <span>© {new Date().getFullYear()} {brandLabel}. {rightsReserved}</span>
          <span className={styles.tagline}>{tagline}</span>
        </div>
      </div>
    </footer>
  );
}
