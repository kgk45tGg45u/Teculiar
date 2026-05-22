import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const dashboardUrl = new URL("../components/portal/client-dashboard.tsx", import.meta.url);
const dashboardCssUrl = new URL("../components/portal/client-dashboard.module.css", import.meta.url);
const statusCssUrl = new URL("../components/ui/status-pill.module.css", import.meta.url);

test("client dashboard keeps content bounded with fixed metric cards and one bottom feed", async () => {
  const css = await readFile(dashboardCssUrl, "utf8");
  const source = await readFile(dashboardUrl, "utf8");

  assert.match(css, /\.page\s*\{[\s\S]*padding-right:\s*clamp\(18px, 2vw, 32px\)/);
  assert.match(css, /\.main\s*\{[\s\S]*max-width:\s*1680px/);
  assert.match(css, /\.main\s*\{[\s\S]*padding:\s*clamp\(18px, 2vw, 24px\) 0 32px/);
  assert.match(css, /\.overviewGrid\s*\{[\s\S]*grid-template-columns:\s*repeat\(4, 190px\)/);
  assert.match(css, /\.overviewGrid\s*\{[\s\S]*justify-content:\s*space-between/);
  assert.match(css, /\.overviewGrid\s*\{[\s\S]*width:\s*min\(100%, 980px\)/);
  assert.match(css, /\.overviewGrid\s*:global\(\.metric\)\s*\{[\s\S]*aspect-ratio:\s*1\.04 \/ 1/);
  assert.match(source, /<DashboardKnowledgeFeed/);
  assert.match(source, /Announcements and Knowledgebase articles/);
  assert.match(css, /\.dashboardFeed\s*\{[\s\S]*width:\s*min\(100%, 980px\)/);
});

test("client dashboard has professional loading state for counters and heavy panes", async () => {
  const source = await readFile(dashboardUrl, "utf8");
  const css = await readFile(dashboardCssUrl, "utf8");

  assert.match(source, /type LoadingKey = "services" \| "invoices" \| "tickets" \| "knowledgebase" \| "announcements" \| "profile"/);
  assert.match(source, /const \[loading, setLoading\] = useState/);
  assert.match(source, /<MetricValue loading=\{loading\.services\}/);
  assert.match(source, /<LoadingSpinner label="Loading services" \/>/);
  assert.match(source, /<LoadingBlock title="Invoice" \/>/);
  assert.match(css, /\.spinner\s*\{[\s\S]*animation:\s*portal-spin 780ms linear infinite/);
  assert.match(css, /@keyframes portal-spin/);
});

test("client dashboard loaders use cache and timeout fallback so navigation cannot spin forever", async () => {
  const source = await readFile(dashboardUrl, "utf8");

  assert.match(source, /const PORTAL_LOADING_TIMEOUT_MS = 4500/);
  assert.match(source, /const portalDataCache: PortalDataCache = \{\}/);
  assert.match(source, /function usePortalLoadingFallback/);
  assert.match(source, /window\.setTimeout\(\(\) => setLoading\(allLoaded\), PORTAL_LOADING_TIMEOUT_MS\)/);
  assert.match(source, /function applyPortalCache/);
  assert.match(source, /function fetchPortalJson/);
  assert.match(source, /AbortController/);
  assert.match(source, /controller\.abort\(\)/);
});

test("service pages probe hosting status once and show the ordered domain in detail", async () => {
  const source = await readFile(dashboardUrl, "utf8");

  assert.match(source, /function serviceListUrl/);
  assert.match(source, /view === "services" && !serviceId/);
  assert.match(source, /\/services\?refresh=1/);
  assert.match(source, /function serviceDetailUrl/);
  assert.match(source, /\/services\/\$\{serviceId\}\?refresh=1/);
  assert.doesNotMatch(source, /setInterval\(loadServices/);
  assert.match(source, /<span>Domain<\/span>/);
  assert.match(source, /serviceDomainLabel\(service\)/);
  assert.match(source, /service\?\.product\.type === "SHARED_HOSTING" && service\.status === "ACTIVE"/);
});

test("service list subtitle is hosting domain, not duplicated hosting label", async () => {
  const source = await readFile(dashboardUrl, "utf8");

  assert.match(source, /function primaryServiceDomain\(service: ApiService\)/);
  assert.match(source, /return primaryServiceDomain\(service\) \?\? ""/);
  assert.doesNotMatch(source, /\$\{service\.product\.name\} Hosting/);
});

test("invoice list and detail use formal paper layout and calmer actions", async () => {
  const source = await readFile(dashboardUrl, "utf8");
  const css = await readFile(dashboardCssUrl, "utf8");
  const statusCss = await readFile(statusCssUrl, "utf8");

  assert.match(source, /className=\{styles\.invoicePaper\}/);
  assert.match(source, /className=\{styles\.invoiceActionBar\}/);
  assert.match(source, /Download PDF/);
  assert.match(source, /HTML ansehen/);
  assert.match(css, /\.invoicePaper\s*\{/);
  assert.match(css, /\.invoiceActionBar\s*\{/);
  assert.match(css, /\.invoiceListStatus\s*\{/);
  assert.match(statusCss, /\.pill\s*\{[\s\S]*letter-spacing:\s*0/);
});

test("support tickets render as clickable cards and thread messages as conversation containers", async () => {
  const source = await readFile(dashboardUrl, "utf8");
  const css = await readFile(dashboardCssUrl, "utf8");

  assert.match(source, /className=\{styles\.ticketCards\}/);
  assert.match(source, /className=\{styles\.ticketCard\}/);
  assert.match(source, /href=\{`\/client\/tickets\/\$\{ticket\.id\}`\}/);
  assert.match(source, /function TicketMessage/);
  assert.match(source, /<TicketMessage/);
  assert.match(source, /Close Ticket/);
  assert.match(css, /\.ticketCards\s*\{/);
  assert.match(css, /\.ticketCard\s*\{/);
  assert.match(css, /\.ticketMessage\s*\{/);
  assert.match(css, /\.attachmentLinks\s*\{/);
});
