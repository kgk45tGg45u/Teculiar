import { notFound } from "next/navigation";
import { apiGet, type ApiBlogPost } from "../../../../lib/api";
import { getLocale } from "../../../../lib/i18n";
import styles from "../../product-pages.module.css";

export default async function BlogPostPage({ params }: { params: Promise<{ locale: string; slug: string }> }) {
  const { locale: rawLocale, slug } = await params;
  const locale = getLocale(rawLocale);
  const post = await apiGet<ApiBlogPost>(`/cms/pages/${locale}/${slug}`);

  if (!post) {
    notFound();
  }

  return (
    <article className={styles.hero}>
      <div className="container">
        <span className="eyebrow">Blog</span>
        <h1>{post.title}</h1>
        {post.excerpt ? <p>{post.excerpt}</p> : null}
        {(post.content?.images ?? []).map((image) => <img alt="" key={image} src={image} />)}
        <div dangerouslySetInnerHTML={{ __html: post.content?.body ?? "" }} />
      </div>
    </article>
  );
}
