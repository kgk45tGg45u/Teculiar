import type { AuthUser } from "../../../../../lib/api";
import { CustomizerBuilder } from "../../../../../components/admin/customizer/builder";
import type { CustomizerPageData } from "../../../../../components/admin/customizer/api";
import type { AdminThemeData } from "../../../../../components/admin/theme/types";
import { asLayoutDoc, emptyLayout } from "../../../../../lib/customizer/types";
import { localized } from "../../../../../lib/storefront-theme";
import { apiGetAuth, redirectToAdminLogin } from "../../../../../lib/server-api";

// Full-screen Customizer builder for one global page. The route key (`pageKey`) is resolved to the
// page id via the admin theme payload (which also carries the configured locales), then the page's
// layout docs are fetched from the customizer API. No admin chrome — the builder owns the viewport.
export default async function CustomizerPage({ params }: { params: Promise<{ pageKey: string }> }) {
  const { pageKey } = await params;
  const [user, theme] = await Promise.all([
    apiGetAuth<AuthUser>("/users/me"),
    apiGetAuth<AdminThemeData>("/admin/dev/theme")
  ]);

  if (!user?.roles.some((role) => role === "admin" || role === "staff")) {
    await redirectToAdminLogin();
  }

  const meta = theme?.pages.find((page) => page.key === pageKey);
  if (!theme || !meta) {
    return (
      <main style={{ padding: 40 }}>
        <p>Page not found: {pageKey}</p>
      </main>
    );
  }

  const payload = await apiGetAuth<CustomizerPageData>(`/admin/dev/customizer/${meta.id}`);
  const locales = theme.locales.length ? theme.locales : ["de"];
  const mainLocale = locales[0] ?? "de";
  const initialDoc = asLayoutDoc(payload?.draftLayout) ?? asLayoutDoc(payload?.publishedLayout) ?? emptyLayout();

  return (
    <CustomizerBuilder
      canTranslate={theme.canTranslate}
      draftUpdatedAt={payload?.draftUpdatedAt ?? null}
      published={(payload?.layoutVersion ?? 0) > 0}
      initialDoc={initialDoc}
      layoutVersion={payload?.layoutVersion ?? 0}
      locales={locales}
      mainLocale={mainLocale}
      pageId={meta.id}
      pageKey={meta.key}
      pageName={localized(meta.name, mainLocale, mainLocale)}
    />
  );
}
