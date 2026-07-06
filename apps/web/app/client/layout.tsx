import type { Metadata } from "next";
import { Suspense } from "react";
import { CurrencyConfigInit } from "@dezhost/web-core/components/layout/currency-config-init";
import { SiteFooter } from "@dezhost/web-core/components/layout/site-footer";
import { SiteHeader } from "@dezhost/web-core/components/layout/site-header";
import { currencyConfigFromSettings, i18nConfigFromSettings, type StoredCurrencyConfig } from "@dezhost/web-core/lib/api";
import { requestLocale } from "@dezhost/web-core/lib/server-locale";
import { serverApiGet } from "@dezhost/web-core/lib/server-api";

export const metadata: Metadata = {
  title: "Teculiar Client Panel | Dezhost"
};

export default async function ClientLayout({ children }: { children: React.ReactNode }) {
  const locale = await requestLocale();
  const settings = await serverApiGet<{ siteLogoUrl?: string; usdExchangeRate?: number; usdBufferCents?: number; currencyConfig?: StoredCurrencyConfig; languages?: { main?: string; others?: string[] } }>("/storefront/settings");
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
