import type { Metadata } from "next";
import { Suspense } from "react";
import { ExchangeRateInit } from "../../components/layout/exchange-rate-init";
import { SiteFooter } from "../../components/layout/site-footer";
import { SiteHeader } from "../../components/layout/site-header";
import { apiGet } from "../../lib/api";
import { requestLocale } from "../../lib/server-locale";

export const metadata: Metadata = {
  title: "Teculiar Client Panel | Dezhost"
};

export default async function ClientLayout({ children }: { children: React.ReactNode }) {
  const locale = await requestLocale();
  const settings = await apiGet<{ siteLogoUrl?: string; usdExchangeRate?: number; usdBufferCents?: number }>("/storefront/settings");
  const brandLogo = settings?.siteLogoUrl;
  const exchangeRate = settings?.usdExchangeRate ?? 1.0;
  const bufferCents = settings?.usdBufferCents ?? 0;
  return (
    <>
      <Suspense>
        <SiteHeader brandHref="/client" brandLogo={brandLogo} locale={locale} variant="admin" />
      </Suspense>
      <ExchangeRateInit rate={exchangeRate} bufferCents={bufferCents} />
      {children}
      <SiteFooter locale={locale} brandLogo={brandLogo} variant="admin" />
    </>
  );
}
