// Dynamic, data-wired element: the storefront product packages grid. On the live (server-rendered)
// page it renders the real <ProductGrid>, which sources products + locale-aware prices at request time.
// In the builder preview (client) it shows a neutral placeholder — the renderer is the same registry,
// so the live page and the published doc agree; only the preview substitutes the placeholder.
import { Package } from "lucide-react";
import { ProductGrid } from "../../../components/marketing/product-grid";
import type { Locale } from "../../i18n";
import { newId } from "../id";
import type { ElementDef } from "./types";

export const productGridDef: ElementDef = {
  type: "productGrid",
  category: "dynamic",
  label: { en: "Product packages", de: "Produktpakete" },
  icon: "Package",
  isContainer: false,
  textSlots: [],
  propSchema: [],
  example: () => ({ id: newId(), type: "productGrid" }),
  Render: ({ locale, mode }) => {
    if (mode === "preview") {
      return (
        <section className="section">
          <div className="container">
            <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 8, border: "1px dashed var(--border)", borderRadius: 12, padding: 32, color: "var(--muted)" }}>
              <Package aria-hidden size={18} /> Product packages
            </div>
          </div>
        </section>
      );
    }
    return <ProductGrid locale={locale as Locale} />;
  }
};
