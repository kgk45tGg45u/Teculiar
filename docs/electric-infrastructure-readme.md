# Electric Infrastructure Restyle README

## Phase 1

Done:
- Added global Electric Infrastructure CSS tokens in `apps/web/app/globals.css`.
- Mapped legacy visual aliases (`--dezhost`, `--ink`, `--paper`) to the new palette so existing pages inherit the new brand color without logic edits.
- Set global body background/text to `--bg` and `--text`.
- Added reusable compact utilities for app shell, page header, cards, buttons, muted text, status badges, tables, form fields, dialogs, dropdowns, tabs, metrics, info grids, sidebar nav, and top bar.
- Added reduced-motion support for the new small animations.

## Phase 2

Done:
- Restyled existing shared `Button`, `Card`, and `StatusPill` components with Electric Infrastructure variables.
- Added compatible shared visual components:
  - `Badge`
  - `StatusBadge`
  - `Input`, `Select`, `Textarea`, `Field`
  - `Table` primitives
  - `Dialog` / `Modal`
  - `Dropdown`
  - `Tabs`
  - `PageHeader`
  - `EmptyState`
  - `MetricCard`
  - `InfoGrid`
  - `SidebarNav`
  - `TopBar`
- Added `apps/web/components/ui/index.ts` barrel exports.

## Phase 3

Done:
- Restyled client and admin app shells with compact `--bg` workspace, dark `--sidebar` navigation, rounded sticky sidebar, smaller page headers, compact actions, and active nav states.
- Added `aria-current="page"` to client/admin sidebar links for visual active states only.

## Phase 4

Done:
- Restyled client dashboard surfaces with compact metric cards, tighter overview grid, smaller headings, denser tables, softer card shadows, compact modals, and Electric Infrastructure status/usage colors.
- Kept client fetches, forms, links, payment return behavior, invoices, tickets, and service actions unchanged.

## Phase 5

Done:
- Restyled admin dashboard surfaces with dense sidebar, compact metrics/modules/panels/forms/tables, smaller admin typography, tighter invoice/client rows, and Electric Infrastructure active states.
- Kept admin data loading, access-control redirect, forms, actions, and routes unchanged.

## Phase 6

Done:
- Made public marketing, pricing, domain, auth, checkout, knowledgebase, and content pages more compact through global section/type density and broad CSS module spacing reductions.
- Replaced old raw red RGB accents in CSS with Electric Infrastructure accent tones. Red remains reserved for danger/error tokens.

## Checkout Follow-Up

Done:
- Made checkout detect logged-in clients and hide full contact capture when profile data is already present.
- Added a compact missing-profile section that asks only for missing required fields and requires confirmation.
- Added required AGB/Terms acceptance before order submit.
- Added admin-configurable `termsUrl` through billing settings and storefront public settings.
- Reduced checkout form label/placeholder weight and made domain/password action buttons compact and equal width.
- Added explicit autocomplete attributes for email, password, phone, address, and country fields.
- Added checkout copy for German and English, using the existing locale helper.
- Documented locale precedence in `docs/localization.md`.

## Client Portal Invoice Follow-Up

Done:
- Bounded the client portal content width while keeping the workspace wide.
- Made dashboard announcement and knowledgebase cards equal-sized with a slightly-wide card ratio.
- Added compact loading spinners for service/domain counts, invoice/ticket counters, smart cards, tables, and detail panes.
- Added portal data cache and fetch timeout fallback so page navigation cannot leave counters spinning forever if one request stalls.
- Fixed Products & Services hosting subtitles so the title stays the product name and the subtitle is the related domain.
- Added one-time service-page status probes through the existing server refresh path so Virtualmin can activate hosting before showing the control panel.
- Added the ordered hosting domain as the fourth service detail box.
- Moved announcements and knowledgebase items into one combined bottom dashboard box.
- Fixed dashboard metric cards to fixed near-square widths instead of stretching across wide screens.
- Reworked support tickets into fully clickable cards and message containers with compact attachment links.
- Reworked client invoice rows and invoice detail into a formal German invoice layout with a clearer pay action area.
- Added protected invoice HTML rendering at `/billing/invoices/:id/html`; PDF downloads now render from the same snapshot-based invoice HTML.
- Kept invoice seller, footer, and item data snapshot-based so later admin setting changes do not alter old invoices.

