import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { apiGet, type ApiKnowledgebaseArticle } from "../../../../lib/api";
import { getLocale } from "../../../../lib/i18n";
import styles from "../knowledgebase.module.css";

export async function generateMetadata({ params }: { params: Promise<{ locale: string; slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const article = await apiGet<ApiKnowledgebaseArticle>(`/knowledgebase/${slug}`);
  return {
    description: article?.seoDescription ?? article?.excerpt ?? preview(article?.body ?? ""),
    openGraph: { title: article?.seoTitle ?? article?.title },
    title: article ? `${article.seoTitle ?? article.title} | Dezhost` : "Knowledgebase | Dezhost"
  };
}

export default async function KnowledgebaseArticlePage({ params }: { params: Promise<{ locale: string; slug: string }> }) {
  const { locale: rawLocale, slug } = await params;
  getLocale(rawLocale);
  const article = await apiGet<ApiKnowledgebaseArticle>(`/knowledgebase/${slug}`);
  if (!article) {
    notFound();
  }

  return (
    <main className="container">
      <article className={styles.article}>
        <a href={`/${rawLocale}/knowledgebase`}>Knowledgebase</a>
        <h1>{article.title}</h1>
        {article.excerpt ? <p>{article.excerpt}</p> : null}
        <div className={styles.body} dangerouslySetInnerHTML={{ __html: article.body }} />
      </article>
    </main>
  );
}

function preview(value: string) {
  return value.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim().slice(0, 150);
}
