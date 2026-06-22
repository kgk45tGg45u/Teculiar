import type { Metadata } from "next";
import { Suspense } from "react";
import { AdminBreadcrumbs } from "../../components/admin/admin-breadcrumbs";
import { LocaleProvider } from "../../components/layout/locale-provider";
import { SiteHeader } from "../../components/layout/site-header";
import { SiteFooter } from "../../components/layout/site-footer";
import { apiGet, currencyConfigFromSettings, i18nConfigFromSettings, type StoredCurrencyConfig } from "../../lib/api";
import { requestLocale } from "../../lib/server-locale";

export const metadata: Metadata = {
  title: "Teculiar Admin | Dezhost"
};

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const locale = await requestLocale();
  const settings = (await apiGet<{ siteLogoUrl?: string; usdExchangeRate?: number; usdBufferCents?: number; currencyConfig?: StoredCurrencyConfig; languages?: { main?: string; others?: string[] } }>("/storefront/settings")) ?? {};
  const currencyConfig = currencyConfigFromSettings(settings);
  const i18nConfig = i18nConfigFromSettings(settings);
  // Seed every admin client component with the server-resolved (cookie) locale so they SSR and
  // hydrate in the same language — admin chrome and forms call useLocale() instead of currentLocale().
  return (
    <LocaleProvider locale={locale}>
      <Suspense>
        <SiteHeader brandHref="/admin" brandLogo={settings.siteLogoUrl} locale={locale} variant="admin" languages={i18nConfig.languages} currencies={currencyConfig.currencies} />
      </Suspense>
      <Suspense>
        <AdminBreadcrumbs />
      </Suspense>
      {children}
      <SiteFooter locale={locale} brandLogo={settings.siteLogoUrl} variant="admin" />
    </LocaleProvider>
  );
}
