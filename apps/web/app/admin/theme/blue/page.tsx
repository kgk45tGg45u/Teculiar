import type { AuthUser } from "../../../../lib/api";
import { apiGetAuth, redirectToAdminLogin } from "../../../../lib/server-api";
import { AdminSidebar } from "../../../../components/admin/admin-sidebar";
import { ThemeBlueForm } from "../../../../components/admin/theme-blue-form";
import styles from "../../../../components/admin/admin-dashboard.module.css";

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

export default async function ThemeBluePage() {
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
            <span className="eyebrow">Theme</span>
            <h1>Blue</h1>
          </div>
        </header>
        <ThemeBlueForm initialImages={{
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
