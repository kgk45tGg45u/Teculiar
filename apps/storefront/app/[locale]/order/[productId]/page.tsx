import { notFound } from "next/navigation";
import { CheckoutForm } from "../../../../components/checkout/checkout-form";
import { apiGet, type ApiProduct } from "@teculiar/web-core/lib/api";
import { getLocale } from "@teculiar/web-core/lib/i18n";

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
  const products = await apiGet<ApiProduct[]>("/products");
  const product = products?.find((item) => item.id === productId);
  const hostingProducts = products?.filter((item) => item.type === "SHARED_HOSTING" && item.id !== productId) ?? [];
  const domainProduct = products?.find((item) => item.type === "DOMAIN");

  if (!product) {
    notFound();
  }

  return (
    <CheckoutForm
      initialDomain={query.domain}
      initialDomainAction={query.domainAction === "transfer" ? "transfer" : "register"}
      locale={locale}
      domainProduct={domainProduct}
      hostingProducts={hostingProducts}
      product={product}
    />
  );
}
