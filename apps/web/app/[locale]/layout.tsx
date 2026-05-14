import type { ReactNode } from "react";
import { SiteFooter } from "../../components/layout/site-footer";
import { SiteHeader } from "../../components/layout/site-header";
import { apiGet } from "../../lib/api";
import { getLocale } from "../../lib/i18n";

export default async function PublicLayout({
  children,
  params
}: Readonly<{
  children: ReactNode;
  params: Promise<{ locale: string }>;
}>) {
  const { locale: rawLocale } = await params;
  const locale = getLocale(rawLocale);
  const settings = await apiGet<{ siteLogoUrl?: string }>("/storefront/settings");
  const brandLogo = settings?.siteLogoUrl;

  return (
    <div className="shell">
      <SiteHeader brandLogo={brandLogo} locale={locale} />
      <main>{children}</main>
      <SiteFooter brandLogo={brandLogo} locale={locale} />
    </div>
  );
}