## Changelog

- `apps/web/app/globals.css`
- `apps/web/app/[locale]/blog/blog.module.css`
- `apps/web/app/[locale]/domains/domains.module.css`
- `apps/web/app/[locale]/domains/pricing/domain-pricing.module.css`
- `apps/web/app/[locale]/it-losungen/it-losungen.module.css`
- `apps/web/app/[locale]/knowledgebase/knowledgebase.module.css`
- `apps/web/app/[locale]/kontakt/kontakt.module.css`
- `apps/web/app/[locale]/legal/legal.module.css`
- `apps/web/app/[locale]/pricing/pricing.module.css`
- `apps/web/app/[locale]/product-pages.module.css`
- `apps/web/app/[locale]/uber-uns/uber-uns.module.css`
- `apps/web/app/[locale]/webdesign/webdesign.module.css`
- `apps/web/app/[locale]/webhosting/webhosting.module.css`
- `apps/web/components/admin/admin-dashboard.tsx`
- `apps/web/components/admin/admin-dashboard.module.css`
- `apps/web/components/admin/admin-forms.tsx`
- `apps/web/components/auth/login-form.module.css`
- `apps/web/components/checkout/checkout-form.module.css`
- `apps/web/components/checkout/checkout-form.tsx`
- `apps/web/components/layout/site-header.module.css`
- `apps/web/components/layout/site-footer.module.css`
- `apps/web/components/marketing/domain-search.module.css`
- `apps/web/components/marketing/hero.module.css`
- `apps/web/components/marketing/platform-section.module.css`
- `apps/web/components/marketing/product-grid.module.css`
- `apps/web/components/portal/client-dashboard.tsx`
- `apps/web/components/portal/client-dashboard.module.css`
- `apps/web/components/ui/button.tsx`
- `apps/web/components/ui/button.module.css`
- `apps/web/components/ui/card.tsx`
- `apps/web/components/ui/card.module.css`
- `apps/web/components/ui/status-pill.tsx`
- `apps/web/components/ui/status-pill.module.css`
- `apps/web/lib/api.ts`
- `apps/web/test/client-dashboard-polish.test.mjs`
- `apps/web/components/ui/badge.tsx`
- `apps/web/components/ui/status-badge.tsx`
- `apps/web/components/ui/form-controls.tsx`
- `apps/web/components/ui/table.tsx`
- `apps/web/components/ui/dialog.tsx`
- `apps/web/components/ui/dropdown.tsx`
- `apps/web/components/ui/tabs.tsx`
- `apps/web/components/ui/layout-primitives.tsx`
- `apps/web/components/ui/sidebar-nav.tsx`
- `apps/web/components/ui/top-bar.tsx`
- `apps/web/components/ui/index.ts`
- `apps/web/test/electric-infrastructure-design.test.mjs`
- `apps/web/test/checkout-smart-form.test.mjs`
- `apps/api/src/modules/billing/billing.controller.ts`
- `apps/api/src/modules/billing/invoice-document.ts`
- `apps/api/src/modules/billing/billing.service.ts`
- `apps/api/test/invoice-html-pdf.test.mjs`
- `apps/api/test/cron-job.test.mjs`
- `apps/api/test/order-payment-lifecycle.test.mjs`
- `apps/api/test/service-refresh-lifecycle.test.mjs`
- `docs/electric-infrastructure-readme.md`
- `docs/localization.md`

## Remaining

- Browser visual QA against real data and screenshots.
- Optional per-page polish after viewing client/admin/public pages in the browser.
- Fix/replace the `next lint` script for Next 16 if lint must run in CI.

## Notes

- Phase 1-6 restyle was visual-only. Checkout follow-up intentionally changed form behavior for logged-in users and AGB confirmation, without changing payment, invoice, provisioning, auth routing, or admin action flows.
- `npm --workspace @dezhost/web run lint` currently fails before linting because `next lint` is not supported by this Next 16 setup.
