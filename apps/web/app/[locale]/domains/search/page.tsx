import { notFound } from "next/navigation";
import { apiGet, money, type ApiDomainSearch, type ApiDomainSearchResult } from "../../../../lib/api";
import { getLocale } from "../../../../lib/i18n";
import { Button } from "../../../../components/ui/button";
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
    notFound();
  }

  const result = await apiGet<ApiDomainSearch>(`/domains/search?domain=${encodeURIComponent(query)}`);
  if (!result) {
    notFound();
  }

  return (
    <main className="section">
      <div className={`container ${styles.grid}`}>
        <DomainResultCard locale={locale} result={result} />
        {result.suggestions.map((suggestion) => (
          <DomainResultCard key={suggestion.domain} locale={locale} result={suggestion} />
        ))}
      </div>
    </main>
  );
}

function DomainResultCard({ locale, result }: { locale: string; result: ApiDomainSearchResult }) {
  const href = result.productId
    ? `/${locale}/order/${result.productId}?domain=${encodeURIComponent(result.domain)}&domainAction=${result.action}`
    : `/${locale}/domains`;

  return (
    <div className={styles.card}>
      <span className="eyebrow">Domains</span>
      <h2>{result.domain}</h2>
      {result.available ? (
        <p className={styles.available}>Available for registration</p>
      ) : (
        <p className={styles.unavailable}>
          The domain {result.domain} is not available to register. If it belongs to you, you can transfer it here.
          This process will automatically renew the domain for another year too, with the same price.
        </p>
      )}
      <strong className={styles.price}>{money(result.price.amountCents)}</strong>
      <Button href={href}>{result.available ? "Order" : "Transfer"}</Button>
      {result.price.error ? <p className={styles.muted}>{result.price.error}</p> : null}
      {result.error ? <p className={styles.muted}>{result.error}</p> : null}
    </div>
  );
}
