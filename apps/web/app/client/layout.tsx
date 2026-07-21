import type { Metadata } from "next";
import { Suspense } from "react";
import { ClientBreadcrumbs } from "../../components/portal/client-breadcrumbs";
import { ClientSidebar } from "../../components/portal/client-sidebar";
import { LogoutButton } from "../../components/auth/logout-button";
import { CurrencyConfigInit } from "@teculiar/web-core/components/layout/currency-config-init";
import { LocaleProvider } from "@teculiar/web-core/components/layout/locale-provider";
import { LanguageToggle } from "@teculiar/web-core/components/layout/language-toggle";
import { BrandLogo } from "@teculiar/web-core/components/ui/brand-logo";
import { PageShell } from "@teculiar/web-core/components/ui/page-shell";
import { Button } from "@teculiar/web-core/components/ui/button";
import { currencyConfigFromSettings, type StoredCurrencyConfig } from "@teculiar/web-core/lib/api";
import { getDictionary } from "@teculiar/web-core/lib/dictionary";
import { requestLocale } from "@teculiar/web-core/lib/server-locale";
import { serverApiGet } from "@teculiar/web-core/lib/server-api";

// Title follows the configured store name ("<Site> Client Portal"), never a hard-coded brand — the
// client area is white-labelled per tenant. Falls back to the localized "Client Portal" alone.
export async function generateMetadata(): Promise<Metadata> {
  const locale = await requestLocale();
  const settings = await serverApiGet<{ siteName?: string }>("/storefront/settings");
  const portal = getDictionary(locale).client.clientPortal;
  const siteName = settings?.siteName?.trim();
  return { title: siteName ? `${siteName} ${portal}` : portal };
}

// D1 dashboard chrome: same PageShell as the admin dashboard (sidebar + top bar + mobile
// drawer) replaces the storefront SiteHeader/SiteFooter on every /client page.
export default async function ClientLayout({ children }: { children: React.ReactNode }) {
  const locale = await requestLocale();
  const settings = await serverApiGet<{ siteName?: string; siteLogoUrl?: string; storefrontBaseUrl?: string; currencyConfig?: StoredCurrencyConfig }>("/storefront/settings");
  const currencyConfig = currencyConfigFromSettings(settings);
  const copy = getDictionary(locale).client;
  // White-label: brand text falls back to the store name, then the localized "Client Portal" —
  // never a hard-coded "Teculiar" the customer would see.
  const brandName = settings?.siteName?.trim() || copy.clientPortal;
  return (
    <LocaleProvider locale={locale}>
      <CurrencyConfigInit config={currencyConfig} />
      <PageShell
        sidebar={<ClientSidebar />}
        brand={<BrandLogo alt={brandName} fallback={brandName} src={settings?.siteLogoUrl} />}
        breadcrumbs={<ClientBreadcrumbs />}
        actions={
          <>
            <Suspense>
              <LanguageToggle locale={locale} />
            </Suspense>
            <Button className="hide-mobile" href={`${settings?.storefrontBaseUrl ?? ""}/${locale}`} variant="secondary">
              {copy.website}
            </Button>
            <LogoutButton label={copy.logout} redirectTo="/login" scope="client" />
          </>
        }
        menuLabel={copy.dash.navAria}
      >
        {children}
      </PageShell>
    </LocaleProvider>
  );
}
