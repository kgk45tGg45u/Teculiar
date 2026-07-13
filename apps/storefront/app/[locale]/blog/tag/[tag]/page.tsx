import Link from "next/link";
import type { Metadata, Route } from "next";
import { ArrowRight, Tag } from "lucide-react";
import { apiGet, type ApiBlogPost } from "@teculiar/web-core/lib/api";
import { getLocale } from "@teculiar/web-core/lib/i18n";
import styles from "../../blog.module.css";

export async function generateMetadata({ params }: { params: Promise<{ locale: string; tag: string }> }): Promise<Metadata> {
  const { locale: rawLocale, tag: rawTag } = await params;
  const locale = getLocale(rawLocale);
  const tag = decodeURIComponent(rawTag);
  return {
    description: locale === "de" ? `Artikel mit dem Tag ${tag}.` : `Articles tagged ${tag}.`,
    title: tag
  };
}

export default async function BlogTagPage({ params }: { params: Promise<{ locale: string; tag: string }> }) {
  const { locale: rawLocale, tag: rawTag } = await params;
  const locale = getLocale(rawLocale);
  const tag = decodeURIComponent(rawTag);
  const posts = (await apiGet<ApiBlogPost[]>(`/cms/posts?locale=${locale}&tag=${encodeURIComponent(tag)}`)) ?? [];
  const isDe = locale === "de";

  return (
    <>
      <section className={styles.hero}>
        <div className="container">
          <span className="eyebrow"><Tag aria-hidden size={15} /> Tag</span>
          <h1>{tag}</h1>
          <p>{isDe ? "Alle Artikel mit diesem Tag." : "All articles with this tag."}</p>
        </div>
      </section>
      <section className="section tight">
        <div className="container">
          <div className={styles.postGrid}>
            {posts.map((post) => {
              const featureImage = post.featureImage ?? post.content?.featureImage ?? post.content?.images?.[0];
              return (
                <Link className={styles.postCard} href={`/${locale}/blog/${post.slug}` as Route} key={post.id}>
                  {featureImage ? <img alt="" className={styles.postImage} src={featureImage} /> : null}
                  <div className={styles.postMeta}>
                    <span className={styles.postCategory}>{post.category ?? post.content?.category ?? "Blog"}</span>
                    <span className={styles.postDate}>{dateLabel(post.publishedAt)}</span>
                  </div>
                  <h2>{post.title}</h2>
                  <p>{post.excerpt ?? (isDe ? "Artikel lesen." : "Read article.")}</p>
                  <span className={styles.readMore}>{isDe ? "Weiterlesen" : "Read more"} <ArrowRight aria-hidden size={14} /></span>
                </Link>
              );
            })}
          </div>
        </div>
      </section>
    </>
  );
}

function dateLabel(value?: string | null) {
  return value ? new Intl.DateTimeFormat("de-DE", { dateStyle: "medium" }).format(new Date(value)) : "";
}
