import { Suspense } from "react";
import { SiteHeader } from "../../components/layout/site-header";
import { SiteFooter } from "../../components/layout/site-footer";
import { requestLocale } from "../../lib/server-locale";
import { apiGetAuth } from "../../lib/server-api";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const locale = await requestLocale();
  const settings = (await apiGetAuth<{ siteLogoUrl?: string }>("/admin/dev/billing/settings").catch(() => null)) ?? {};
  return (
    <>
      <Suspense>
        <SiteHeader brandLogo={settings.siteLogoUrl} locale={locale} />
      </Suspense>
      {children}
      <SiteFooter locale={locale} brandLogo={settings.siteLogoUrl} />
    </>
  );
}
