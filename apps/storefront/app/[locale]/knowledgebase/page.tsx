import type { Metadata, Route } from "next";
import Link from "next/link";
import { BookOpen } from "lucide-react";
import { apiGet, type ApiKnowledgebaseArticle } from "@teculiar/web-core/lib/api";
import { getLocale } from "@teculiar/web-core/lib/i18n";
import styles from "./knowledgebase.module.css";

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale: rawLocale } = await params;
  const locale = getLocale(rawLocale);
  return {
    description: locale === "de" ? "Hilfecenter mit Artikeln zu Hosting, Domains und IT Services." : "Help center articles for hosting, domains, and IT services.",
    title: "Knowledgebase"
  };
}

export default async function KnowledgebasePage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale: rawLocale } = await params;
  const locale = getLocale(rawLocale);
  const [articles, themeSettings] = await Promise.all([
    apiGet<ApiKnowledgebaseArticle[]>("/knowledgebase").then((r) => r ?? []),
    apiGet<{ themeBlueKnowledgebaseHeroImageUrl?: string }>("/storefront/settings")
  ]);
  const heroImageUrl = themeSettings?.themeBlueKnowledgebaseHeroImageUrl ?? null;

  return (
    <main>
      <section className={styles.hero}>
        <div className="container">
          <div className={heroImageUrl ? styles.heroInner : undefined}>
            <div className={heroImageUrl ? styles.heroContent : undefined}>
              <span className="eyebrow"><BookOpen aria-hidden size={15} /> Knowledgebase</span>
              <h1>{locale === "de" ? "Antworten, bevor ein Ticket noetig ist." : "Answers before a ticket is needed."}</h1>
            </div>
            {heroImageUrl && (
              <div className={styles.heroImage} aria-hidden>
                <img alt="" src={heroImageUrl} />
              </div>
            )}
          </div>
        </div>
      </section>
      <section className="section tight">
        <div className="container">
          <div className={styles.grid}>
            {articles.map((article) => (
              <Link className={styles.card} href={`/${locale}/knowledgebase/${article.slug}` as Route} key={article.id}>
                <span className="eyebrow">Article</span>
                <h2>{article.title}</h2>
                <p>{article.excerpt ?? preview(article.body)}</p>
              </Link>
            ))}
          </div>
        </div>
      </section>
    </main>
  );
}

function preview(value: string) {
  return value.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim().slice(0, 160);
}
