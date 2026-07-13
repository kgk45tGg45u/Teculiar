import type { Metadata } from "next";
import type { ReactNode } from "react";
import { headers } from "next/headers";
import { CookieBanner } from "@teculiar/web-core/components/layout/cookie-banner";
import { CurrencyConfigInit } from "@teculiar/web-core/components/layout/currency-config-init";
import { SiteFooter } from "@teculiar/web-core/components/layout/site-footer";
import { SiteHeader } from "@teculiar/web-core/components/layout/site-header";
import { apiGet, currencyConfigFromSettings, i18nConfigFromSettings, type StoredCurrencyConfig } from "@teculiar/web-core/lib/api";
import { fetchStorefrontTheme, storefrontAlternates } from "@teculiar/web-core/lib/storefront-theme";
import { getLocale } from "@teculiar/web-core/lib/i18n";

type SiteSettings = {
  siteLogoUrl?: string;
  siteUrl?: string;
  clientBaseUrl?: string;
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
  const siteName = settings?.siteName || "Teculiar";
  const description = settings?.metaDescription || (locale === "de"
    ? "Teculiar – ethisches Webhosting und IT-Dienstleistungen aus Deutschland. Faire Preise, persönlicher Support, DSGVO-konform."
    : "Teculiar – ethical web hosting and IT services from Germany. Fair prices, personal support, GDPR compliant.");
  const ogImage = settings?.ogImageStatic;
  const siteUrl = settings?.siteUrl?.replace(/\/$/, "") || process.env.SITE_URL || "https://www.teculiar.com";
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
  const brandName = settings?.siteName;
  const currencyConfig = currencyConfigFromSettings(settings);
  const i18nConfig = i18nConfigFromSettings(settings);

  return (
    <div className="shell">
      <SiteHeader brandLogo={brandLogo} brandName={brandName} locale={locale} languages={i18nConfig.languages} currencies={currencyConfig.currencies} theme={theme} clientBaseUrl={settings?.clientBaseUrl} />
      <CurrencyConfigInit config={currencyConfig} />
      <main>{children}</main>
      <SiteFooter brandLogo={brandLogo} brandName={brandName} locale={locale} theme={theme} />
      <CookieBanner locale={locale} />
    </div>
  );
}
