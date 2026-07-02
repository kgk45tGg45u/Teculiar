import { fileURLToPath } from "url";
import path from "path";

const __dirname = fileURLToPath(new URL(".", import.meta.url));

// The downloaded Blue storefront is a thin, presentational app that renders marketing pages and posts
// orders to the hosted API. The hosted parts (/admin, /client, /login, /api, /uploads, /_dash) are
// REVERSE-PROXIED (never 302-redirected) to the tenant's Teculiar upstream, so the browser only ever
// talks to its OWN origin — the URL bar stays `theirdomain.com/client`, never `theirdomain.teculiar.net`.
// This is the white-label guarantee.
//
// IMPORTANT: in PRODUCTION that reverse-proxying is done by the reverse proxy in front of the site
// (Apache on the buyer's box — see docs/teculiar-operations.md), NOT by these Next `rewrites`. Next
// bakes `rewrites` into the standalone build, so a runtime `TECULIAR_UPSTREAM` would not change them.
// The `rewrites` below are a LOCAL-DEV convenience for `next dev` (config re-read each request), letting
// one machine run storefront:3001 + dashboards:3000 + api:4000 with same-origin `/api`. In production
// Apache intercepts those paths before they ever reach this app, so the baked dev defaults are unused.
const stripSlash = (value) => value.replace(/\/+$/, "");
const DASH_UPSTREAM = stripSlash(process.env.TECULIAR_UPSTREAM ?? "http://127.0.0.1:3000");
const API_UPSTREAM = stripSlash(process.env.TECULIAR_API_UPSTREAM ?? process.env.TECULIAR_UPSTREAM ?? "http://127.0.0.1:4000");

/** @type {import('next').NextConfig} */
const nextConfig = {
  allowedDevOrigins: ["127.0.0.1", "localhost"],
  // Off: the storefront links to hosted routes (/client, /login, …) that live in the dashboards app,
  // so they are not part of this app's typed route table.
  typedRoutes: false,
  // web-core is a source workspace package (React/CSS-module components); transpile it like app code.
  transpilePackages: ["@dezhost/web-core"],
  output: "standalone",
  outputFileTracingRoot: path.join(__dirname, "../../"),
  async rewrites() {
    return [
      { source: "/api/:path*", destination: `${API_UPSTREAM}/api/:path*` },
      { source: "/uploads/:path*", destination: `${API_UPSTREAM}/uploads/:path*` },
      // Hosted dashboard bundles (assetPrefix=/_dash) — forwarded verbatim, same-origin (white-label).
      { source: "/_dash/:path*", destination: `${DASH_UPSTREAM}/_dash/:path*` },
      { source: "/admin", destination: `${DASH_UPSTREAM}/admin` },
      { source: "/admin/:path*", destination: `${DASH_UPSTREAM}/admin/:path*` },
      { source: "/client", destination: `${DASH_UPSTREAM}/client` },
      { source: "/client/:path*", destination: `${DASH_UPSTREAM}/client/:path*` },
      { source: "/login", destination: `${DASH_UPSTREAM}/login` },
      { source: "/reset-password", destination: `${DASH_UPSTREAM}/reset-password` }
    ];
  }
};

export default nextConfig;
