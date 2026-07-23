import { NextResponse } from "next/server";

// Phase 8.3 — an XSL stylesheet so /sitemap.xml renders as a readable table in a browser instead of
// raw XML. Referenced by the sitemap's <?xml-stylesheet?> PI. Crawlers ignore it; humans get a
// styled, sortable-looking list. Self-contained (inline CSS) — no external assets.
const XSL = `<?xml version="1.0" encoding="UTF-8"?>
<xsl:stylesheet version="1.0"
  xmlns:xsl="http://www.w3.org/1999/XSL/Transform"
  xmlns:s="http://www.sitemaps.org/schemas/sitemap/0.9">
  <xsl:output method="html" encoding="UTF-8" indent="yes"/>
  <xsl:template match="/">
    <html lang="en">
      <head>
        <meta charset="UTF-8"/>
        <meta name="robots" content="noindex"/>
        <title>XML Sitemap</title>
        <style>
          :root { color-scheme: light dark; }
          body { font-family: system-ui, -apple-system, Segoe UI, Roboto, sans-serif; margin: 0; padding: 2rem; background: #f6f8fa; color: #1a1a2e; }
          @media (prefers-color-scheme: dark) { body { background: #10131a; color: #e6e9ef; } }
          h1 { font-size: 1.4rem; margin: 0 0 .25rem; }
          p.intro { margin: 0 0 1.5rem; color: #5a6472; }
          @media (prefers-color-scheme: dark) { p.intro { color: #97a1b0; } }
          table { border-collapse: collapse; width: 100%; background: #fff; border-radius: 8px; overflow: hidden; box-shadow: 0 1px 3px rgba(0,0,0,.08); }
          @media (prefers-color-scheme: dark) { table { background: #1a1f2b; } }
          th, td { text-align: left; padding: .55rem .8rem; border-bottom: 1px solid rgba(128,128,128,.18); font-size: .88rem; }
          th { background: #0077b6; color: #fff; font-weight: 600; }
          td a { color: #0077b6; text-decoration: none; word-break: break-all; }
          @media (prefers-color-scheme: dark) { td a { color: #4aa8e0; } }
          td a:hover { text-decoration: underline; }
          tr:hover td { background: rgba(0,119,182,.06); }
          .num { color: #8a94a3; font-variant-numeric: tabular-nums; }
        </style>
      </head>
      <body>
        <h1>XML Sitemap</h1>
        <p class="intro">
          <xsl:value-of select="count(s:urlset/s:url)"/> URLs. This file is for search engines; the
          stylesheet is only for humans viewing it in a browser.
        </p>
        <table>
          <tr>
            <th>#</th><th>URL</th><th>Last modified</th><th>Change freq.</th><th>Priority</th>
          </tr>
          <xsl:for-each select="s:urlset/s:url">
            <tr>
              <td class="num"><xsl:value-of select="position()"/></td>
              <td><a href="{s:loc}"><xsl:value-of select="s:loc"/></a></td>
              <td><xsl:value-of select="s:lastmod"/></td>
              <td><xsl:value-of select="s:changefreq"/></td>
              <td class="num"><xsl:value-of select="s:priority"/></td>
            </tr>
          </xsl:for-each>
        </table>
      </body>
    </html>
  </xsl:template>
</xsl:stylesheet>`;

export const revalidate = 86400;

export function GET() {
  return new NextResponse(XSL, {
    headers: {
      "Content-Type": "text/xsl; charset=utf-8",
      "Cache-Control": "public, max-age=86400"
    }
  });
}
