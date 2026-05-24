import { redirect } from "next/navigation";
import { ModulesManager } from "../../../../components/admin/admin-modules";
import { AdminSidebar } from "../../../../components/admin/admin-sidebar";
import { LogoutButton } from "../../../../components/auth/logout-button";
import { LanguageToggle } from "../../../../components/layout/language-toggle";
import { Button } from "../../../../components/ui/button";
import { apiGetAuth } from "../../../../lib/server-api";
import { requestLocale } from "../../../../lib/server-locale";
import { dictionary } from "../../../../lib/i18n";
import type { AuthUser, ApiDomainPrice } from "../../../../lib/api";
import { Suspense } from "react";
import styles from "../../../../components/admin/admin-dashboard.module.css";

export default async function AdminModulesPage() {
  const locale = await requestLocale();
  const copy = dictionary[locale].admin;
  const user = await apiGetAuth<AuthUser>("/users/me");
  if (!user?.roles.some((role) => role === "admin" || role === "staff")) {
    redirect("/admin/login" as never);
  }

  const settings = (await apiGetAuth<{ siteLogoUrl?: string }>("/admin/dev/billing/settings")) ?? {};
  const domainPrices = (await apiGetAuth<ApiDomainPrice[]>("/orders/admin/domain-prices")) ?? [];

  return (
    <div className={styles.page}>
      <AdminSidebar brandLogo={settings.siteLogoUrl} />
      <main className={styles.main}>
        <header className={styles.header}>
          <div>
            <span className="eyebrow">Products</span>
            <h1>Modules</h1>
          </div>
          <div className={styles.headerActions}>
            <Suspense>
              <LanguageToggle locale={locale} />
            </Suspense>
            <Button href={`/${locale}`} variant="secondary">{copy.website}</Button>
            <LogoutButton scope="admin" redirectTo="/admin/login" />
          </div>
        </header>

        <section className={styles.panel}>
          <div className={styles.panelHeader}>
            <div>
              <span className="eyebrow">Integrations</span>
              <h2>Active Modules</h2>
            </div>
            <Button href="/admin/products" variant="secondary">← Products</Button>
          </div>
          <p style={{ padding: "12px 16px 0", margin: 0, fontSize: "0.88rem", color: "var(--muted)" }}>
            Modules connect your platform to external service providers. Disabling a module removes automatic provisioning —
            existing products remain but new orders will stay pending until re-enabled.
          </p>
          <ModulesManager initialPrices={domainPrices} />
        </section>
      </main>
    </div>
  );
}
