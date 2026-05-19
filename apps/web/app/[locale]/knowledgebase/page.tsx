import type { Metadata, Route } from "next";
import Link from "next/link";
import { BookOpen } from "lucide-react";
import { apiGet, type ApiKnowledgebaseArticle } from "../../../lib/api";
import { getLocale } from "../../../lib/i18n";
import styles from "./knowledgebase.module.css";

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale: rawLocale } = await params;
  const locale = getLocale(rawLocale);
  return {
    description: locale === "de" ? "Hilfecenter mit Artikeln zu Hosting, Domains und IT Services." : "Help center articles for hosting, domains, and IT services.",
    title: "Knowledgebase | Dezhost"
  };
}

export default async function KnowledgebasePage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale: rawLocale } = await params;
  const locale = getLocale(rawLocale);
  const articles = (await apiGet<ApiKnowledgebaseArticle[]>("/knowledgebase")) ?? [];

  return (
    <main>
      <section className={styles.hero}>
        <div className="container">
          <span className="eyebrow"><BookOpen aria-hidden size={15} /> Knowledgebase</span>
          <h1>{locale === "de" ? "Antworten, bevor ein Ticket noetig ist." : "Answers before a ticket is needed."}</h1>
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
