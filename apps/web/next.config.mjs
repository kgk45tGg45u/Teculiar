import { fileURLToPath } from "url";
import path from "path";

const __dirname = fileURLToPath(new URL(".", import.meta.url));

// Hosted dashboards (admin + client). Served at the tenant subdomain alongside the API, so browser
// calls are same-origin `/api`. Locally the API runs on a separate port, so we proxy `/api` + `/uploads`
// to it (matching the prod same-origin model). `DASHBOARD_ASSET_PREFIX` lets the storefront's reverse
// proxy load these assets from the dashboards' own origin instead of the storefront's `/_next`.
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
