import Link from "next/link";
import { getLocale } from "../../../lib/i18n";
import styles from "../product-pages.module.css";

export default function BlogPage({ params }: { params: { locale: string } }) {
  const locale = getLocale(params.locale);
  const isDe = locale === "de";
  const posts = [
    isDe ? "EU-Reverse-Charge in Hosting-Rechnungen" : "EU reverse charge in hosting invoices",
    isDe ? "Warum Provider-Adapter technische Schulden reduzieren" : "Why provider adapters reduce technical debt",
    isDe ? "TOTP als Standard für Kundenportale" : "TOTP as a default for customer portals"
  ];

  return (
    <section className={styles.hero}>
      <div className="container">
        <span className="eyebrow">CMS</span>
        <h1>{isDe ? "Blog und Landingpages mit Übersetzungen." : "Blog and landing pages with translations."}</h1>
        <div className={styles.pricingGrid}>
          {posts.map((post) => (
            <Link className={styles.price} href={`/${locale}/blog/${post.toLowerCase().replaceAll(" ", "-")}`} key={post}>
              <h2>{post}</h2>
              <p>{isDe ? "SEO-Metadaten, Slug-Routing und manuelle Überschreibungen." : "SEO metadata, slug routing, and manual overrides."}</p>
            </Link>
          ))}
        </div>
      </div>
    </section>
  );
}
