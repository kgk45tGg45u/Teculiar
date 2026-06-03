import { fileURLToPath } from "url";
import path from "path";

const __dirname = fileURLToPath(new URL(".", import.meta.url));

/** @type {import('next').NextConfig} */
const nextConfig = {
  // Allow 127.0.0.1 access to dev resources so Playwright E2E tests
  // can load client-side bundles (otherwise Next.js blocks them as cross-origin).
  allowedDevOrigins: ["127.0.0.1", "localhost"],
  typedRoutes: true,
  // Standalone output for Docker — traces and bundles only what's needed.
  // outputFileTracingRoot must point to the monorepo root so the shared
  // package (@dezhost/shared) is included in the trace.
  output: "standalone",
  outputFileTracingRoot: path.join(__dirname, "../../")
};

export default nextConfig;
