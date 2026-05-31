/** @type {import('next').NextConfig} */
const nextConfig = {
  // Allow 127.0.0.1 access to dev resources so Playwright E2E tests
  // can load client-side bundles (otherwise Next.js blocks them as cross-origin).
  allowedDevOrigins: ["127.0.0.1", "localhost"],
  typedRoutes: true
};

export default nextConfig;
