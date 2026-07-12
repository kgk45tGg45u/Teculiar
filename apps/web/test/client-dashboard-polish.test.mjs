import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const dashboardUrl = new URL("../components/portal/client-dashboard.tsx", import.meta.url);
const dashboardCssUrl = new URL("../components/portal/client-dashboard.module.css", import.meta.url);
const statusCssUrl = new URL("../../../packages/web-core/src/components/ui/status-pill.module.css", import.meta.url);

test("client dashboard keeps content bounded with fixed metric cards and one bottom feed", async () => {
  const css = await readFile(dashboardCssUrl, "utf8");
  const source = await readFile(dashboardUrl, "utf8");

  assert.match(css, /\.page\s*\{[\s\S]*padding-right:\s*clamp\(18px, 2vw, 32px\)/);
  assert.match(css, /\.main\s*\{[\s\S]*max-width:\s*1680px/);
  assert.match(css, /\.main\s*\{[\s\S]*padding:\s*clamp\(18px, 2vw, 24px\) 0 32px/);
  assert.match(css, /\.overviewGrid\s*\{[\s\S]*grid-template-columns:\s*repeat\(4, minmax\(0, 232px\)\)/);
  assert.match(css, /\.overviewGrid\s*\{[\s\S]*justify-content:\s*space-between/);
  assert.match(css, /\.overviewGrid\s*\{[\s\S]*width:\s*min\(100%, 1040px\)/);
  assert.match(css, /\.overviewCard\s*\{[\s\S]*min-height:\s*184px/);
  assert.match(source, /<DashboardKnowledgeFeed/);
  assert.match(source, /copy\.announcementsAndArticles/);
  assert.match(css, /\.dashboardFeed\s*\{[\s\S]*width:\s*min\(100%, 980px\)/);
});

test("client dashboard metric cards include aligned heads and clickable summary lists", async () => {
  const css = await readFile(dashboardCssUrl, "utf8");
  const source = await readFile(dashboardUrl, "utf8");

  assert.match(source, /const serviceSummaryItems = serviceRows/);
  assert.match(source, /const domainSummaryItems = domainRows/);
  assert.match(source, /const ticketSummaryItems = tickets/);
  assert.match(source, /const invoiceSummaryItems = invoices/);
  assert.match(source, /function DashboardSummaryCard/);
  assert.match(source, /function DashboardSummaryList/);
  assert.match(source, /<DashboardSummaryCard[\s\S]*icon=\{Server\}[\s\S]*label=\{copy\.services\}/);
  assert.match(source, /<article className=\{styles\.overviewCard\}>/);
  assert.doesNotMatch(source, /<article className=\{`metric \$\{styles\.overviewCard\}`\}>/);
  assert.match(source, /className=\{styles\.metricHead\}/);
  assert.match(source, /href: `\/client\/services\/\$\{service\.id\}`/);
  assert.match(source, /href: `\/client\/tickets\/\$\{ticket\.id\}`/);
  assert.match(source, /href: `\/client\/invoices\/\$\{invoice\.id\}`/);
  assert.match(css, /\.overviewCard\s*\{[\s\S]*display:\s*grid[\s\S]*grid-template-columns:\s*1fr[\s\S]*align-content:\s*start[\s\S]*overflow:\s*hidden/);
  assert.match(css, /\.metricHead\s*\{[\s\S]*min-width:\s*0[\s\S]*align-items:\s*center/);
  assert.match(css, /\.metricTitle\s*\{[\s\S]*font-weight:\s*760/);
  assert.match(css, /\.metricBody\s*\{[\s\S]*grid-column:\s*1 \/ -1[\s\S]*width:\s*100%[\s\S]*margin:\s*24px 0 20px[\s\S]*border-top:\s*1px solid var\(--border\)/);
  assert.match(css, /\.metricList\s*\{[\s\S]*list-style:\s*none/);
  assert.match(css, /\.metricList a\s*\{/);
});

test("client dashboard has professional loading state for counters and heavy panes", async () => {
  const source = await readFile(dashboardUrl, "utf8");
  const css = await readFile(dashboardCssUrl, "utf8");

  assert.match(source, /type LoadingKey = "services" \| "invoices" \| "tickets" \| "knowledgebase" \| "announcements" \| "profile"/);
  assert.match(source, /const \[loading, setLoading\] = useState/);
  assert.match(source, /<DashboardSummaryCard[\s\S]*loading=\{loading\.services\}/);
  assert.match(source, /<MetricValue loading=\{loading\}/);
  assert.match(source, /<LoadingSpinner label=\{copy\.loadingServices\} \/>/);
  assert.match(source, /<LoadingBlock title=\{c\.dash\.invoice\} \/>/);
  assert.match(css, /\.spinner\s*\{[\s\S]*animation:\s*portal-spin 780ms linear infinite/);
  assert.match(css, /@keyframes portal-spin/);
});

test("client dashboard loaders recover from both restored and same-document back navigation", async () => {
  const source = await readFile(dashboardUrl, "utf8");

  assert.match(source, /const PORTAL_LOADING_TIMEOUT_MS = 4500/);
  assert.match(source, /const portalDataCache: PortalDataCache = \{\}/);
  assert.match(source, /function usePortalLoadingFallback/);
  assert.match(source, /window\.setTimeout\(\(\) => setLoading\(allLoaded\), PORTAL_LOADING_TIMEOUT_MS\)/);
  assert.match(source, /function applyPortalCache/);
  assert.match(source, /function fetchPortalJson/);
  assert.match(source, /AbortController/);
  assert.match(source, /controller\.abort\(\)/);
  assert.match(source, /function usePortalNavigationRecovery/);
  // Back/forward (incl. bfcache restore) must revalidate IN PLACE, never window.location.reload():
  // the portal SSRs to null until the client auth check runs, so a reload blanks the restored page.
  assert.match(source, /window\.addEventListener\("pageshow", onPageShow\)/);
  assert.match(source, /window\.addEventListener\("popstate", revalidate\)/);
  assert.match(source, /event\.persisted[\s\S]*revalidate\(\)/);
  assert.doesNotMatch(source, /window\.location\.reload\(\)/);
  assert.match(source, /setRefreshVersion\(\(current\) => current \+ 1\)/);
});

test("service table shares overview rows while service detail can refresh hosting status", async () => {
  const source = await readFile(dashboardUrl, "utf8");

  assert.match(source, /function serviceListUrl/);
  assert.match(source, /function serviceListUrl\(\)[\s\S]*return `\$\{API_BASE_URL\}\/services`/);
  assert.match(source, /function serviceDetailUrl/);
  assert.match(source, /\/services\/\$\{serviceId\}\?refresh=1/);
  assert.doesNotMatch(source, /setInterval\(loadServices/);
  assert.match(source, /<span>\{copy\.domain\}<\/span>/);
  assert.match(source, /serviceDomainLabel\(service\)/);
  assert.match(source, /service\?\.product\.type === "SHARED_HOSTING" && service\.status === "ACTIVE"/);
});

test("hosting controls and entry managers are compact responsive panels", async () => {
  const source = await readFile(dashboardUrl, "utf8");
  const css = await readFile(dashboardCssUrl, "utf8");

  assert.match(source, /className=\{styles\.hostingShell\}/);
  assert.match(source, /className=\{styles\.hostingSection\}/);
  assert.match(source, /className=\{styles\.entryActions\}/);
  assert.match(source, /className=\{styles\.entryDelete\}/);
  assert.match(css, /\.hostingShell\s*\{[\s\S]*width:\s*min\(100%, 1040px\)/);
  assert.match(css, /\.controlGrid\s*\{[\s\S]*grid-template-columns:\s*repeat\(auto-fit, minmax\(150px, 1fr\)\)/);
  assert.match(css, /\.entryRow\s*\{[\s\S]*grid-template-columns:\s*minmax\(0, 1fr\) minmax\(220px, auto\)/);
  assert.match(css, /@media \(max-width: 640px\)[\s\S]*\.modal/);
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
  assert.match(source, /copy\.dash\.downloadPdf/);
  assert.match(source, /copy\.dash\.viewHtml/);
  assert.match(css, /\.invoicePaper\s*\{/);
  assert.match(css, /\.invoiceActionBar\s*\{/);
  assert.match(css, /\.invoiceListStatus\s*\{/);
  assert.match(statusCss, /\.pill\s*\{[\s\S]*letter-spacing:\s*0/);
});

test("support tickets render as clickable cards and thread messages as conversation containers", async () => {
  const source = await readFile(dashboardUrl, "utf8");
  const css = await readFile(dashboardCssUrl, "utf8");
  // The message thread moved into the shared TicketConversation component (bubbles + attachments).
  const conversation = await readFile(new URL("../components/tickets/ticket-conversation.tsx", import.meta.url), "utf8");
  const conversationCss = await readFile(new URL("../components/tickets/ticket-conversation.module.css", import.meta.url), "utf8");

  assert.match(source, /className=\{styles\.ticketCards\}/);
  assert.match(source, /className=\{styles\.ticketCard\}/);
  // Phase 2.2: the href goes through the surface mapper (clean URLs on per-surface hosts).
  assert.match(source, /href=\{href\(`\/client\/tickets\/\$\{ticket\.id\}`\)\}/);
  assert.match(source, /<TicketConversation/);
  assert.match(source, /copy\.ticketClose/);
  assert.match(css, /\.ticketCards\s*\{/);
  assert.match(css, /\.ticketCard\s*\{/);
  assert.match(conversation, /<Attachments files=/);
  assert.match(conversationCss, /\.bubble\s*\{/);
  assert.match(conversationCss, /\.attachments\s*\{/);
});
