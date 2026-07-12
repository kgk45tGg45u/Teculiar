import type { Metadata } from "next";
import { Suspense } from "react";
import { AdminBreadcrumbs } from "../../components/admin/admin-breadcrumbs";
import { LocaleProvider } from "@dezhost/web-core/components/layout/locale-provider";
import { SiteHeader } from "@dezhost/web-core/components/layout/site-header";
import { SiteFooter } from "@dezhost/web-core/components/layout/site-footer";
import { currencyConfigFromSettings, i18nConfigFromSettings, type StoredCurrencyConfig } from "@dezhost/web-core/lib/api";
import { requestLocale } from "@dezhost/web-core/lib/server-locale";
import { requestSurface, serverApiGet } from "@dezhost/web-core/lib/server-api";
import { hrefForSurface } from "@dezhost/web-core/lib/surface";

export const metadata: Metadata = {
  title: "Teculiar Admin | Dezhost"
};

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const locale = await requestLocale();
  const brandHref = hrefForSurface(await requestSurface(), "/admin");
  const settings = (await serverApiGet<{ siteLogoUrl?: string; usdExchangeRate?: number; usdBufferCents?: number; currencyConfig?: StoredCurrencyConfig; languages?: { main?: string; others?: string[] } }>("/storefront/settings")) ?? {};
  const currencyConfig = currencyConfigFromSettings(settings);
  const i18nConfig = i18nConfigFromSettings(settings);
  // Seed every admin client component with the server-resolved (cookie) locale so they SSR and
  // hydrate in the same language — admin chrome and forms call useLocale() instead of currentLocale().
  return (
    <LocaleProvider locale={locale}>
      <Suspense>
        <SiteHeader brandHref={brandHref} brandLogo={settings.siteLogoUrl} locale={locale} variant="admin" languages={i18nConfig.languages} currencies={currencyConfig.currencies} />
      </Suspense>
      <Suspense>
        <AdminBreadcrumbs />
      </Suspense>
      {children}
      <SiteFooter locale={locale} brandLogo={settings.siteLogoUrl} variant="admin" />
    </LocaleProvider>
  );
}
