import type { Metadata } from "next";
import { Suspense } from "react";
import { AdminBreadcrumbs } from "../../components/admin/admin-breadcrumbs";
import { AdminSidebar } from "../../components/admin/admin-sidebar";
import { LogoutButton } from "../../components/auth/logout-button";
import { LocaleProvider } from "@teculiar/web-core/components/layout/locale-provider";
import { LanguageToggle } from "@teculiar/web-core/components/layout/language-toggle";
import { PageShell } from "@teculiar/web-core/components/ui/page-shell";
import { Button } from "@teculiar/web-core/components/ui/button";
import { getDictionary } from "@teculiar/web-core/lib/dictionary";
import { requestLocale } from "@teculiar/web-core/lib/server-locale";
import { serverApiGet } from "@teculiar/web-core/lib/server-api";

export const metadata: Metadata = {
  title: "Teculiar Admin"
};

// D1 dashboard chrome: PageShell (sidebar + top bar + mobile drawer) replaces the storefront
// SiteHeader/SiteFooter on every /admin page; pages render content only. The login page shares
// this layout and renders without the shell via plainPaths.
export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const locale = await requestLocale();
  const settings = (await serverApiGet<{ siteLogoUrl?: string; storefrontBaseUrl?: string }>("/storefront/settings")) ?? {};
  const copy = getDictionary(locale).admin;
  return (
    <LocaleProvider locale={locale}>
      <PageShell
        sidebar={<AdminSidebar brandLogo={settings.siteLogoUrl} />}
        brand={<span className="brand-placeholder">Teculiar</span>}
        breadcrumbs={
          <Suspense>
            <AdminBreadcrumbs variant="inline" />
          </Suspense>
        }
        actions={
          <>
            <Suspense>
              <LanguageToggle locale={locale} />
            </Suspense>
            <Button className="hide-mobile" href={`${settings.storefrontBaseUrl ?? ""}/${locale}`} variant="secondary">
              {copy.website}
            </Button>
            <LogoutButton label={copy.logout} redirectTo="/admin/login" scope="admin" />
          </>
        }
        menuLabel={copy.nav.toggleNav}
        plainPaths={["/admin/login"]}
      >
        {children}
      </PageShell>
    </LocaleProvider>
  );
}
