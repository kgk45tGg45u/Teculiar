# Teculiar Roadmap — turning Dezhost into a resellable platform

This is the **durable, multi-phase reference** for the larger refactor. It captures requirements in full
so they don't have to be re-explained each session. Each phase becomes its own branch + (for the
Customizer) its own deep-design session.

- **Active execution plan for Phase 1** lives outside the repo at
  `~/.claude/plans/just-plan-don-t-change-typed-token.md` (modular languages/locale/currency, full-stack).
- Related existing docs: [localization.md](./localization.md), [architecture.md](./architecture.md),
  [modules.md](./modules.md), [folder-structure.md](./folder-structure.md).

## The end goal

The platform becomes **Teculiar**: resellable, white-label, WHMCS-like software. Buyers run their own
storefront *and* manage invoices/orders/tickets/clients, and can add/remove **language packs**,
**currencies**, and **themes**. **Dezhost** becomes just one website that runs Teculiar on the **"Blue"**
theme. The Dezhost/Teculiar separation (multi-tenant / packaging) is the final phase.

## What "Theme" means (important scoping rule)

A **theme = the web/storefront part only** — everything visible *outside* the admin and client dashboards:
homepage, web-hosting/VPS/reseller/domains/IT/web-design pages, blog, about, contact, and legal pages.
**Admin and client dashboards are NOT part of a theme.** Each theme owns its **menu items, pages, header,
footer**, and — inside pages — **localized text content + section modules + elements**.

The current storefront becomes the theme named **"Blue"**. Its CSS/JS/HTML sections and modules get
renamed to reflect that name. More themes come later.

---

## Phase 1 — Modular languages, locale & currency (FULL-STACK) — *in progress*

Status: **planned & approved**, not yet started. Branch `feat/teculiar-i18n-currency`. Full detail in the
plan file above; one-paragraph summary here for context:

Make languages, locale and currency admin-configurable across **web *and* api**. Language packs become a
`packages/locales` workspace bundle (namespaced JSON + shared version manifest, English-as-source + per-key
English fallback, DeepSeek auto-fill, CDN-published). Currency generalizes from EUR/USD-only to N
currencies (per-currency exchange rate + optional buffer) while keeping EUR as the stored base. Locked
rules: **issued invoices are immutable** (frozen currency+locale+amounts), **client locale follows the
saved `User.locale`** (explicit > toggle > browser-if-pack-exists > main; emails use it), and the **toggle
is hidden when only one language + one currency** are configured.

> Everything below (Phases 2–4) depends on Phase 1's modular language list: menus, pages, and element
> content all carry **per-language translations for every language configured in Admin > Settings**, with
> English fallback, and are **locale-aware** for prices/numbers/dates.

---

## Phase 2 — Theme foundation: "Blue" + Admin > Theme tabs 1–3

Goal: introduce the Theme concept and make menus + pages data-driven, **without** the Customizer yet.
Nothing on the live site may break; CSS/section names get renamed to the "Blue" theme.

**Admin > Theme** is a 5-tab page. Phase 2 delivers tabs **Theme**, **Menus**, **Pages** (tabs 4 & 5,
Customizer + any theme-settings, come in Phase 3).

### Tab 1 — Theme
- Admin chooses the active theme from available themes and clicks **Apply** to activate it.
- Today there is exactly one theme, **"Blue"**, shown as a selectable button with a **screenshot/thumbnail**
  of the theme on it; it is active by default.
- A theme bundles: its menu items, pages, header, footer, and per-page localized content + sections/elements.
- Rename the current storefront's CSS/JS/HTML sections and modules to reflect the "Blue" name.

### Tab 2 — Menus
A **5-column CRUD table**; each row is one menu item:

| Column | Type | Notes |
|---|---|---|
| Menu item | text | the label; **translatable per configured language** |
| Menu | dropdown | **Main Menu** or **Legal Menu** |
| Parent item | dropdown | another menu item, to nest/group it |
| Page | dropdown | which Page it links to (from the Pages tab) |
| New Tab | checkbox | open the link in a new browser tab |

Rules:
- Full CRUD of menu items; link items to pages; nest items under a parent so they group in the menu.
- **Parent-only items that link nothing** must be supported (e.g. the current **"Cloud"** item, which is
  just a parent for Web Hosting / Virtual Servers / Reseller).
- The storefront **header and footer become data-driven from this menu data** (replacing today's
  hard-coded nav/footer links and the hard-coded "Cloud" dropdown).

### Tab 3 — Pages
- A list of all storefront pages with **CRUD**, a **Published** checkbox, and **Add new page**.
- **Decision (locked): one Page record with per-locale fields** — each page's **name and slug (and SEO)
  carry a translation for every configured language** — rather than one row per locale. (Replaces today's
  per-locale `Content` rows for marketing pages.)
- Seed the tab with the current pages: **Web Hosting, VPS, Reseller, Domains, IT Solutions, Web Design,
  Blog, About, Contact**.

