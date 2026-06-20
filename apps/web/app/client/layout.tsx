import type { Metadata } from "next";
import { Suspense } from "react";
import { CurrencyConfigInit } from "../../components/layout/currency-config-init";
import { SiteFooter } from "../../components/layout/site-footer";
import { SiteHeader } from "../../components/layout/site-header";
import { apiGet, currencyConfigFromSettings, i18nConfigFromSettings, type StoredCurrencyConfig } from "../../lib/api";
import { requestLocale } from "../../lib/server-locale";

export const metadata: Metadata = {
  title: "Teculiar Client Panel | Dezhost"
};

export default async function ClientLayout({ children }: { children: React.ReactNode }) {
  const locale = await requestLocale();
  const settings = await apiGet<{ siteLogoUrl?: string; usdExchangeRate?: number; usdBufferCents?: number; currencyConfig?: StoredCurrencyConfig; languages?: { main?: string; others?: string[] } }>("/storefront/settings");
  const brandLogo = settings?.siteLogoUrl;
  const currencyConfig = currencyConfigFromSettings(settings);
  const i18nConfig = i18nConfigFromSettings(settings);
  return (
    <>
      <Suspense>
        <SiteHeader brandHref="/client" brandLogo={brandLogo} locale={locale} variant="admin" languages={i18nConfig.languages} currencies={currencyConfig.currencies} />
      </Suspense>
      <CurrencyConfigInit config={currencyConfig} />
      {children}
      <SiteFooter locale={locale} brandLogo={brandLogo} variant="admin" />
    </>
  );
}
