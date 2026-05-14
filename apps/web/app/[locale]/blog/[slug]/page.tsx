import type { Metadata, Route } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { apiGet, type ApiBlogPost } from "../../../../lib/api";
import { getLocale } from "../../../../lib/i18n";
import styles from "../blog.module.css";

export async function generateMetadata({ params }: { params: Promise<{ locale: string; slug: string }> }): Promise<Metadata> {
  const { locale: rawLocale, slug } = await params;
  const locale = getLocale(rawLocale);
  const post = await apiGet<ApiBlogPost>(`/cms/posts/${locale}/${slug}`);
  return {
    description: post?.excerpt ?? post?.content?.body?.replace(/<[^>]+>/g, "").slice(0, 150),
    openGraph: {
      images: post?.featureImage ?? post?.content?.featureImage ? [post.featureImage ?? post.content?.featureImage ?? ""] : undefined,
      title: post?.title
    },
    title: post ? `${post.title} | Dezhost` : "Blog | Dezhost"
  };
}

export default async function BlogPostPage({ params }: { params: Promise<{ locale: string; slug: string }> }) {
  const { locale: rawLocale, slug } = await params;
  const locale = getLocale(rawLocale);
  const post = await apiGet<ApiBlogPost>(`/cms/posts/${locale}/${slug}`);

  if (!post) {
    notFound();
  }

  const featureImage = post.featureImage ?? post.content?.featureImage ?? post.content?.images?.[0];
  const tags = post.tags ?? post.content?.tags ?? [];

  return (
    <article>
      <section className={styles.postHero}>
        <div className="container">
          <h1>{post.title}</h1>
          {post.excerpt ? <p>{post.excerpt}</p> : null}
          {tags.length ? (
            <div className={styles.tagRow}>
              {tags.map((tag) => (
                <Link href={`/${locale}/blog/tag/${encodeURIComponent(tag)}` as Route} key={tag}>
                  {tag}
                </Link>
              ))}
            </div>
          ) : null}
          {featureImage ? <img alt="" className={styles.heroImage} src={featureImage} /> : null}
        </div>
      </section>
      <div className="container">
        <div className={`section tight ${styles.postArticle}`}>
          <div className={styles.postBody} dangerouslySetInnerHTML={{ __html: post.content?.body ?? "" }} />
        </div>
      </div>
    </article>
  );
}
