import { DomainSearch } from "../../components/marketing/domain-search";
import { Hero } from "../../components/marketing/hero";
import { PlatformSection } from "../../components/marketing/platform-section";
import { ProductGrid } from "../../components/marketing/product-grid";
import { getLocale } from "../../lib/i18n";

export default function HomePage({ params }: { params: { locale: string } }) {
  const locale = getLocale(params.locale);

  return (
    <>
      <Hero locale={locale} />
      <ProductGrid locale={locale} />
      <DomainSearch locale={locale} />
      <PlatformSection locale={locale} />
    </>
  );
}
