import type { Metadata } from "next";
import type { ReactNode } from "react";
import { headers } from "next/headers";
import { CurrencyConfigInit } from "../../components/layout/currency-config-init";
import { SiteFooter } from "../../components/layout/site-footer";
import { SiteHeader } from "../../components/layout/site-header";
import { apiGet, currencyConfigFromSettings, i18nConfigFromSettings, type StoredCurrencyConfig } from "../../lib/api";
import { fetchStorefrontTheme, storefrontAlternates } from "../../lib/storefront-theme";
import { getLocale } from "../../lib/i18n";

type SiteSettings = {
  siteLogoUrl?: string;
  siteUrl?: string;
  usdExchangeRate?: number;
  usdBufferCents?: number;
  currencyConfig?: StoredCurrencyConfig;
  languages?: { main?: string; others?: string[] };
  siteName?: string;
  metaDescription?: string;
  ogImageStatic?: string;
  ogTitleSuffix?: string;
};

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale: rawLocale } = await params;
  const locale = getLocale(rawLocale);
  const [settings, theme, headerStore] = await Promise.all([
    apiGet<SiteSettings>("/storefront/settings"),
    fetchStorefrontTheme(),
    headers()
  ]);
  const siteName = settings?.siteName || "Dezhost";
  const description = settings?.metaDescription || (locale === "de"
    ? "Dezhost – ethisches Webhosting und IT-Dienstleistungen aus Deutschland. Faire Preise, persönlicher Support, DSGVO-konform."
    : "Dezhost – ethical web hosting and IT services from Germany. Fair prices, personal support, GDPR compliant.");
  const ogImage = settings?.ogImageStatic;
  const siteUrl = settings?.siteUrl?.replace(/\/$/, "") || process.env.SITE_URL || "https://www.dezhost.com";
  const logoUrl = settings?.siteLogoUrl;

  // hreflang + canonical from the localized-slug data. We only build them when the visitor-facing path
  // is known (set by middleware); the part after "/<locale>" maps to the page's per-locale slugs.
  const rawPath = headerStore.get("x-pathname") ?? "";
  const mainLocale = getLocale(settings?.languages?.main);
  const alternates = rawPath
    ? storefrontAlternates(theme, locale, mainLocale, (rawPath.split("?")[0] ?? "").split("/").slice(2).join("/").replace(/\/$/, ""))
    : undefined;

  return {
    metadataBase: new URL(siteUrl),
    title: { default: siteName, template: `%s ${settings?.ogTitleSuffix || `| ${siteName}`}` },
    description,
    alternates,
    openGraph: {
      siteName,
      url: siteUrl,
      locale: locale === "de" ? "de_DE" : "en_US",
      type: "website",
      images: ogImage ? [{ url: ogImage, width: 1200, height: 630, alt: siteName }] : undefined
    },
    twitter: {
      card: "summary_large_image",
      images: ogImage ? [ogImage] : undefined
    },
    other: logoUrl ? { "og:logo": logoUrl } : undefined
  };
}

export default async function PublicLayout({
  children,
  params
}: Readonly<{
  children: ReactNode;
  params: Promise<{ locale: string }>;
}>) {
  const { locale: rawLocale } = await params;
  const locale = getLocale(rawLocale);
  const [settings, theme] = await Promise.all([
    apiGet<SiteSettings>("/storefront/settings"),
    fetchStorefrontTheme()
  ]);
  const brandLogo = settings?.siteLogoUrl;
  const currencyConfig = currencyConfigFromSettings(settings);
  const i18nConfig = i18nConfigFromSettings(settings);

  return (
    <div className="shell">
      <SiteHeader brandLogo={brandLogo} locale={locale} languages={i18nConfig.languages} currencies={currencyConfig.currencies} theme={theme} />
      <CurrencyConfigInit config={currencyConfig} />
      <main>{children}</main>
      <SiteFooter brandLogo={brandLogo} locale={locale} theme={theme} />
    </div>
  );
}
