import Link from "next/link";
import type { Route } from "next";
import { apiGet, type ApiBlogPost } from "../../../lib/api";
import { getLocale } from "../../../lib/i18n";
import styles from "../product-pages.module.css";

export default async function BlogPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale: rawLocale } = await params;
  const locale = getLocale(rawLocale);
  const isDe = locale === "de";
  const posts = (await apiGet<ApiBlogPost[]>(`/cms/posts?locale=${locale}`)) ?? [];

  return (
    <section className={styles.hero}>
      <div className="container">
        <span className="eyebrow">CMS</span>
        <h1>{isDe ? "Blog und Landingpages mit Übersetzungen." : "Blog and landing pages with translations."}</h1>
        <div className={styles.pricingGrid}>
          {posts.map((post) => (
            <Link className={styles.price} href={`/${locale}/blog/${post.slug}` as Route} key={post.id}>
              <h2>{post.title}</h2>
              <p>{post.excerpt ?? (isDe ? "Artikel lesen." : "Read article.")}</p>
            </Link>
          ))}
          {!posts.length ? <p>{isDe ? "Noch keine Artikel." : "No articles yet."}</p> : null}
        </div>
      </div>
    </section>
  );
}
