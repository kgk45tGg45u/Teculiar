import { NextResponse } from "next/server";

const SITE_URL = (process.env.NEXT_PUBLIC_WEB_URL ?? process.env.SITE_URL ?? "https://dezhost.com").replace(/\/$/, "");
const API_URL = (process.env.NEXT_PUBLIC_API_URL ?? "http://127.0.0.1:4000/api/v1").replace(/\/$/, "");

const STATIC_PATHS = [
  "",
  "/domains",
  "/domains/pricing",
  "/hosting",
  "/webhosting",
  "/virtual-servers",
  "/vps",
  "/webdesign",
  "/it-losungen",
  "/blog",
  "/uber-uns",
  "/kontakt",
  "/knowledgebase",
  "/legal/agb",
  "/legal/datenschutz",
  "/legal/impressum"
];

export const revalidate = 3600;

export async function GET() {
  const now = new Date().toISOString().slice(0, 10);
  const locales = ["de", "en"];
  const urls: string[] = [];

  for (const locale of locales) {
    for (const path of STATIC_PATHS) {
      urls.push(
        `  <url><loc>${SITE_URL}/${locale}${path}</loc><lastmod>${now}</lastmod>` +
          `<changefreq>weekly</changefreq><priority>${path === "" ? "1.0" : "0.8"}</priority></url>`
      );
    }
  }

  const [dePosts, enPosts] = await Promise.all([
    fetchPosts("de"),
    fetchPosts("en")
  ]);

  for (const post of dePosts) {
    const lastmod = post.publishedAt ? String(post.publishedAt).slice(0, 10) : now;
    urls.push(`  <url><loc>${SITE_URL}/de/blog/${post.slug}</loc><lastmod>${lastmod}</lastmod><changefreq>monthly</changefreq><priority>0.6</priority></url>`);
  }
  for (const post of enPosts) {
    const lastmod = post.publishedAt ? String(post.publishedAt).slice(0, 10) : now;
    urls.push(`  <url><loc>${SITE_URL}/en/blog/${post.slug}</loc><lastmod>${lastmod}</lastmod><changefreq>monthly</changefreq><priority>0.6</priority></url>`);
  }

  const xml = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
    ...urls,
    "</urlset>"
  ].join("\n");

  return new NextResponse(xml, {
    headers: {
      "Content-Type": "application/xml",
      "Cache-Control": "public, max-age=3600, stale-while-revalidate=86400"
    }
  });
}

async function fetchPosts(locale: string): Promise<Array<{ slug: string; publishedAt?: string | null }>> {
  try {
    const res = await fetch(`${API_URL}/cms/posts?locale=${locale}`, {
      next: { revalidate: 3600 }
    });
    if (!res.ok) return [];
    const data = await res.json();
    return Array.isArray(data) ? data : [];
  } catch {
    return [];
  }
}
