# Electric Infrastructure Restyle README

## Phase 1

Done:
- Added global Electric Infrastructure CSS tokens in `apps/web/app/globals.css`.
- Mapped legacy visual aliases (`--crimson`, `--ink`, `--paper`) to the new palette so existing pages inherit the new brand color without logic edits.
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

## Changelog

- `apps/web/app/globals.css`
- `apps/web/components/ui/button.tsx`
- `apps/web/components/ui/button.module.css`
- `apps/web/components/ui/card.tsx`
- `apps/web/components/ui/card.module.css`
- `apps/web/components/ui/status-pill.tsx`
- `apps/web/components/ui/status-pill.module.css`
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
- `docs/electric-infrastructure-readme.md`

## Remaining

- Phase 3: Restyle client/admin app shell, sidebar, top bar, active nav states.
- Phase 4: Restyle client dashboard pages one by one.
- Phase 5: Restyle admin pages one by one.
- Phase 6: Restyle public marketing, pricing, domain, auth, and support pages.

## Notes

- No business logic, API calls, routing, auth, payment logic, invoice logic, admin actions, or form behavior changed.
- Current shared components are visual foundations. Page-by-page adoption should happen in later phases.
