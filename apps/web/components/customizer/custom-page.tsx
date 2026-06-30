import type { ReactNode } from "react";
import { apiGet } from "../../lib/api";
import { LayoutRenderer } from "../../lib/customizer/layout-renderer";
import { asLayoutDoc } from "../../lib/customizer/types";

// The live render gate for the Customizer (Phase 3e). A storefront route wraps its built-in renderer
// in this gate: once a layout doc has been published for the page (`publishedLayout` is non-null), the
// published doc is rendered (server-side, via the same LayoutRenderer the builder previews); until then
// `children` (the hard-coded renderer) is returned unchanged, so migration is fully incremental and
// nothing breaks. `Page.component` is intentionally NOT used as the signal — it stays the physical
// route key the slug-routing middleware depends on. `children` is an element, so its own data fetching
// only runs on the fallback path.
type StorefrontPage = { key: string; component: string; publishedLayout: unknown; mainLocale: string | null };

export async function CustomPageGate({ pageKey, locale, children }: { pageKey: string; locale: string; children: ReactNode }) {
  const data = await apiGet<StorefrontPage>(`/storefront/page/${pageKey}`);
  const doc = asLayoutDoc(data?.publishedLayout);
  if (doc) {
    return <LayoutRenderer doc={doc} locale={locale} mainLocale={data?.mainLocale || locale} mode="live" />;
  }
  return <>{children}</>;
}
