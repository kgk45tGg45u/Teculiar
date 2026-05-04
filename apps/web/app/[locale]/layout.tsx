import type { ReactNode } from "react";
import { SiteFooter } from "../../components/layout/site-footer";
import { SiteHeader } from "../../components/layout/site-header";
import { getLocale } from "../../lib/i18n";

export default function PublicLayout({
  children,
  params
}: Readonly<{
  children: ReactNode;
  params: { locale: string };
}>) {
  const locale = getLocale(params.locale);

  return (
    <div className="shell">
      <SiteHeader locale={locale} />
      <main>{children}</main>
      <SiteFooter locale={locale} />
    </div>
  );
}
