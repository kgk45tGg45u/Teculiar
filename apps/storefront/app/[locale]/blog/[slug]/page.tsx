import type { Metadata, Route } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { apiGet, type ApiBlogPost } from "@dezhost/web-core/lib/api";
import { getLocale } from "@dezhost/web-core/lib/i18n";
import styles from "../blog.module.css";

export async function generateMetadata({ params }: { params: Promise<{ locale: string; slug: string }> }): Promise<Metadata> {
  const { locale: rawLocale, slug } = await params;
  const locale = getLocale(rawLocale);
  const [post, settings] = await Promise.all([
    apiGet<ApiBlogPost>(`/cms/posts/${locale}/${slug}`),
    apiGet<{ siteName?: string; ogTitleSuffix?: string; ogImageBlog?: string }>("/storefront/settings")
  ]);
  const featureImage = post?.featureImage ?? post?.content?.featureImage ?? post?.content?.images?.[0];
  const ogImage = featureImage || settings?.ogImageBlog;
  const siteName = settings?.siteName || "Dezhost";
  const description = post?.excerpt ?? post?.content?.body?.replace(/<[^>]+>/g, "").slice(0, 155) ?? undefined;
  return {
    description,
    title: post?.title ?? "Blog",
    openGraph: {
      images: ogImage ? [{ url: ogImage, width: 1200, height: 630, alt: post?.title ?? siteName }] : undefined,
      title: post?.title ?? "Blog",
      type: "article"
    },
    twitter: {
      card: "summary_large_image",
      images: ogImage ? [ogImage] : undefined
    }
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
          {featureImage ? <img alt={post.title} className={styles.heroImage} src={featureImage} /> : null}
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
