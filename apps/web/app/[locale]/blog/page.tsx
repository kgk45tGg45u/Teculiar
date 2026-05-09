import Link from "next/link";
import type { Route } from "next";
import { ArrowRight, BookOpen, Mail } from "lucide-react";
import { apiGet, type ApiBlogPost } from "../../../lib/api";
import { Button } from "../../../components/ui/button";
import { getLocale } from "../../../lib/i18n";
import styles from "./blog.module.css";

export default async function BlogPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale: rawLocale } = await params;
  const locale = getLocale(rawLocale);
  const isDe = locale === "de";
  const posts = (await apiGet<ApiBlogPost[]>(`/cms/posts?locale=${locale}`)) ?? [];

  const categories = isDe
    ? ["Alle", "Vereinsdigitalisierung", "Domains & E-Mail", "Datenschutz", "WordPress", "Nextcloud", "Linux & Hosting", "KI für Organisationen", "Tutorials", "Open Source"]
    : ["All", "Association digitalisation", "Domains & Email", "Privacy", "WordPress", "Nextcloud", "Linux & Hosting", "AI for organisations", "Tutorials", "Open Source"];

  const placeholderPosts = isDe
    ? [
        { title: "Wie Vereine ihre erste Website erstellen", category: "Vereinsdigitalisierung", excerpt: "Schritt für Schritt erklärt – von der Domain bis zur fertigen Website.", date: "Mai 2026" },
        { title: "Was ist eine Domain und warum brauche ich eine?", category: "Domains & E-Mail", excerpt: "Einfach erklärt: Was Domains sind, wie sie funktionieren und wie du die richtige wählst.", date: "Mai 2026" },
        { title: "DSGVO für Vereine: Was ihr wissen müsst", category: "Datenschutz", excerpt: "Datenschutz muss nicht kompliziert sein. Wir erklären die wichtigsten Punkte für kleine Organisationen.", date: "April 2026" },
        { title: "WordPress vs. statische Website: Was passt zu dir?", category: "WordPress", excerpt: "Beide haben Vor- und Nachteile. Wir helfen dir, die richtige Entscheidung zu treffen.", date: "April 2026" },
        { title: "Nextcloud einrichten: Deine eigene Cloud", category: "Nextcloud", excerpt: "Datenschutzfreundliche Alternative zu Google Drive – so richtest du Nextcloud ein.", date: "März 2026" },
        { title: "KI-Tools für Vereine: Was wirklich hilft", category: "KI für Organisationen", excerpt: "Welche KI-Tools Vereinen wirklich nützen – und welche ihr ignorieren könnt.", date: "März 2026" }
      ]
    : [
        { title: "How associations create their first website", category: "Association digitalisation", excerpt: "Step by step – from domain to finished website.", date: "May 2026" },
        { title: "What is a domain and why do I need one?", category: "Domains & Email", excerpt: "Simply explained: what domains are, how they work and how to choose the right one.", date: "May 2026" },
        { title: "GDPR for associations: what you need to know", category: "Privacy", excerpt: "Privacy doesn't have to be complicated. We explain the key points for small organisations.", date: "April 2026" },
        { title: "WordPress vs. static website: what fits you?", category: "WordPress", excerpt: "Both have pros and cons. We help you make the right decision.", date: "April 2026" },
        { title: "Setting up Nextcloud: your own cloud", category: "Nextcloud", excerpt: "Privacy-friendly alternative to Google Drive – how to set up Nextcloud.", date: "March 2026" },
        { title: "AI tools for associations: what actually helps", category: "AI for organisations", excerpt: "Which AI tools really benefit associations – and which you can ignore.", date: "March 2026" }
      ];

  const displayPosts = posts.length > 0 ? null : placeholderPosts;

  return (
    <>
      {/* Hero */}
      <section className={styles.hero}>
        <div className="container">
          <span className="eyebrow">
            <BookOpen aria-hidden size={15} />
            Blog
          </span>
          <h1>
            {isDe
              ? "Wissen, das wirklich hilft."
              : "Knowledge that actually helps."}
          </h1>
          <p>
            {isDe
              ? "Artikel über Webhosting, Domains, Datenschutz, WordPress und digitale Werkzeuge für Vereine und kleine Organisationen. Verständlich geschrieben, ohne Fachwissen."
              : "Articles about web hosting, domains, privacy, WordPress and digital tools for associations and small organisations. Written clearly, without expertise required."}
          </p>
        </div>
      </section>

      {/* Categories */}
      <section className={`section tight ${styles.categoriesSection}`}>
        <div className="container">
          <div className={styles.categories}>
            {categories.map((cat) => (
              <button className={styles.categoryBtn} key={cat} type="button">
                {cat}
              </button>
            ))}
          </div>
        </div>
      </section>

      {/* Posts */}
      <section className="section tight">
        <div className="container">
          {posts.length > 0 ? (
            <div className={styles.postGrid}>
              {posts.map((post) => (
                <Link className={styles.postCard} href={`/${locale}/blog/${post.slug}` as Route} key={post.id}>
                  <div className={styles.postMeta}>
                    <span className={styles.postCategory}>Blog</span>
                  </div>
                  <h2>{post.title}</h2>
                  <p>{post.excerpt ?? (isDe ? "Artikel lesen." : "Read article.")}</p>
                  <span className={styles.readMore}>
                    {isDe ? "Weiterlesen" : "Read more"} <ArrowRight aria-hidden size={14} />
                  </span>
                </Link>
              ))}
            </div>
          ) : displayPosts ? (
            <div className={styles.postGrid}>
              {displayPosts.map((post) => (
                <div className={styles.postCard} key={post.title}>
                  <div className={styles.postMeta}>
                    <span className={styles.postCategory}>{post.category}</span>
                    <span className={styles.postDate}>{post.date}</span>
                  </div>
                  <h2>{post.title}</h2>
                  <p>{post.excerpt}</p>
                  <span className={styles.readMore}>
                    {isDe ? "Demnächst verfügbar" : "Coming soon"} <ArrowRight aria-hidden size={14} />
                  </span>
                </div>
              ))}
            </div>
          ) : null}
        </div>
      </section>

      {/* Newsletter CTA */}
      <section className={`section tight ${styles.newsletterSection}`}>
        <div className="container">
          <div className={styles.newsletter}>
            <Mail aria-hidden size={28} />
            <div>
              <h2>{isDe ? "Neue Artikel per E-Mail." : "New articles by email."}</h2>
              <p>
                {isDe
                  ? "Wir schreiben selten, aber wenn, dann mit echtem Mehrwert. Kein Spam, kein Marketing-Blabla."
                  : "We write rarely, but when we do, it's with real value. No spam, no marketing fluff."}
              </p>
            </div>
            <Button href={`/${locale}/kontakt`} icon={ArrowRight} variant="secondary">
              {isDe ? "Newsletter anfragen" : "Request newsletter"}
            </Button>
          </div>
        </div>
      </section>
    </>
  );
}