### Phase 2 open questions / standards to decide
- Theme model + how "active theme" is stored and switched; how a theme is packaged (mirroring the language
  pack/CDN model?) so themes are installable like language packs.
- How the theme **thumbnail/screenshot** is produced and stored.
- Migration from today's hard-coded header/footer + `Content`-based pages to the Menu/Page models without
  breaking live routing/SEO (slugs, redirects).
- How `[locale]` routing maps to per-locale slugs.

---

## Phase 3 — Customizer (Elementor-like page builder) — *needs its own deep-design session*

The hardest part. Tab 4 of Admin > Theme. **Storage decision is locked** (see below); the full
architecture should be designed in a dedicated session before building.

### UX
- Admin picks a page from a dropdown and clicks **Customize** → opens a **new browser tab** that:
  - has **no admin sidebar/header/footer**; instead shows the **storefront header + footer** and a **new
    builder sidebar**.
  - has a **"Go back to Admin"** button (top-right → back to Admin > Theme) and a **Save** button.
- Works like WordPress Elementor: **drag elements from the left sidebar onto the page**; **drag elements
  off the page back to the sidebar to remove them**. Right pane is the live page preview.

### Elements (the library)
- **All sections and cards currently on the website** must be available here, **refactored to be reusable**:
  e.g. **Hero, Explainer Section, Call Out Section, Steps Section**, plus **all cards, buttons, and every
  other reusable UI piece** — not only sections-with-children.
- **Sections can contain sub-sections** (as the site does today); model nesting smartly.
- Dragging an element onto the page shows it pre-filled with **example content**.

### Per-element editing
- Each element has a small **pencil button** → opens an **Edit modal** specific to that element type.
- **Example — Hero**: edit eyebrow, title, subtitle, button 1, button 2, box 1, box 2, box 3, the two
  button **links**, and a **translation for each text in every configured language**. **All fields are
  nullable.** A button uses the **DeepSeek API to auto-translate** into the target language, but there is
  an editable space for **all main + other languages from Admin > Settings**.
- **Example — Explainer Section**: it's a **grid**; its pencil modal sets **grid properties per viewport**
  (how many cards fit, under the section's texts, at each breakpoint).
- **Example — Explainer Card** (lives inside an Explainer Section, and is also a draggable element on its
  own): pencil modal edits eyebrow/title/subtitle (all languages, auto-translate), an **icon (dropdown)**,
  and a title + text (with translations).

### Locale-awareness
- **Prices, numbers and dates are their own element types** so they update automatically from the system's
  locale/currency settings. The Customizer must render locale-aware previews.

### Storage — locked decision
- Each page is a **versioned JSON layout document**: an ordered **tree of typed nodes** (sections →
  sub-sections → elements; elements include cards/buttons/etc.). Each node carries its **type + props**,
  **per-locale text**, and **locale-aware tokens** for prices/numbers/dates. Stored in a **DB JSON column**
  with **draft/published** states. (Chosen over normalized relational rows because the tree is almost
  always read whole.)

### Seeding & safety
- Seed the Customizer with **all main sections and cards currently on the various pages**, preserving
  sub-section nesting. **Nothing on the live site may break** during the migration; CSS class names and
  section names are expected to change as part of making elements reusable.

### Phase 3 deep-design topics (for the dedicated session)
- The **element registry** (how each element type declares its props, default/example content, edit-modal
  schema, and React renderer) and how it maps to the existing CSS-module components.
- The **render pipeline**: how a published layout doc renders a storefront page (server-side), and how the
  preview renders in the builder.
- **Versioning/draft/publish** semantics; autosave; rollback.
- **Drag-and-drop** tech (note from memory: HTML5 DnD in tests needs dispatched `DragEvent`s).
- **DeepSeek** usage: batching, caching, cost control, where API keys live (reuse the Phase 1 sync tool?).
- How layout docs are **packaged/distributed** with a theme (and to Teculiar buyers).

---

## Phase 4 — Dezhost ↔ Teculiar separation

Make Teculiar the product and Dezhost a tenant/instance running the Blue theme. Multi-tenant / white-label
packaging, brand/system name as a single configurable setting (started in Phase 1), theme + language-pack
+ (later) currency distribution to buyers. Detailed later.

---

## How to move through the phases

1. **Finish & merge Phase 1** (the plan file). It unblocks everything because menus/pages/elements all
   need the modular language list + locale-aware formatting.
2. **Phase 2** in a new branch (`feat/teculiar-theme-foundation` suggested): build Theme/Menus/Pages tabs +
   the "Blue" rename, driving header/footer from menu data. Resolve the Phase 2 open questions first.
3. **Phase 3** starts with a **dedicated Customizer design session** (no coding) to settle the deep-design
   topics above and produce a build plan; then implement in its own branch.
4. **Phase 4** last.

Keep each phase on its own branch, test per [CLAUDE.md](../CLAUDE.md) (local first, then prod), and update
this file + the relevant `docs/` as decisions are made.
