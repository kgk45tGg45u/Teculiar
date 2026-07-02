import { fileURLToPath } from "url";
import path from "path";

const __dirname = fileURLToPath(new URL(".", import.meta.url));

// The downloaded Blue storefront is a thin, presentational app. It reverse-proxies the hosted
// parts back to the tenant's Teculiar upstream so the browser only ever talks to its OWN origin
// (same-origin `/api`, no CORS, no build-time API URL baking — one artifact serves every tenant):
//   TECULIAR_UPSTREAM      → the tenant origin, e.g. https://dezhost.teculiar.net (dashboards + API)
//   TECULIAR_API_UPSTREAM  → optional override for /api + /uploads (used locally, where the API and
//                            the dashboards run on different ports)
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
