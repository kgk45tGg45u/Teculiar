import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

// Phase 2.2 — per-surface subdomain white-label (clean URLs). The edge tags surface hosts with
// X-Teculiar-Surface; the dashboards middleware maps clean browser paths to the internal
// /admin|/client routes; links/redirects are emitted surface-relative so the segment never leaks.

const surface = readFileSync(new URL("../../../packages/web-core/src/lib/surface.ts", import.meta.url), "utf8");
const useSurface = readFileSync(new URL("../../../packages/web-core/src/lib/use-surface-href.ts", import.meta.url), "utf8");
const serverApi = readFileSync(new URL("../../../packages/web-core/src/lib/server-api.ts", import.meta.url), "utf8");
const middleware = readFileSync(new URL("../middleware.ts", import.meta.url), "utf8");
const caddyfile = readFileSync(new URL("../../../deploy/caddy/Caddyfile", import.meta.url), "utf8");
const sidebar = readFileSync(new URL("../components/admin/admin-sidebar.tsx", import.meta.url), "utf8");
const breadcrumbs = readFileSync(new URL("../components/admin/admin-breadcrumbs.tsx", import.meta.url), "utf8");
const loginForm = readFileSync(new URL("../components/auth/login-form.tsx", import.meta.url), "utf8");

// The pure path helpers are TypeScript; mirror their contract here against extracted behaviour.
function sectionOf(path) {
  if (path === "/admin" || path.startsWith("/admin/")) return "admin";
  if (path === "/client" || path.startsWith("/client/")) return "client";
  return null;
}
function inSection(pathname, section) {
  return pathname === `/${section}` || pathname.startsWith(`/${section}/`);
}
function internalPath(pathname, section) {
  if (sectionOf(pathname)) return pathname;
  return pathname === "/" ? `/${section}` : `/${section}${pathname}`;
}
function surfaceHref(currentPathname, target) {
  const section = sectionOf(target);
  if (!section) return target;
  return inSection(currentPathname, section) ? target : target.slice(section.length + 1) || "/";
}

test("surface.ts implements the mirrored path contract", () => {
  // Keep the .mjs mirror and the TS source in sync — these regexes pin the load-bearing lines.
  assert.match(surface, /pathname === "\/" \? `\/\$\{section\}` : `\/\$\{section\}\$\{pathname\}`/);
  assert.match(surface, /target\.slice\(section\.length \+ 1\) \|\| "\/"/);
  assert.match(useSurface, /usePathname\(\) \?\? "\/"/);
});

test("internalPath maps clean surface paths onto the app's section routes", () => {
  assert.equal(internalPath("/", "admin"), "/admin");
  assert.equal(internalPath("/settings", "admin"), "/admin/settings");
  assert.equal(internalPath("/login", "admin"), "/admin/login");
  // Already-prefixed (apex-path host or legacy link on a surface host) passes through.
  assert.equal(internalPath("/admin/settings", "admin"), "/admin/settings");
  assert.equal(internalPath("/client/invoices", "client"), "/client/invoices");
  assert.equal(internalPath("/", "client"), "/client");
});

test("surfaceHref strips the section segment only on clean-URL hosts", () => {
  // Surface host: current path carries no segment → targets lose theirs.
  assert.equal(surfaceHref("/clients", "/admin/clients/new"), "/clients/new");
  assert.equal(surfaceHref("/", "/admin"), "/");
  assert.equal(surfaceHref("/invoices/42", "/client/invoices"), "/invoices");
  // Apex-path host: current path is prefixed → targets stay prefixed.
  assert.equal(surfaceHref("/admin/clients", "/admin/clients/new"), "/admin/clients/new");
  assert.equal(surfaceHref("/client", "/client/invoices"), "/client/invoices");
  // Root-level targets are never touched.
  assert.equal(surfaceHref("/clients", "/reset-password"), "/reset-password");
});

test("middleware rewrites surface hosts and keeps login redirects surface-relative", () => {
  assert.match(middleware, /x-teculiar-surface/);
  assert.match(middleware, /NextResponse\.rewrite/);
  // Guards run against the INTERNAL path, not the browser path.
  assert.match(middleware, /internal\.startsWith\("\/admin"\)/);
  assert.match(middleware, /internal\.startsWith\("\/client"\)/);
  // On a surface host the login page sits at the host root; next stays the clean path.
  assert.match(middleware, /surface \? "\/login" : loginPath/);
  // Root-level pages are never prefixed; client /login stays a root page on client hosts only.
  assert.match(middleware, /ROOT_PAGES = \["\/reset-password", "\/sso"\]/);
  assert.match(middleware, /surface === "client" && \(pathname === "\/login"/);
});

test("edge tags surface hosts with X-Teculiar-Surface instead of path-rewriting", () => {
  assert.match(caddyfile, /request_header @adminHost X-Teculiar-Surface admin/);
  assert.match(caddyfile, /request_header @clientHost X-Teculiar-Surface client/);
  // api. hosts and apex-path hosts must never carry (or keep a spoofed) surface header.
  assert.match(caddyfile, /request_header @apiSurfaceHost -X-Teculiar-Surface/);
  assert.match(caddyfile, /\(tenant_apex_routes\) \{[\s\S]*?request_header -X-Teculiar-Surface/);
  // The old edge-side redirects/rewrites are gone — the app middleware owns the mapping.
  assert.doesNotMatch(caddyfile, /redir @adminRoot|redir @clientRoot|rewrite @adminSurface|rewrite @clientSurface/);
});

test("admin chrome renders surface-relative links and normalized active states", () => {
  assert.match(sidebar, /internalPath\(browserPath, "admin"\)/);
  assert.match(sidebar, /surfaceHref\(browserPath, target\)/);
  assert.match(breadcrumbs, /internalPath\(browserPath, "admin"\)/);
  assert.match(breadcrumbs, /surfaceHref\(browserPath, crumb\.href\)/);
  // Post-login fallback lands on the host root when the section is implied by the host.
  assert.match(loginForm, /hrefForSurface\(surface, admin \? "\/admin" : "\/client"\)/);
  // SSR gates redirect to the surface login, not the hardcoded /admin/login.
  assert.match(serverApi, /x-teculiar-surface.*admin|requestSurface/s);
  assert.match(serverApi, /surfaceHrefMapper/);
});
