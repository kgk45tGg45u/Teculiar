import { notFound } from "next/navigation";
import { CheckoutForm } from "../../../../components/checkout/checkout-form";
import { apiGet, type ApiProduct } from "../../../../lib/api";
import { getLocale } from "../../../../lib/i18n";

export default async function OrderPage({
  params,
  searchParams
}: {
  params: Promise<{ locale: string; productId: string }>;
  searchParams: Promise<{ domain?: string; domainAction?: string }>;
}) {
  const { locale: rawLocale, productId } = await params;
  const query = await searchParams;
  const locale = getLocale(rawLocale);
  const products = await apiGet<ApiProduct[]>("/storefront/products");
  const product = products?.find((item) => item.id === productId);

  if (!product) {
    notFound();
  }

  return (
    <CheckoutForm
      initialDomain={query.domain}
      initialDomainAction={query.domainAction === "transfer" ? "transfer" : "register"}
      locale={locale}
      product={product}
    />
  );
}
