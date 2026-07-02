import type { AuthUser } from "@dezhost/web-core/lib/api";
import { apiGetAuth, redirectToAdminLogin } from "@dezhost/web-core/lib/server-api";
import { AdminSidebar } from "../../../components/admin/admin-sidebar";
import { ThemeBuilder } from "../../../components/admin/theme/theme-builder";
import styles from "../../../components/admin/admin-dashboard.module.css";

// Admin > Theme — the active theme (styling) is chosen on the first tab; the remaining tabs edit the
// GLOBAL, theme-independent storefront content (menus/pages/footer/redirects). No "Blue" sub-route:
// the old /admin/theme/blue path redirects here (decoupling, Phase 3a).
type BlueThemeSettings = {
  blue: {
    homeHeroImageUrl?: string | null;
    webhostingHeroImageUrl?: string | null;
    domainsHeroImageUrl?: string | null;
    itSolutionsHeroImageUrl?: string | null;
    contactHeroImageUrl?: string | null;
    aboutHeroImageUrl?: string | null;
    virtualServersHeroImageUrl?: string | null;
    webdesignHeroImageUrl?: string | null;
    blogHeroImageUrl?: string | null;
    knowledgebaseHeroImageUrl?: string | null;
  };
};

export default async function ThemePage() {
  const [user, settings, themeSettings] = await Promise.all([
    apiGetAuth<AuthUser>("/users/me"),
    apiGetAuth<{ siteLogoUrl?: string }>("/admin/dev/billing/settings").then((r) => r ?? {}),
    apiGetAuth<BlueThemeSettings>("/admin/dev/theme/settings").then((r) => r ?? { blue: {} })
  ]);

  if (!user?.roles.some((r) => r === "admin" || r === "staff")) {
    await redirectToAdminLogin();
  }

  const b = themeSettings.blue ?? {};

  return (
    <div className={styles.page}>
      <AdminSidebar brandLogo={(settings as { siteLogoUrl?: string }).siteLogoUrl} />
      <main className={styles.main}>
        <header className={styles.header}>
          <div>
            <span className="eyebrow">Storefront</span>
            <h1>Theme</h1>
          </div>
        </header>
        <ThemeBuilder initialImages={{
          homeHeroImageUrl: b.homeHeroImageUrl ?? "",
          webhostingHeroImageUrl: b.webhostingHeroImageUrl ?? "",
          domainsHeroImageUrl: b.domainsHeroImageUrl ?? "",
          itSolutionsHeroImageUrl: b.itSolutionsHeroImageUrl ?? "",
          contactHeroImageUrl: b.contactHeroImageUrl ?? "",
          aboutHeroImageUrl: b.aboutHeroImageUrl ?? "",
          virtualServersHeroImageUrl: b.virtualServersHeroImageUrl ?? "",
          webdesignHeroImageUrl: b.webdesignHeroImageUrl ?? "",
          blogHeroImageUrl: b.blogHeroImageUrl ?? "",
          knowledgebaseHeroImageUrl: b.knowledgebaseHeroImageUrl ?? "",
        }} />
      </main>
    </div>
  );
}
