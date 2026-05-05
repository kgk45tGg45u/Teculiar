import { notFound } from "next/navigation";
import { CheckoutForm } from "../../../../components/checkout/checkout-form";
import { apiGet, type ApiProduct } from "../../../../lib/api";
import { getLocale } from "../../../../lib/i18n";

export default async function OrderPage({ params }: { params: Promise<{ locale: string; productId: string }> }) {
  const { locale: rawLocale, productId } = await params;
  const locale = getLocale(rawLocale);
  const products = await apiGet<ApiProduct[]>("/storefront/products");
  const product = products?.find((item) => item.id === productId);

  if (!product) {
    notFound();
  }

  return <CheckoutForm locale={locale} product={product} />;
}
