// Dynamic element: the storefront domain-search band. On the live page it renders the real
// <DomainSearch> (its form posts to /<locale>/domains/search); in the builder preview it shows a
// neutral placeholder. Same wrap pattern as productGrid.
import { Search } from "lucide-react";
import { DomainSearch } from "../../../components/marketing/domain-search";
import type { Locale } from "../../i18n";
import { newId } from "../id";
import type { ElementDef } from "./types";

export const domainSearchDef: ElementDef = {
  type: "domainSearch",
  category: "dynamic",
  label: { en: "Domain search", de: "Domain-Suche" },
  icon: "Search",
  isContainer: false,
  textSlots: [],
  propSchema: [],
  example: () => ({ id: newId(), type: "domainSearch" }),
  Render: ({ locale, mode }) => {
    if (mode === "preview") {
      return (
        <section className="section">
          <div className="container">
            <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 8, border: "1px dashed var(--border)", borderRadius: 12, padding: 32, color: "var(--muted)" }}>
              <Search aria-hidden size={18} /> Domain search
            </div>
          </div>
        </section>
      );
    }
    return <DomainSearch locale={locale as Locale} />;
  }
};
