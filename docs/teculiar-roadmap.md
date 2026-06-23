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

## Translation editing UX (applies to Phases 2–4)

These rules govern **every admin-side translatable field**: menu-item labels (Phase 2), page **name,
slug, content and SEO** (Phase 2/3), and **Customizer element text** (Phase 3).

- **Conditional on ≥2 languages.** Translation affordances appear **only when the store has at least two
  configured languages**. A single-language store (one main language, no extra packs) shows **no**
  translation buttons or fields anywhere in Admin > Settings > Theme or the Customizer — there is nothing
  to translate. (Mirrors the Phase 1 rule that hides the storefront language toggle when only one language
  is configured.)
- **The "translate" affordance.** Next to each translatable text sits a **small button bearing a
  one-character language sign**. Clicking it opens a **modal with one input field per configured language**;
  the modal saves each language's value separately.
- **Default language = the editing admin's own language.** The value shown inline (menu label, page
  title/slug/content, element text) is authored in **the current admin's language** — the language that
  admin picked via their own toggle (`dezhost_admin_locale`). The modal collects the **other** languages'
  values.
- **English fallback** still applies at render time for any language left blank.
- **Auto-translate** (Phase 3 elements): a button calls the **DeepSeek API** to pre-fill a target language,
  but every language field stays **editable**. Menus/pages may reuse the same helper.

---

## Phase 1 — Modular languages, locale & currency (FULL-STACK) — *implemented; verification pending*

Status: **Steps 1–8 implemented & committed** (2026-06-20) on branch `feat/teculiar-i18n-currency`;
build/typecheck/unit-tests green. Remaining: runtime verification — `npm run db:push` locally + the local
matrix, then prod verification after deploy. Working tracker: [teculiar-i18n-currency-progress.md](./teculiar-i18n-currency-progress.md).
Reference docs: [i18n-currency.md](./i18n-currency.md). One-paragraph summary:

Make languages, locale and currency admin-configurable across **web *and* api**. Language packs become a
`packages/locales` workspace bundle (namespaced JSON + shared version manifest, English-as-source + per-key
English fallback, DeepSeek auto-fill, CDN-published). Currency generalizes from EUR/USD-only to N
currencies (per-currency exchange rate + optional buffer) while keeping EUR as the stored base. Locked
rules: **issued invoices are immutable** (frozen currency+locale+amounts), **client locale follows the
saved `User.locale`** (explicit > toggle > browser-if-pack-exists > main; emails use it), and the **toggle
is hidden when only one language + one currency** are configured.

### Phase 1 — follow-up batch (in progress, 2026-06-21)

Requested after the user verified Phase 1 locally. Ordered; "step 3" below is the country-VAT work
the user referenced when reordering the deferred items.

1. ✅ **Product-grid prices are currency/locale-aware** (`73e7e58`). The reseller, virtual-servers and
   home grids were server components, so `money()` fell back to the main currency and never followed the
   toggle. Amounts now render through a client `components/marketing/price.tsx` (`<Price>`).
2. ✅ **Toggle redesigned as a button + modal** (`a2d34fb`). New reusable `components/ui/modal.tsx`; the
   modal has two separate sections (Language, Currency) so the two axes are obvious. Labels in
   `common.preferences`.
3a. ✅ **Scope-aware admin/client locale** (`8988b60`). Locale is now scoped like the auth tokens: the
   admin panel uses a `dezhost_admin_locale` cookie, everything else keeps `dezhost_locale`.
   `requestLocale` (via `x-pathname`), `currentLocale`, `storeLocale` and `persistClientLocale` resolve
   the cookie/account by `currentScope()`, so a language picked in admin only affects the admin account.
   *Follow-up (minor):* on a fresh browser the saved `User.locale` isn't auto-seeded into the scope
   cookie until the user picks a language once; same-browser persistence already works via the cookie.
   Cross-device seeding would add `locale` to the login response and set the scope cookie on `storeAuth`.
