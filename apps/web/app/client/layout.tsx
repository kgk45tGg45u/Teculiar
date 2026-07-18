import type { Metadata } from "next";
import { Suspense } from "react";
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

export const metadata: Metadata = {
  title: "Teculiar Client Panel"
};

// D1 dashboard chrome: same PageShell as the admin dashboard (sidebar + top bar + mobile
// drawer) replaces the storefront SiteHeader/SiteFooter on every /client page.
export default async function ClientLayout({ children }: { children: React.ReactNode }) {
  const locale = await requestLocale();
  const settings = await serverApiGet<{ siteLogoUrl?: string; storefrontBaseUrl?: string; currencyConfig?: StoredCurrencyConfig }>("/storefront/settings");
  const currencyConfig = currencyConfigFromSettings(settings);
  const copy = getDictionary(locale).client;
  return (
    <LocaleProvider locale={locale}>
      <CurrencyConfigInit config={currencyConfig} />
      <PageShell
        sidebar={<ClientSidebar />}
        brand={<BrandLogo alt="Teculiar" fallback="Teculiar" src={settings?.siteLogoUrl} />}
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
