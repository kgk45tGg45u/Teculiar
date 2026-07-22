# Dashboard Design System (D1)

Decision record from the D1 design session (2026-07-18) between Phase 3 and Phase 4.
Scope: **admin + client dashboards** (`apps/web`). Storefront keeps its current look and
adopts the system later; both apps share `packages/web-core/src/globals.css`, so all
dashboard-only changes are scoped under the `dash-compact` class set on the web app's
`<body>` ([apps/web/app/layout.tsx](../apps/web/app/layout.tsx)).

## Decisions

| Topic | Decision |
|---|---|
| Component home | Shared UI kit in `packages/web-core/src/components/ui` — single source for Button, Input, Badge, PageShell, Sidebar, DataTable. Page CSS modules shrink to layout-only. |
| Primary button | Navy (`--primary` #071a2f) fill, white text. Blue accent (#0077b6) reserved for links, focus rings, active nav. |
| Radius scale | Sharp: controls (buttons/inputs/badges) 6px, surfaces (cards/modals/panels) 8px, pills 999px. Storefront keeps 8/10px via token defaults. |
| Type scale | Compact admin scale: 12 / 13 / 14 / 16 / 20 / 24 px (`--text-xs … --text-2xl`). Body 14px, tables 13px, H1 20px. |
| Page shell | Contained: sidebar + content capped at 1440px, 24px padding all sides (16px < 768px). Every dashboard page renders inside one shared PageShell — fixes missing sidebars and missing edge spacing. |
| Mobile nav | Sidebar hidden < 1024px; hamburger in top bar opens overlay drawer. |
| Tables | Priority columns: low-priority columns hide on small screens, row expands for details. No page-level horizontal scroll anywhere. |
| Dark mode | Out of scope for D1. The vestigial `ThemeBootstrap`/`data-theme` hook was removed (2026-07-22, Phase 7) — no CSS consumed it. Reintroduce a proper theme toggle when dark mode is actually built. |

## Tokens

Defined in `packages/web-core/src/globals.css`:

- `:root` holds the neutral defaults (storefront look preserved).
- `.dash-compact` overrides them for dashboards (6px controls, compact type).

| Token | Default (storefront) | `.dash-compact` |
|---|---|---|
| `--radius-control` | 8px | 6px |
| `--radius-surface` | 10px | 8px |
| `--radius-pill` | 999px | 999px |
| `--text-xs/sm/md/lg/xl/2xl` | 12/13/14/16/20/24px | same (scale shared; dashboards actually consume it) |
| `--control-h-sm/md` | 32px / 38px | 30px / 36px |
| `--space-1…6` | 4/8/12/16/24/32px | same |

Components consume tokens with fallbacks (`var(--radius-control, 8px)`), so anything
outside the scope class renders exactly as before.

## Components

- **PageShell** (`web-core/ui/page-shell`): full-width sticky top bar (brand slot,
  breadcrumbs, actions, hamburger) with the sidebar starting under it — fixed 250px column
  ≥1024px, overlay drawer with its own close button below. `plainPaths` renders chrome-less
  routes (admin login). Wired in `apps/web/app/admin/layout.tsx` and
  `apps/web/app/client/layout.tsx`; pages are content-only (no per-page sidebars).
- **AdminSidebar / ClientSidebar**: full-height dark columns placed by PageShell.
  Client nav: flat items + a collapsible Support Tickets group (All Tickets / New Ticket,
  `client.allTickets` locale key added en+de).
- **DataTable** (`web-core/ui/data-table`): data-driven responsive table. Column
  `priority` — 1 always visible, 2 hidden <768px, 3 hidden <1024px — plus one
  `truncate: true` column that absorbs remaining width and ellipsizes. Hidden values stay
  reachable on the record's detail page. Tables never cause page-level horizontal scroll.
  **Phase 5 additions:** a column with `sortValue` becomes client-side sortable (header
  toggle button + `aria-sort`; numbers numeric, strings localeCompare, nulls last);
  `selectable` adds a checkbox column with select-all, and `bulkBar` renders an action
  bar above the table while rows are selected. Used by the admin Orders / Invoices /
  Services / Clients / Tickets lists (`apps/web/components/admin/tables/*`).
- **StatusPillSelect** (`web-core/ui/status-pill-select`): a StatusPill that opens a
  listbox of allowed target statuses (Phase 5.3 inline status editing). Presentational —
  the admin tables wire the mutation endpoints and optimistic row updates around it.
- **Button**: primary/secondary/ghost/danger, sm/md, whole-pixel font sizes, optical
  centering fixes (sm label +0.5px, icons −1.5px left). Natural width on dashboard mobile
  (`dash-compact`), full-width on storefront mobile (unchanged).
- **Forms**: `align-content: start` keeps control rows at natural height; selects use a
  custom chevron (`appearance: none`) aligned with input text; `Field error` adds a red
  border + red focus ring via the `field-error` class.

## Review process (UI-Lab)

`/admin/ui-lab` (dev-only, `notFound()` in production) renders every kit component in all
variants/states. Build order, one checkpoint per step, visual confirmation on localhost
before advancing:

1. Tokens + Button / Input / Badge ✅ locked 2026-07-18
2. PageShell + sidebar + mobile drawer (admin + client) ✅ locked 2026-07-18
3. DataTable with priority columns ✅ locked 2026-07-18
4. Table/page migration ✅ first pass 2026-07-18 — admin (orders, services, invoices,
   tickets, domain prices, cron, admins, roles, client rows) and client portal (services,
   domains) annotated with `col-p2` / `col-p3` / `cell-trunc` (globals utilities mirroring
   DataTable semantics for server-rendered tables); unannotated tables fall back to
   contained scroll inside the table, never page-level. Verified zero page overflow
   320–1440px on all admin + client routes.
5. Phase 5 lists ✅ 2026-07-19 — the admin Orders / Invoices / Services / Clients /
   Tickets lists moved onto DataTable proper (sorting + selection + bulk bar + inline
   StatusPillSelect); UI-Lab gained a "sort + select + inline status" section. Verified
   zero page overflow at 375px and no console errors in a production-mode run.

Mobile guarantees locked with checkpoint 3: zero horizontal scroll (page-level AND inside
tables) from 320px up — enforced by `min()` guards on auto-fit grids, `min-width: 0` on
grid items, `.form-field` intrinsic-width caps, the DataTable truncate column, `iconOnly`
buttons for row actions, and tighter phone paddings. Whole-pixel font sizes everywhere
(buttons 13/12px, badges 12px): fractional sizes render labels visibly off-center on
phones.

UI-Lab is an internal dev tool — labels are intentionally English-only and excluded from
the locale packages.