3. ✅ **Country-based VAT** *(the "step 3")* (`4a7453d`, `82fd3a9`, + checkout commit). Per-country VAT
   rates + a default country, defined in the admin panel; plus a **global "Charge VAT" on/off switch**.
   VAT for an order/renewal is the buyer's country rate (entered at checkout, or the saved
   `User.countryCode` for existing clients); countries with no rate fall back to the default country's
   rate (**never silently 0**). EU reverse-charge (B2B cross-border w/ valid VAT ID → 0) and non-EU
   export (→ 0) preserved. Single source of truth: [`packages/shared/src/tax.ts`](../packages/shared/src/tax.ts)
   (`resolveVat`, `vatPercentForCountry`), used by checkout preview, order preview AND invoice creation.
   New `tax.countries` SystemSetting `{ enabled, default, rates }` (legacy flat `vatPercent` kept in sync
   with the default-country rate / 0 when off). Admin UI:
   [`tax-country-settings.tsx`](../apps/web/components/admin/tax-country-settings.tsx). Full reference:
   [docs/i18n-currency.md → "VAT by country"](./i18n-currency.md#vat-by-country).

   **Fixed here:** the reported "4% VAT set → checkout showed 0 VAT" bug. VAT had been computed in three
   unsynced places (checkout `orderSummary` country-unaware with `vatPercent` defaulting to 0,
   `orders.service.previewOrder` flat, and the billing engine) — now collapsed onto the one shared
   country-aware resolver; the buyer country is threaded through checkout.
4. ✅ **All user-visible *dashboard/checkout/auth* chrome moved onto the `@dezhost/locales` packs**
   (done 2026-06-22) so a 3rd configured language has **zero untranslated chrome**. Every converted
   component reads its strings from the shared packs (German authored for all of it); `i18n-sync --check`,
   `typecheck`, and the production `next build` are green. Converted: checkout-form; login/signup/bot-check;
   admin-dashboard (incl. cron operator docs); client-dashboard; blog-admin; admin-sidebar + breadcrumbs;
   admin-forms (settings/cron/payment-gateways/orders/clients/invoices/announcements/admins/SEO + rich-text
   toolbar); product-manager; modules; email-admin-editor; departments/support/logs-explorer/theme-blue/
   language-currency/tax-country; client billing/payment (+ return) pages; and the admin client/order/
   service/invoice detail pages. New pack groups: `storefront.{checkout,login,signup,botCheck}`,
   `client.{dash,pay}`, `admin.{eyebrow,view,btn,col,card,misc,cron,nav,crumb,blogAdmin,forms,settingsForm,
   productMgr,modules,emailEditor,dept,support,logsExplorer,theme,langCur,tax,detail}`. **Deliberately left
   as-is:** dead code (`ClientRow`/`BlogManager` in admin-forms — unused), email-content seeds + rendered
   email HTML (server-seeded from the `email` pack), and language-neutral tokens (brand names, `IBAN`,
   `SEPA`, `PayPal`, status enums, format-example placeholders). Scope (clarified 2026-06-21):
   - **IN scope:** every user-visible string in **checkout** (`checkout-form.tsx`), **auth**
     (`login-form.tsx`, `signup-form.tsx`), and the **admin + client dashboards** — both the bilingual
     `{de,en}` copy maps / `isDe ? … : …` ternaries *and* the bare English-only (or German-only) literals
     that were never bilingual (button labels, table headers, toasts, placeholders, `aria-label`s, …).
     Several admin components don't yet receive a `locale`; thread it in so they can read the packs.
   - **OUT of scope (handled by later phases — do NOT pack these):**
     - **Marketing / storefront page content** (home, web-hosting, VPS, reseller, IT-Solutions incl. the
       pricing prose, web-design, domains, about, contact, legal, blog post bodies). These get
       per-element translations through the **Phase 3 Customizer** (per-element editing), not packs.
     - **Product names & descriptions** — these become **per-language input fields in the Admin panel**
       (authored data, not pack keys), added in a later phase.
   The blog **admin editor's chrome** (buttons/labels/language chips) IS packed; the blog **post content**
   it edits is per-locale data, left as-is.

### Phase 1 — deferred (after the country-VAT step above)

Moved here at the user's request — pick up **after step 3 (country VAT)**:

- **Admin guard when changing the main currency** on a store that already has priced data — warn that
  existing amounts are *not* re-converted (stored amounts stay denominated in the old main currency).
- **Per-locale email-template editor** — the admin email editor currently seeds/saves overrides on the
  **main language** only; add a locale switcher so overrides can be authored per configured language
  (the dispatch path already resolves DB overrides per-locale).

> Everything in Phases 2–4 depends on Phase 1's modular language list: menus, pages, and element
> content all carry **per-language translations for every language configured in Admin > Settings**, with
> English fallback, and are **locale-aware** for prices/numbers/dates.

---

## Phase 2 — Theme foundation: "Blue" + Admin > Theme tabs (Theme/Menus/Pages/Footer)

> **Status (2026-06-23): IMPLEMENTED on branch `feat/teculiar-theme-foundation`; locally verified; pending
> deploy + prod E2E.** Prisma `Theme`/`Page`/`MenuItem` models + migration; API `theme` module
> (`apps/api/src/modules/theme/`) with an idempotent "Blue" parity seed (labels pulled from
> `@dezhost/locales`), public `GET /storefront/theme`, admin `GET /admin/dev/theme` + page/menu/footer CRUD
> + `:key/activate`; Admin > Theme tabbed builder (`apps/web/components/admin/theme/`) with the one-glyph
> translate-button modal (shown only when ≥2 languages). **Flip done in two stages:** (A) data-driven
> header/footer (`site-header`/`site-footer`/`mobile-menu` read from `lib/storefront-theme.ts`, with a
> fallback); (B) per-locale slug routing in `middleware.ts` — maps a visitor's localized slug to the
> physical route (rewrite) and 301s old paths to the current slug (no-op under parity; ~60s cache).
> Verified locally end-to-end (seed parity, admin tabs, 3-language translate modal, create, localized-slug
> rewrite + 301). **Follow-up:** hreflang `alternates` + sitemap localized-slug entries (only matter once
> slugs are localized; 301s keep old URLs working meanwhile).

Goal: introduce the Theme concept and make menus + pages data-driven, **without** the Customizer yet.
Nothing on the live site may break. **Rollout (decided 2026-06-23): parity-first, two steps** — build the
models + admin tabs seeded to mirror today's site exactly, then flip the live header/footer/routing to
data-driven only **after prod parity is verified**. **The "Blue" CSS/section/module rename is deferred to
Phase 3** (it pairs with Phase 3's reusable-element refactor, avoiding visual regressions here).

**Admin > Theme** is a multi-tab page. Phase 2 delivers **Theme**, **Menus**, **Pages**, and **Footer**.
The **Customizer** (and any further theme-settings) come in Phase 3 as later tabs.

### Tab 1 — Theme
- Admin chooses the active theme from available themes and clicks **Apply** to activate it.
- Today there is exactly one theme, **"Blue"**, shown as a selectable button with a **screenshot/thumbnail**
  of the theme on it; it is active by default.
- A theme bundles: its menu items, pages, header, footer, and per-page localized content + sections/elements.
- *(Deferred to Phase 3.)* Renaming the current storefront's CSS/JS/HTML sections and modules to the
  "Blue" name is **not** done in Phase 2 — it pairs with Phase 3's reusable-element refactor to avoid
  visual regressions.

### Tab 2 — Menus
A **5-column CRUD table**; each row is one menu item:

| Column | Type | Notes |
|---|---|---|
| Menu item | text | the label; **translatable per configured language** — via the shared translate-button modal (see *Translation editing UX*) |
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
  - **Per-locale slugs are authored here.** Example: IT-Solutions is `/en/it-solutions` and
    `/de/it-losungen`. Each language's slug is edited in this Pages tab via the translate-button modal
    (see *Translation editing UX*); blank locales fall back to the main-language slug.
- Seed the tab with the current pages: **Web Hosting, VPS, Reseller, Domains, IT Solutions, Web Design,
  Blog, About, Contact**.

### Tab 4 — Footer
- A dedicated tab to **edit the storefront footer content**, admin-defined and **translatable per
  configured language** (via the translate-button modal; see *Translation editing UX*).
- The live footer becomes **data-driven from this tab** (replacing today's hard-coded footer content).
  Footer **menu links** still come from the **Menus** tab (e.g. the **Legal Menu**); this Footer tab owns
  the footer's **other content** (column headings, free text, contact blurb, copyright line, etc.).

### Header (no dedicated tab in Phase 2)
The header needs little customization now: it renders the **logo**, the **menu items** in the active
language (from the **Menus** tab), and the **fixed action buttons** (identical in every language). So it
becomes menu-driven but gets **no separate editing tab** this phase.

### Phase 2 open questions / standards to decide
- Theme model + how "active theme" is stored and switched; how a theme is packaged (mirroring the language
  pack/CDN model?) so themes are installable like language packs.
- How the theme **thumbnail/screenshot** is produced and stored.
- Migration from today's hard-coded header/footer + `Content`-based pages to the Menu/Page models without
  breaking live routing/SEO (slugs, redirects).
- **Slug routing (decided 2026-06-23): localized URLs go live in Phase 2's flip step.** `[locale]` routing
  resolves the per-locale slug authored in the Pages tab (e.g. `/de/it-losungen`); old paths get **301
  redirects** and the sitemap/hreflang are updated. Blank locales fall back to the main-language slug.

---

## Phase 3 — Customizer (Elementor-like page builder) — *needs its own deep-design session*

The hardest part. A later tab of Admin > Theme (after Footer). **Storage decision is locked** (see below); the full
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
- **Build the library by surveying every page *outside* the Admin & Client dashboards** (home, web-hosting,
  VPS, reseller, domains, IT-Solutions, web-design, blog, about, contact, legal): catalogue **every section
  and element**, give each a **clear, appropriate name**, and register it. The library is a faithful
  inventory of **what the site has today**.
- **Homepage product grids are a special case — distinct from the product grids on other pages.** Other
  pages' grids render a product list. The **homepage grids are admin-composed**: the admin defines each
  homepage product **card's content/details, per card**, in **Admin > Settings > Theme**. Model the
  homepage-grid element so its cards are admin-authored, separate from the data-driven product grids
  elsewhere.
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
- **This phase owns the marketing/storefront copy i18n that Phase 1 deliberately left inline.** All
  home/web-hosting/VPS/reseller/IT-Solutions/web-design/domains/about/contact/legal page text (today's
  `isDe ? … : …` ternaries) becomes **per-element, per-language content** here — it is NOT moved onto the
  `@dezhost/locales` packs. (Packs stay for dashboard/checkout/auth chrome + emails/invoices only.)

### Storage — locked decision
- Each page is a **versioned JSON layout document**: an ordered **tree of typed nodes** (sections →
  sub-sections → elements; elements include cards/buttons/etc.). Each node carries its **type + props**,
  **per-locale text**, and **locale-aware tokens** for prices/numbers/dates. Stored in a **DB JSON column**
  with **draft/published** states. (Chosen over normalized relational rows because the tree is almost
  always read whole.)

### Seeding & safety
- Seed the Customizer with **all main sections and cards currently on the various pages**, preserving
  sub-section nesting. **Nothing on the live site may break** during the migration; CSS class names and
  section names are expected to change as part of making elements reusable. (This is also where the
**"Blue" theme rename** deferred from Phase 2 lands.)

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
