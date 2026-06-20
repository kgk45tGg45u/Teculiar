import type { Metadata } from "next";
import { Suspense } from "react";
import { CurrencyConfigInit } from "../../components/layout/currency-config-init";
import { SiteFooter } from "../../components/layout/site-footer";
import { SiteHeader } from "../../components/layout/site-header";
import { apiGet, currencyConfigFromSettings, type CurrencyConfig } from "../../lib/api";
import { requestLocale } from "../../lib/server-locale";

export const metadata: Metadata = {
  title: "Teculiar Client Panel | Dezhost"
};

export default async function ClientLayout({ children }: { children: React.ReactNode }) {
  const locale = await requestLocale();
  const settings = await apiGet<{ siteLogoUrl?: string; usdExchangeRate?: number; usdBufferCents?: number; currencyConfig?: CurrencyConfig }>("/storefront/settings");
  const brandLogo = settings?.siteLogoUrl;
  const currencyConfig = currencyConfigFromSettings(settings);
  return (
    <>
      <Suspense>
        <SiteHeader brandHref="/client" brandLogo={brandLogo} locale={locale} variant="admin" />
      </Suspense>
      <CurrencyConfigInit config={currencyConfig} />
      {children}
      <SiteFooter locale={locale} brandLogo={brandLogo} variant="admin" />
    </>
  );
}
