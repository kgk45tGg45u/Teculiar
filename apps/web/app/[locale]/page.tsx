import { DomainSearch } from "../../components/marketing/domain-search";
import { Hero } from "../../components/marketing/hero";
import { PlatformSection } from "../../components/marketing/platform-section";
import { ProductGrid } from "../../components/marketing/product-grid";
import { getLocale } from "../../lib/i18n";

export default async function HomePage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale: rawLocale } = await params;
  const locale = getLocale(rawLocale);

  return (
    <>
      <Hero locale={locale} />
      <ProductGrid locale={locale} />
      <DomainSearch locale={locale} />
      <PlatformSection locale={locale} />
    </>
  );
}
