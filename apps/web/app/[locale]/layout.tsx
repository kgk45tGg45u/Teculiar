import type { Metadata } from "next";
import type { ReactNode } from "react";
import { ExchangeRateInit } from "../../components/layout/exchange-rate-init";
import { SiteFooter } from "../../components/layout/site-footer";
import { SiteHeader } from "../../components/layout/site-header";
import { apiGet } from "../../lib/api";
import { getLocale } from "../../lib/i18n";

type SiteSettings = {
  siteLogoUrl?: string;
  siteUrl?: string;
  usdExchangeRate?: number;
  usdBufferCents?: number;
  siteName?: string;
  metaDescription?: string;
  ogImageStatic?: string;
  ogTitleSuffix?: string;
};

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale: rawLocale } = await params;
  const locale = getLocale(rawLocale);
  const settings = await apiGet<SiteSettings>("/storefront/settings");
  const siteName = settings?.siteName || "Dezhost";
  const description = settings?.metaDescription || (locale === "de"
    ? "Dezhost – ethisches Webhosting und IT-Dienstleistungen aus Deutschland. Faire Preise, persönlicher Support, DSGVO-konform."
    : "Dezhost – ethical web hosting and IT services from Germany. Fair prices, personal support, GDPR compliant.");
  const ogImage = settings?.ogImageStatic;
  const siteUrl = settings?.siteUrl?.replace(/\/$/, "") || process.env.SITE_URL || "https://www.dezhost.com";
  const logoUrl = settings?.siteLogoUrl;
  return {
    metadataBase: new URL(siteUrl),
    title: { default: siteName, template: `%s ${settings?.ogTitleSuffix || `| ${siteName}`}` },
    description,
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
  const settings = await apiGet<SiteSettings>("/storefront/settings");
  const brandLogo = settings?.siteLogoUrl;
  const exchangeRate = settings?.usdExchangeRate ?? 1.0;
  const bufferCents = settings?.usdBufferCents ?? 0;

  return (
    <div className="shell">
      <SiteHeader brandLogo={brandLogo} locale={locale} />
      <ExchangeRateInit rate={exchangeRate} bufferCents={bufferCents} />
      <main>{children}</main>
      <SiteFooter brandLogo={brandLogo} locale={locale} />
    </div>
  );
}
