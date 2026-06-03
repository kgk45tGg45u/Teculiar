import type { Metadata } from "next";
import { Suspense } from "react";
import { SiteHeader } from "../../components/layout/site-header";
import { SiteFooter } from "../../components/layout/site-footer";
import { apiGet } from "../../lib/api";
import { requestLocale } from "../../lib/server-locale";

export const metadata: Metadata = {
  title: "Teculiar Admin | Dezhost"
};

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const locale = await requestLocale();
  const settings = (await apiGet<{ siteLogoUrl?: string }>("/storefront/settings")) ?? {};
  return (
    <>
      <Suspense>
        <SiteHeader brandHref="/admin" brandLogo={settings.siteLogoUrl} locale={locale} variant="admin" />
      </Suspense>
      {children}
      <SiteFooter locale={locale} brandLogo={settings.siteLogoUrl} variant="admin" />
    </>
  );
}
