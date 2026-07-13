import type { Metadata } from "next";
import { Suspense } from "react";
import { AdminBreadcrumbs } from "../../components/admin/admin-breadcrumbs";
import { LocaleProvider } from "@teculiar/web-core/components/layout/locale-provider";
import { SiteHeader } from "@teculiar/web-core/components/layout/site-header";
import { SiteFooter } from "@teculiar/web-core/components/layout/site-footer";
import { currencyConfigFromSettings, i18nConfigFromSettings, type StoredCurrencyConfig } from "@teculiar/web-core/lib/api";
import { requestLocale } from "@teculiar/web-core/lib/server-locale";
import { requestSurface, serverApiGet } from "@teculiar/web-core/lib/server-api";
import { hrefForSurface } from "@teculiar/web-core/lib/surface";

export const metadata: Metadata = {
  title: "Teculiar Admin"
};

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const locale = await requestLocale();
  const brandHref = hrefForSurface(await requestSurface(), "/admin");
  const settings = (await serverApiGet<{ siteLogoUrl?: string; clientBaseUrl?: string; usdExchangeRate?: number; usdBufferCents?: number; currencyConfig?: StoredCurrencyConfig; languages?: { main?: string; others?: string[] } }>("/storefront/settings")) ?? {};
  const currencyConfig = currencyConfigFromSettings(settings);
  const i18nConfig = i18nConfigFromSettings(settings);
  // Seed every admin client component with the server-resolved (cookie) locale so they SSR and
  // hydrate in the same language — admin chrome and forms call useLocale() instead of currentLocale().
  return (
    <LocaleProvider locale={locale}>
      <Suspense>
        <SiteHeader brandHref={brandHref} brandLogo={settings.siteLogoUrl} locale={locale} variant="admin" languages={i18nConfig.languages} currencies={currencyConfig.currencies} clientBaseUrl={settings.clientBaseUrl} />
      </Suspense>
      <Suspense>
        <AdminBreadcrumbs />
      </Suspense>
      {children}
      <SiteFooter locale={locale} brandLogo={settings.siteLogoUrl} variant="admin" />
    </LocaleProvider>
  );
}
