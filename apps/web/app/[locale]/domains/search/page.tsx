import { cookies } from "next/headers";
import { notFound } from "next/navigation";
import { DomainSearch } from "../../../../components/marketing/domain-search";
import { Button } from "../../../../components/ui/button";
import { apiGet, serverMoney, type ApiDomainSearch, type ApiDomainSearchResult, type ApiProduct } from "../../../../lib/api";
import { CURRENCY_COOKIE, getLocale, type Currency, type Locale } from "../../../../lib/i18n";
import styles from "./domain-results.module.css";

export default async function DomainSearchPage({
  params,
  searchParams
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ domain?: string }>;
}) {
  const { locale: rawLocale } = await params;
  const { domain } = await searchParams;
  const locale = getLocale(rawLocale);
  const query = domain?.trim().toLowerCase();

  if (!query) {
    return <DomainSearch locale={locale} />;
  }

  const cookieStore = await cookies();
  const savedCurrency = cookieStore.get(CURRENCY_COOKIE)?.value;
  const displayCurrency: Currency =
    savedCurrency === "EUR" || savedCurrency === "USD" ? savedCurrency : locale === "en" ? "USD" : "EUR";

  const [result, settings, products] = await Promise.all([
    apiGet<ApiDomainSearch>(`/domains/search?domain=${encodeURIComponent(query)}`),
    apiGet<{ usdExchangeRate?: number; usdBufferCents?: number }>("/storefront/settings"),
    apiGet<ApiProduct[]>("/storefront/products")
  ]);

  if (!result) {
    notFound();
  }

  const exchangeRate = settings?.usdExchangeRate ?? 1.0;
  const bufferCents = settings?.usdBufferCents ?? 0;
  const domainProduct = products?.find((product) => product.type === "DOMAIN");
  const productId = result.productId ?? domainProduct?.id;

  return (
    <main className="section">
      <div className={`container ${styles.grid}`}>
        <DomainResultCard
          displayCurrency={displayCurrency}
          bufferCents={bufferCents}
          exchangeRate={exchangeRate}
          locale={locale}
          productId={productId}
          result={result}
        />
        {result.suggestions.map((suggestion) => (
          <DomainResultCard
            key={suggestion.domain}
            displayCurrency={displayCurrency}
            bufferCents={bufferCents}
            exchangeRate={exchangeRate}
            locale={locale}
            productId={suggestion.productId ?? productId}
            result={suggestion}
          />
        ))}
      </div>
    </main>
  );
}

function DomainResultCard({
  displayCurrency,
  bufferCents,
  exchangeRate,
  locale,
  productId,
  result
}: {
  displayCurrency: Currency;
  bufferCents: number;
  exchangeRate: number;
  locale: Locale;
  productId?: string;
  result: ApiDomainSearchResult;
}) {
  const isDe = locale === "de";
  const href = productId
    ? `/${locale}/order/${productId}?domain=${encodeURIComponent(result.domain)}&domainAction=${result.action}`
    : `/${locale}/domains`;

  return (
    <div className={styles.card}>
      <span className="eyebrow">Domains</span>
      <h2>{result.domain}</h2>
      {result.available ? (
        <p className={styles.available}>
          {isDe ? "Verfügbar zur Registrierung" : "Available for registration"}
        </p>
      ) : (
        <p className={styles.unavailable}>
          {isDe
            ? `Die Domain ${result.domain} ist nicht zur Registrierung verfügbar. Wenn sie Ihnen gehört, können Sie sie hier transferieren. Dieser Prozess verlängert die Domain automatisch um ein weiteres Jahr zum gleichen Preis.`
            : `The domain ${result.domain} is not available to register. If it belongs to you, you can transfer it here. This process will automatically renew the domain for another year too, with the same price.`}
        </p>
      )}
      <strong className={styles.price}>
        {serverMoney(result.price.amountCents, displayCurrency, exchangeRate, bufferCents, locale)}
      </strong>
      <Button href={href}>{result.available ? (isDe ? "Bestellen" : "Order") : "Transfer"}</Button>
      {result.price.error ? <p className={styles.muted}>{result.price.error}</p> : null}
      {result.error ? <p className={styles.muted}>{result.error}</p> : null}
    </div>
  );
}
