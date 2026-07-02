import { fileURLToPath } from "url";
import path from "path";

const __dirname = fileURLToPath(new URL(".", import.meta.url));

// Hosted dashboards (admin + client). Served at the tenant subdomain alongside the API, so browser
// calls are same-origin `/api`. Locally the API runs on a separate port, so we proxy `/api` + `/uploads`
// to it (matching the prod same-origin model).
//
// `DASHBOARD_ASSET_PREFIX` = a PATH (e.g. `/_dash`) set in production. It moves this app's bundles to
// `/_dash/_next/...` so they never collide with the storefront's own `/_next` when the storefront
// reverse-proxies `/admin` + `/client`. That keeps the buyer's site fully white-label: dashboard assets
// load same-origin from `theirdomain.com/_dash/...` (the storefront forwards it), never from teculiar.net.
// Leave it UNSET locally (assets stay at `/_next`, so hitting :3000 directly still works).
const stripSlash = (value) => value.replace(/\/+$/, "");
const API_ORIGIN = stripSlash(process.env.API_INTERNAL_URL ?? "http://127.0.0.1:4000");

/** @type {import('next').NextConfig} */
const nextConfig = {
  allowedDevOrigins: ["127.0.0.1", "localhost"],
  // Off: shared header/footer link to storefront routes (/, /de/…) that live in the other app.
  typedRoutes: false,
  assetPrefix: process.env.DASHBOARD_ASSET_PREFIX || undefined,
  // web-core is a source workspace package (React/CSS-module components); transpile it like app code.
  transpilePackages: ["@dezhost/web-core"],
  output: "standalone",
  outputFileTracingRoot: path.join(__dirname, "../../"),
  async rewrites() {
    return [
      { source: "/api/:path*", destination: `${API_ORIGIN}/api/:path*` },
      { source: "/uploads/:path*", destination: `${API_ORIGIN}/uploads/:path*` }
    ];
  }
};

export default nextConfig;
