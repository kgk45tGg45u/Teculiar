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

> **Superseded by the Phase 3 deep-design session (2026-06-24):** **content is theme-independent; a
> theme is styling only.** Pages, menus, footer and the elements/sections inside pages keep their
> **content and structure** when the active theme changes — only the **styling** changes. So the theme
> does **not** own menus/pages/footer (those become global); reusable components carry **generic,
> theme-neutral names** (`hero`, never `blue.hero`). The "Blue rename" therefore targets the **styling
> bundle / design tokens**, not the component names. (Phase 2 had scoped Page/MenuItem/footer under
> Theme; Phase 3 decouples them — see Phase 3 below.)

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
- **Main-language fallback** for any language left blank (revised in the Phase 3 session, 2026-06-24:
  fallback is the **store's main language** from Admin > Settings, *not* hard-coded English, for all
  *authored content* — menu labels, page name/slug/SEO, element text). Reuse `localized()` (already
  `map[locale] || map[mainLocale] || …`). The static UI **packs** (`packages/locales`) keep
  English-as-source fallback — English is *their* authored source; separate concern.
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
> rewrite + 301).
>
> **Follow-up (DONE 2026-06-24, locally verified):**
> - **hreflang `alternates` + self-`canonical`** rendered by the `[locale]` layout (`generateMetadata`),
>   built from the active theme's per-locale slugs (`storefrontAlternates`/`pageSlug`/`pagePath` in
>   `lib/storefront-theme.ts`). Middleware now sets `x-pathname` on the storefront branch so the layout
>   knows the visitor-facing path. Hidden for single-language stores; blog/KB detail get canonical-only.
> - **Sitemap localized-slug entries** (`apps/web/app/sitemap.xml/route.ts`): per-locale `<loc>` from the
>   theme slugs, each with `<xhtml:link rel="alternate" hreflang>` for every configured language +
>   `x-default`; falls back to a flat path list if the theme can't be fetched. The **cron `sitemap`
>   reporting step** (`cron.service.ts → sitemapStatus`) was made consistent — it now counts
>   (theme pages + extra paths) × configured locales + posts, via the injected `ThemeService`.
> - **Admin-managed redirects (no hard-coded redirects):** new `Redirect` model + migration; API
>   `redirects` module (public `GET /storefront/redirects`, admin CRUD `…/admin/dev/redirects`); the
>   storefront middleware 301/302s any path matching a rule (internal path or absolute URL), cached ~60s.
>   Edited in a new **Admin > Theme > Redirects** tab. Packs: `admin.themeBuilder.{tabRedirects,…}` (en+de).

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

## Phase 3 — Customizer (Elementor-like page builder) — ✅ **DONE (mechanism complete; merged to `main`)**

**Status (2026-07-01): the Customizer mechanism is complete and merged to `main`** (sub-phases
3a→3e + the page-mirrors/universal-flip follow-up = commits `6613cda`→`b6fa46d`). Everything below is
implemented and locally verified. **Two trailing threads are intentionally deferred into Phase 4:**
1. **Authoring real per-page content** in the builder → becomes the **Blue theme's shipped default
   content** (Phase 4.3), since the storefront becomes a distributable theme.
2. **The end-of-Phase-3 production E2E** (covers Phase 2 + 3) → runs at the **Dezhost cutover** (Phase 4.4).

The hardest part. A later tab of Admin > Theme (after Footer). **Storage decision is locked** (see below); the full
architecture should be designed in a dedicated session before building.

> **Sub-phase 3a — content/theme decoupling + nav restructure: IMPLEMENTED & locally verified (2026-06-29).**
> Schema decoupled: `themeId` dropped from `Page`/`MenuItem` (now global; `Page.key @unique`,
> `MenuItem @@index([menu, order])`); `Theme` slimmed to styling-only (`key/name/thumbnail/active`);
> `Theme.footer` → SystemSetting **`storefront.footer`**. Migration
> `prisma/migrations/20260629120000_decouple_content_from_theme` (MariaDB-idempotent; drops the FK
> columns + copies the active theme's footer into the setting before dropping it). API `theme` repo/
> service now read global content + the footer setting; the seed split into `ensureContentSeeded`
> (pages/menus/footer setting, theme-neutral `CONTENT_PAGE_DEFS`/`MAIN_MENU`/`LEGAL_MENU`/`FOOTER_KEYS`)
> + `ensureStylingSeeded` (the `blue` theme). Nav: `/admin/theme/blue` → `/admin/theme` (301 via a
> redirect page), the **Blue** sidebar child dropped (Theme is a direct leaf; active theme chosen on
> tab 1). **Storefront `GET /storefront/theme` payload shape is unchanged** (`theme` styling + global
> `menus/pages/footer/languages`), so header/footer/mobile-menu/sitemap/layout/cron consumers are
> untouched. Verified locally: `db:push` applied, DB confirms no `themeId`/`Theme.footer` columns +
> 15 pages/15 menu items preserved + `storefront.footer` populated; the live payload renders identically.
> Tests: `apps/web/test/theme-content-decoupling.test.mjs`. API + web typecheck green.
>
> **Sub-phase 3b — layout schema + Customizer API + registry skeleton + `LayoutRenderer`: IMPLEMENTED &
> locally verified (2026-06-29).** Schema: `Page` gains `publishedLayout`/`draftLayout`/`draftUpdatedAt`/
> `layoutVersion` (Json + meta) and a `PageVersion` snapshot model (`@@unique([pageId, version])`);
> migration `20260629130000_page_layout_docs` (additive, MariaDB-idempotent). Layout doc =
> `{ schemaVersion, root: Node[] }` (`apps/web/lib/customizer/types.ts`). New **element registry**
> (`apps/web/lib/customizer/registry/`, theme-neutral) with `ElementDef` + `getElementDef`/`listElements`
> + skeleton defs (`section` container, `textBlock` atom; full inventory in 3d). One **`LayoutRenderer`**
> (`layout-renderer.tsx`) for live (server) + preview (client): walks the tree, resolves per-locale text
> via `localized()` (main-language fallback), skips unregistered types live / placeholders them in preview.
> New API **`customizer` module** (`apps/api/src/modules/customizer/`), guarded
> `JwtAuthGuard+RolesGuard @Roles("admin","super_admin")`, on global pages:
> `GET :pageId`, `PATCH :pageId/draft` (Save), `POST :pageId/publish` (promote draft→published, bump
> `layoutVersion`, snapshot `PageVersion`, flip `component="custom"`), `GET :pageId/versions`,
> `POST :pageId/revert/:version` (append-only re-publish), `POST translate` (DeepSeek per-field, reuses
> `AiBlogService.callDeepseek` + `BillingService.{i18nLanguages,deepseekApiKey}`; upstream failure → clean
> 502). Public `GET /storefront/page/:key` returns a custom page's `publishedLayout` (route wiring is 3e).
> Verified locally end-to-end against the running API (admin JWT): get→saveDraft→invalid-layout-400→
> publish v1→v2→versions→revert→published==reverted-v1→storefront read shows custom+published→translate
> (empty echo + clean 502 without a valid key); unauthenticated → 401. Tests:
> `apps/web/test/customizer-foundation.test.mjs`. API + web typecheck green. **Next: 3c** (builder shell —
> `@dnd-kit` canvas, edit modals, IndexedDB autosave + restore, Save/Publish/rollback UI, DeepSeek button).

> **Sub-phase 3c — builder shell: IMPLEMENTED & locally verified (2026-06-29).** Full-screen route
> `app/admin/theme/customizer/[pageKey]/page.tsx` (no admin chrome; resolves `pageKey`→id + configured
> locales via `/admin/dev/theme`, loads docs via the 3b API). New client builder under
> `apps/web/components/admin/customizer/`: **`@dnd-kit`** canvas (`builder.tsx` `DndContext`+`DragOverlay`+
> `closestCenter`; `palette.tsx` registry-driven `useDraggable`; `canvas.tsx` nested
> `SortableContext`/`useSortable`/`useDroppable`, renders nodes through the **same registry** as live in
> `mode="preview"`). Pure immutable tree ops (`tree.ts`: insert/move/remove/update, container-into-self
> guard) → nothing lost mid-drag. **Three storage layers** wired: IndexedDB buffer (`idb.ts`, debounced
> 1 s, "Restore unsaved changes" banner when local > server `draftUpdatedAt`) → **Save** PATCHes
> `draftLayout` → **Publish** promotes draft→published + snapshots `PageVersion` (flips the live badge to
> `custom`). `beforeunload` guard while dirty. **Edit modal** (`edit-modal.tsx`) is generated from
> `ElementDef.textSlots`/`propSchema`, live-applies to the in-memory doc, per-slot **DeepSeek
> auto-translate** (≥2-language-gated) via `POST /admin/dev/customizer/translate`. **Versions modal** lists
> snapshots + revert (reloads the doc). New deps `@dnd-kit/core`+`/sortable`+`/utilities`. "Customize"
> link added to the Pages tab (opens the builder in a new tab). Locale packs: new `admin.customizer.*`
> group + `themeBuilder.customize` in **en + de** (parity-checked). Verified: web `build` (route emitted),
> web+api typecheck, `node --test` (new `apps/web/test/customizer-builder.test.mjs`, 22 customizer/
> decoupling assertions green). Live pages still use built-in renderers (no `component` flipped) — site
> unaffected. **Next: 3d** (component refactor + registry population), then 3e per-page migration.

> **Sub-phase 3d — registry population: IMPLEMENTED & locally verified (2026-06-29).** The element
> registry (`apps/web/lib/customizer/registry/`) is populated with a faithful, **theme-neutral** inventory
> across all five categories, each reusing the storefront's existing styling (global classes + the
> marketing CSS modules + the `Button`/`Badge` UI primitives) so **preview == live**:
> **sections** `hero`, `featureGrid`, `steps`, `cta`, `faq` (+ generic `section`); **cards** `featureCard`,
> `step`, `faqItem`; **atoms** `textBlock`, `button`, `badge`, `icon`, `prose`; **dynamic** `productGrid`
> (renders the real `<ProductGrid>` live, a placeholder in preview); **token** `priceToken` (Intl
> locale/currency formatting). Containers declare `accepts`; every def carries palette label/icon,
> `textSlots`/`propSchema` (→ edit modal), and a pre-filled `example()` seeded with the current site copy
> (en+de). Shared `lib/customizer/icons.ts` (lucide-by-name) + `numberProp` helper. The **palette now
> groups by category**; packs gained `admin.customizer.categories.*` + richer `slots` labels in **en + de**
> (parity-checked). Per the locked plan, **no live page is modified** — these elements become the building
> blocks the per-page migration (3e) assembles into layout docs. Verified: web `build` (the dynamic
> server-component import is RSC-safe), web+api typecheck, `node --test` (new
> `apps/web/test/customizer-elements.test.mjs`; 28 customizer/decoupling assertions green). **Next: 3e**
> (per-page migration — author → verify parity → Publish/flip `component`, page by page). Deferred
> follow-ups: remaining data-wired elements (DomainSearch, ContactForm, BlogPostGrid, admin-composed
> HomepageProductGrid), a real icon-picker input, and `accepts` drop-enforcement in the builder.

> **Sub-phase 3e — live render flip + first migration (About): IMPLEMENTED & locally verified
> (2026-06-30).** Wires the published layout doc into the live storefront. New **`CustomPageGate`**
> (`apps/web/components/customizer/custom-page.tsx`, server component): a route wraps its built-in
> renderer in the gate, which fetches `GET /storefront/page/:key` and — when a `publishedLayout` exists —
> renders it via the **same `LayoutRenderer`** the builder previews (`mode="live"`), else returns
> `children` (the built-in renderer) unchanged; `children` is an element, so its data fetching only runs
> on the fallback path. Wired into the About route (`app/[locale]/uber-uns/page.tsx`): its body is
> extracted to `AboutBuiltIn`, the default export is the gate. **Design correction (caught by live
> testing):** publishing must **NOT** overwrite `Page.component` — the slug-routing middleware rewrites
> `/<locale>/<slug>` → `/<locale>/<component>`, so a `component="custom"` sentinel made the page 404
> (`/de/custom`). Fixed: `publish`/`revert` no longer touch `component`; the "render custom" signal is a
> **non-null `publishedLayout`**. `storefrontPage` returns `publishedLayout` + `mainLocale` (renderer
> fallback locale); the builder/route track a `published` flag (`layoutVersion > 0`) instead of the
> sentinel. **Verified end-to-end against the local stack** (API:4000 + web:3000): published a sample
> About layout → `/de/uber-uns` (200) rendered the custom doc (custom-only copy present, built-in copy
> absent); reverted → the same route rendered the **built-in** About again (fallback). web `build`,
> web+api typecheck, `node --test` (new `apps/web/test/customizer-flip.test.mjs`; 33 customizer/decoupling
> assertions green). The committed code ships the **mechanism** only — no page is published in seed/prod,
> so every storefront page renders exactly as today; authoring a page's real content to parity happens in
> the builder (and is the remaining 3e work, page by page). **Phase 3 mechanism complete; next: author
> migrations + the deferred end-of-Phase-3 production E2E** (covers Phase 2 + 3).

> **Phase 3 follow-up — page mirrors + universal flip + builder polish (2026-06-30).** (1) **Hydration
> fix:** `DndContext` got a stable `id`, removing the builder's SSR `aria-describedby` mismatch. (2)
> **Per-viewport settings:** `ResponsiveNumber` ({base, md, sm}) + `registry/responsive.module.css` drive
> per-breakpoint grid columns (desktop / tablet ≤1024 / mobile ≤640) via CSS vars; the edit modal renders
> a Desktop/Tablet/Mobile control (and a single input for plain `number` props). `featureGrid` +
> `productGrid` expose responsive `columns`. (3) **productGrid options:** a `category` (which catalog
> category) + responsive `columns`; the live render fetches the category's products. (4) New
> **`domainSearch`** element. (5) **Page mirrors:** every storefront page except blog gets a Customizer
> **draft** mirroring its content (`apps/api/.../theme/page-mirrors.ts`, seeded idempotently by
> `ThemeRepository.ensureMirrorDrafts()` — drafts only, never auto-published). (6) **Universal flip:**
> `CustomPageGate` wired into all those routes (built-in body extracted to `<Name>BuiltIn`), so any page,
> once published, renders its layout; until then the built-in page is unchanged. Verified: web build +
> web/api typecheck + `node --test` (43 assertions) + the **Playwright** suite
> (`tests/e2e/specs/customizer.spec.ts`, 5/5: clean hydration, drag inserts, edits reflect, responsive
> 4/2/1 columns per viewport, productGrid renders real products). Deferred: a blog-posts element (so blog
> can be mirrored), contact-form element, and an icon-picker input. **Shipped to deploy on
> `feat/teculiar-customizer`** — live pages render as today (nothing published); admins refine + publish
> per page in the builder.

> **Deep-design session outcome (2026-06-24).** Full approved build plan lives outside the repo at
> `~/.claude/plans/steady-doodling-babbage.md`. Branch `feat/teculiar-customizer` created (no code yet —
> only the branch; implementation starts next session at sub-phase **3a**).
>
> **Locked decisions:**
> 1. **Save = server draft; Publish = go live** (two-step draft/published states).
> 2. **Recovery = browser-local autosave (IndexedDB)**; the server is written **only** on explicit Save.
>    Three layers: IndexedDB buffer (continuous, offline-safe) → `Page.draftLayout` (on Save) →
>    `Page.publishedLayout` + `PageVersion` snapshot (on Publish). "Restore unsaved changes" on reopen.
> 3. **Drag-and-drop = `@dnd-kit`** (`@dnd-kit/core` + `/sortable`; nested sortable, `DragOverlay`,
>    immutable in-memory doc → nothing lost mid-drag). No DnD lib installed today.
> 4. **Incremental rollout behind `Page.component`** — each page keeps its hard-coded renderer until its
>    layout doc is authored, verified, and Published, then `component` flips to `"custom"`. Live site never breaks.
> 5. **Content is theme-independent; theme = styling only** (see the "What Theme means" superseding note).
>    Requires decoupling the shipped Phase 2 model: drop `themeId` from `Page`/`MenuItem`, move
>    `Theme.footer` → SystemSetting `storefront.footer`, slim `Theme` to `key/name/thumbnail/active`
>    (+ future `styling`), split the seed into a global **content** seed + a **styling** seed.
> 6. **Main-language fallback** for authored content (see Translation editing UX note).
> 7. **Sidebar: Admin > Theme has NO child.** Drop the "Blue" sub-item; active theme chosen on tab 1.
>    Route `/admin/theme/blue` → `/admin/theme`; Customizer at `/admin/theme/customizer/[pageKey]`.
>
> **Sub-phases:** 3a content/theme decoupling + nav restructure → 3b layout schema + Customizer API +
> registry skeleton + `LayoutRenderer` → 3c builder shell (`@dnd-kit` canvas, edit modals, IndexedDB
> autosave, Save/Publish, rollback, DeepSeek translate) → 3d component refactor (reusable, theme-neutral
> presentational) + registry population → 3e per-page migration (author → verify parity → publish).
> Reuse: `AiBlogService.callDeepseek` (DB `deepseekApiKey`) for auto-translate; `i18nLanguages()` →
> `{main, others}`; `translate-field.tsx` modal; the `JwtAuthGuard + RolesGuard + @Roles` admin pattern.
> Prod E2E deferred to the **end of Phase 3** (user's call this session).
>
> **Element library inventory** (from the survey, to register with generic names): Hero, Explainer/
> Feature-card Grid, Platform "Why" grid, Steps/Process, Call-out/CTA, FAQ/Accordion, Domain Search,
> Contact (form+sidebar), About blocks, Blog grid, Legal prose; atoms Button/Card/Badge/Chip/TextBlock/
> Icon + Explainer/Step/Service cards; dynamic `ProductPackages`/`HomepageProductGrid`/`DomainSearch`/
> `ContactForm`/`BlogPostGrid`; Price/Number/Date tokens. All content today is inline `isDe ? … : …`.
>
> **Deferred to its own phase (dedicated design session first): Properties tab + Custom Themes.** The
> Theme page gains a **Properties** tab — a big **locale-aware** textbox serializing a theme's exhaustive
> properties (theme name, main color hex codes, grid box border-radius, …). Editing it changes that
> theme's **CSS-level** properties (active or not); copy/edit/import via a **"New Custom Theme"** button
> creates a new theme (re-skinning the same theme-neutral components). This is the `Theme.styling` payload
> the Phase 3 decoupling anticipates. **Not built in Phase 3.**

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

## Phase 4 — Dezhost ↔ Teculiar separation — *deep-design DONE 2026-07-01; program approved; building on `feat/teculiar-phase4-separation`*

Make **Teculiar** a hosted SaaS product and **Dezhost its first tenant**. Scope now = **Option 1 only**
(hosted API + a downloadable "Blue" storefront theme). Full approved program at
`~/.claude/plans/first-read-teculiar-roadmap-jiggly-bumblebee.md`; architecture at
[teculiar-architecture.md](./teculiar-architecture.md); operator runbook at
[teculiar-operations.md](./teculiar-operations.md).

**Guiding principle: ONE codebase.** Dezhost and Teculiar.com run the *identical* backend + frontend; the
only differences between tenants are (a) **which modules they enable** and (b) **admin settings/content**.
**Teculiar.com is the marketing website for the Teculiar app — NOT a hosting provider**; it is a dogfood
tenant whose catalog is the Teculiar plans and which runs the **Tecreator** provisioning module.

**Locked decisions (2026-07-01 design session):**
1. **Tenancy = shared API + DB-per-tenant** (tenant resolved by subdomain `userNNNN.teculiar.net`; each
   tenant DB is a clone of today's schema). Adds a **control-plane DB** (tenant registry) + **per-request
   connection routing**.
2. **App split = Model B:** the buyer downloads **only the presentational Blue storefront**; **admin +
   client dashboards + API stay hosted** (protects IP). The client dashboard still wears each tenant's
   data-driven header/footer/brand.
3. **Routing:** the storefront **proxies `/admin`, `/client`, `/api`** to the tenant's `*.teculiar.net`;
   browser calls are same-origin `/api` (no build-time API-URL baking — one theme artifact for all).
4. **Repos:** rename the current monorepo → **`Teculiar`**; the existing private **`Dezhost`** repo holds
   the thin storefront.
5. **Updates = Teculiar-push, mandatory for hosted parts** (API + dashboards are one hosted version). Only
   **theme + language packs** are distributed per tenant, gated by an **auto-update checkbox**, and
   **reversible to the last version**. Bundles served from **teculiar.net** (no CDN yet).
6. **Dezhost data = start fresh** (catalog/config only) **except import Dezhost's existing blog posts**;
   Teculiar.com starts with 0 posts. Customers/orders/invoices/domains do **not** migrate (archive old
   prod read-only).
7. **Server = reuse the existing Dezhost Virtualmin box** for everything; **no load balancer / object
   storage yet**; uploads on the filesystem (tenant-scoped). **Deployment = Docker behind Apache.**
8. **Tecreator** (module `kind: "platform"`) provisions each tenant by creating its DB **directly via a
   MariaDB admin connection** (create → migrate → seed → register → email credentials).

**Sub-phases:** 4.0 close out Phase 3 + rename repo → 4.1 multi-tenant API core (control-plane +
connection routing) → 4.2 split web app (distributable storefront vs hosted dashboards) → 4.3 Teculiar.com
dogfood + Tecreator module → 4.4 Dezhost as first tenant + cutover → 4.5 update distribution (reversible)
→ 4.6 hardening.

> **Sub-phase 4.1 — multi-tenant API core: IMPLEMENTED & locally verified (2026-07-01).** The whole layer
> lives under `apps/api/src/tenancy/` and is **backward-compatible**: multi-tenancy activates **only** when
> `CONTROL_PLANE_DATABASE_URL` is set — otherwise the API runs in **single-tenant fallback mode** exactly as
> today (verified by a real boot: `/api/v1/health` + `/api/v1/storefront/theme` → 200). Pieces:
> - **Control-plane DB + `Tenant` registry** — its own Prisma schema `prisma/control-plane/schema.prisma`
>   generating a **separate** client to a gitignored `prisma/control-plane/generated` (imported via the one
>   wrapper `tenancy/control-plane-prisma.ts`; scripts `db:cp:generate`/`db:cp:push`; Dockerfile.api
>   generates it too). Fields per the design (`subdomain`, `dbName`, `dbUrl`, reserved `dbUserRef`/
>   `jwtSecretRef`, `brand/plan/status/modules/autoUpdate` + `theme/locale` + `prev*` version fields).
> - **The tenant choke point** — `PrismaService` is no longer a class instance but a **Proxy** (provided by
>   `PrismaModule` via factory) that resolves the current request's Prisma client from
>   **`AsyncLocalStorage`**; every existing `this.prisma.*` call is unchanged and automatically hits the
>   right tenant DB. Falls back to the default `DATABASE_URL` client outside a request / in fallback mode.
> - **`TenantMiddleware`** (applied before CSRF) reads the `Host` → subdomain (`<sub>.teculiar.net` /
>   `<sub>.localhost`; apex+`www` → none), looks the tenant up in the control-plane, gets a pooled client
>   from **`ConnectionRegistry`**, resolves its **per-tenant JWT secrets** (from that tenant's own DB
>   `SystemSetting`, cached; env fallback), and runs the pipeline inside the ALS context.
> - **Per-tenant JWT** — `tenancy/jwt-secrets.ts` `accessSecret()`/`refreshSecret()` read the context (env
>   fallback); wired into the auth guard, `auth.service` (sign + password-reset HMAC) and `billing.controller`.
> - **CORS** now allows any host under `teculiar.net`/`teculiar.com` (+ `CORS_TENANT_SUFFIXES`).
> - **`createTenant(subdomain)`** (`tenant-provisioning.service.ts`, reused later by Tecreator): MariaDB
>   admin conn (`TENANT_ADMIN_DATABASE_URL`) → `CREATE DATABASE`+least-privilege user → `prisma migrate
>   resolve`+`deploy` (mirrors the Dockerfile CMD's broken-migration workaround) → seed (Blue content +
>   admin user + per-tenant JWT secrets, via the existing seeders inside the tenant context) → register in
>   the control-plane. Returns the admin credentials.
> - **Verified:** api typecheck + build green; **5 deterministic unit tests** (`apps/api/test/tenancy.test.mjs`
>   — proxy routing, ALS interleaving with no bleed, fallback, JWT context, host parsing); a **real 2-DB
>   proof** on local MySQL (write in tenant A invisible to tenant B; seeders + distinct per-tenant JWT
>   secrets + control-plane registration land in the right DB); full API suite unchanged at the **15-failure
>   pre-existing baseline** (my changes add only the 5 passing tenancy tests, zero new failures).
> - **Env (new):** `CONTROL_PLANE_DATABASE_URL` (enables multi-tenancy), `TENANT_ADMIN_DATABASE_URL`
>   (createTenant DDL conn), optional `CORS_TENANT_SUFFIXES`, `TRUST_FORWARDED_HOST=true` (read
>   `x-forwarded-host` behind a proxy — set **only** when Apache `ProxyPreserveHost` is off).
> - **Known follow-ups (not blockers for 4.1):** (1) `ThemeRepository.mirrorsSeeded` is a **process-level**
>   flag → in live multi-tenant only the first tenant's lazy path seeds Customizer mirror drafts; make it
>   per-tenant (createTenant sidesteps it by calling `ensureContentSeeded`/`ensureStylingSeeded` directly).
>   (2) **Background/cron jobs run with no request → no tenant context**; multi-tenant cron must iterate
>   tenants (deferred to 4.6; fallback-mode cron is unaffected). (3) `createTenant`'s **`migrate deploy`**
>   only runs against **MariaDB** (prod) — locally on MySQL 8.3 the MariaDB-only `IF NOT EXISTS` migrations
>   fail, so the 2-DB proof laid schemas down with `db push` (per the documented local convention). (4)
>   The per-tenant DB **connection string is stored in the control-plane** for now; a secrets-manager
>   indirection (`dbUserRef`/`jwtSecretRef`) is 4.6 hardening.

> **Sub-phase 4.2 — split the web app: distributable storefront vs hosted dashboards: IMPLEMENTED &
> locally verified (2026-07-02).** The single `apps/web` Next app became **three pieces** (the locked
> "clean move" — no route duplication):
> - **`packages/web-core`** (`@dezhost/web-core`) — the shared foundation both apps import: all of
>   `lib/*` (api types + currency/locale formatting + auth + i18n + customizer registry/`LayoutRenderer` +
>   storefront-theme + dictionaries…), `components/ui/*`, `components/layout/*` (site-header/footer/mobile-menu/
>   toggles), `components/marketing/*` (the customizer registry renders these, so they're shared), and
>   `globals.css`. Resolved from **source** via the existing tsconfig-path pattern (`@dezhost/web-core/*` →
>   `packages/web-core/src/*`) + `transpilePackages`; a `typesVersions` map makes subpath types resolve under
>   `next build`'s checker (which ignores tsconfig paths for node_modules-resolved workspace packages).
> - **`apps/storefront`** (`@dezhost/storefront`) — the thin, **distributable Blue theme**: the moved
>   `app/[locale]/*` + `sitemap.xml`, `components/{checkout,customizer/custom-page,auth/signup-form}`, a root
>   layout, and a **locale/slug/redirect-only middleware**. Its `next.config.mjs` **reverse-proxies**
>   `/api`,`/uploads`,`/admin`,`/client`,`/login`,`/reset-password` → `TECULIAR_UPSTREAM` (optional
>   `TECULIAR_API_UPSTREAM` splits the API target for local dev). **Audited logic/secret-free** (only public
>   `apiGet`, non-secret tax/cycle display helpers from `@dezhost/shared`).
> - **`apps/web`** (`@dezhost/web`) — now the **hosted dashboards only** (`app/admin`,`app/client`,`login`,
>   `reset-password`); its middleware is **auth-guard only**; it proxies `/api`,`/uploads` to the API for
>   local same-origin dev and exposes `DASHBOARD_ASSET_PREFIX` so the storefront's `/admin` proxy loads
>   dashboard assets from a browser-reachable origin (avoids `/_next` collision).
> - **Killed build-time API-URL baking.** `web-core` `lib/api.ts` resolves the base URL at **runtime**:
>   browser → same-origin `/api/v1`; server/SSR/middleware → `TECULIAR_UPSTREAM` (else legacy
>   `NEXT_PUBLIC_API_URL` for single-tenant fallback). One storefront artifact serves every tenant.
> - **Docker/compose/CI:** new `Dockerfile.storefront` (port 3001, no API-URL arg); `Dockerfile.web` +
>   `docker-compose.prod.yml` gained the `web-core` source + a **`storefront` service**; the CI builds
>   **three images** (`dezhost-api`/`dezhost-web`/`dezhost-storefront`).
> - **Verified:** all 6 workspaces typecheck; **both apps `next build` green**; web `node --test` = **78 pass /
>   5 fail = unchanged pre-existing baseline** (confirmed against a clean HEAD worktree — 0 new); storefront
>   standalone boot + `/`→`/de` locale redirect + SSR render; **`/api` + `/uploads` same-origin proxy proven**
>   against a mock upstream; `i18n-sync --check` OK (no new UI strings). **Deferred:** full `/admin`,`/client`
>   live-proxy + prod E2E run at the 4.4 cutover (needs the deployed multi-tenant stack); the `@dezhost/*` →
>   `@teculiar/*` package/repo rename stays with 4.0.

> **Sub-phase 4.3 — Tecreator provisioning module: CODE IMPLEMENTED & tested (2026-07-02).** The module
> that lets **Teculiar sell itself** now exists and plugs into the **unchanged** order pipeline:
> - **New `platform` module kind** + a **`tecreator`** catalog entry in
>   `apps/api/src/modules/module-registry/module-catalog.ts` (`kind: "platform"`; light config —
>   `subdomainPrefix`, `defaultPlan`; no secrets of its own).
> - **`TecreatorProviderService`** (`apps/api/src/modules/external/tecreator-provider.service.ts`)
>   implements the same `HostingProvider` interface as Virtualmin/Hetzner. `provision()` delegates to the
>   4.1 **`createTenant`** primitive (create DB+user → migrate → seed Blue+admin+JWT → register in the
>   control-plane) and returns `externalId = subdomain` + the admin **credentials in
>   `metadata.credentials`** (emailed by the existing activation-email path). Degrades to **QUEUED** when
>   the control-plane is off (single-tenant/dev) and to **FAILED** (never throws) on a bad/duplicate
>   subdomain or DDL/migrate/seed error; `status()` reflects control-plane presence; `restart()` is a no-op.
> - **Wired** into `ExternalService.hostingProvider()` (`moduleName === "tecreator"` → the provider) and
>   `ExternalModule` (imports `TenancyModule` for `TenantProvisioningService`/`ControlPlaneService` — no
>   cycle). A Teculiar-plan product simply sets `provisioningModule = "tecreator"`; the existing
>   `onInvoicePaid → activateItem → finishHostingProvisioning` flow does the rest — **no core changes**.
> - **Verified:** API typecheck + `nest build` green; **7 new deterministic tests**
>   (`apps/api/test/tecreator-module.test.mjs`: catalog/kind wiring, provider routing, create→ACTIVE+creds,
>   auto-subdomain, graceful QUEUED/FAILED, status) all pass; `module-registry` (8/8) + `deployment-config`
>   (3/3) still green; no API test boots the app so the DI change is safe (15-failure live-server/DB
>   baseline unchanged). **Operator/data work deferred to deployment (Part F):** provisioning
>   **Teculiar.com (tenant #0)** + enabling the module + authoring its marketing/docs/blog, and the **Blue
>   theme's shipped default page content** (the Phase-3 per-page authoring) — these need the deployed
>   multi-tenant stack + a content pass, not code.

> **Sub-phase 4.3b — Licensing + suspension: IMPLEMENTED & tested (2026-07-02).** Decided this session
> (see [teculiar-architecture.md → Licensing](./teculiar-architecture.md#licensing-the-tenant-subscription-is-the-license)):
> **the tenant's control-plane `status` IS its license** (no separate key — dashboards/API are hosted).
> Teculiar.com sells the **Teculiar plan (flat constant monthly)**; Dezhost keeps selling hosting; **one
> codebase, one "Blue" theme** (kept by name), Teculiar.com is tenant #0 served from the monorepo (no
> separate teculiar.com repo). Enforcement, reusing the ordinary billing engine with **no special-casing**:
> `HostingProvider` gained optional **`disable`/`enable`** hooks; billing's suspend + unsuspend passes call
> them **provider-generically** (`hostingProvider(module).disable/enable`) instead of hardcoding Virtualmin;
> **Tecreator's `disable`/`enable` flip the tenant `status` suspended/active** (`ControlPlaneService.setStatus`);
> and **`JwtAuthGuard` refuses any authenticated request whose tenant context is `suspended`** — so a lapsed
> customer keeps their **data + public storefront** but their **dashboards/API are locked** until they pay
> (reactivates instantly). Non-destructive; nothing is terminated. Verified: API typecheck + build; **10
> Tecreator tests** (`apps/api/test/tecreator-module.test.mjs`, incl. disable/enable + the suspension gate)
> pass; full API suite back at the **15-failure baseline** (a 4.2 fallout — `apps/api/test` reading moved
> web files by path — was also fixed here by remapping those refs to `packages/web-core`/`apps/storefront`).

> **Sub-phase 4.4 — Dezhost as first tenant + cutover: DEPLOYMENT IN PROGRESS (2026-07-02).** The code is
> done and the `:edge` stack is up on eu01 (api 4001, dashboards 3010, teculiar.com storefront 3011);
> operator work through **H.5** (env, containers, Apache for teculiar.net + teculiar.com) is complete. The
> **two repos are populated**: `Teculiar` (this monorepo, builds all 3 images) and `Dezhost` (thin
> storefront-only deploy — `docker-compose.yml` + `.env.example` + `apache/dezhost.com.conf`, consumes the
> published `dezhost-storefront` image, `TECULIAR_UPSTREAM=https://dezhost.teculiar.net`; local `~/code/Dezhost`).
> **Remaining (server-side, in `docs/teculiar-operations.md` H.7 + H.8/Part F):** provision the `teculiar`
> + `dezhost` tenants; bring teculiar.com fully live (safe — new site); then the **gated dezhost.com
> cutover** (provision + import blog posts + verify on `dezhost.teculiar.net` → deploy the Dezhost
> storefront on `:3021` → swap dezhost.com's Apache to the white-label block → keep old instance read-only).
> ⛔ **Do NOT merge to `main` until the cutover** — `main` auto-deploys `:latest` to the LIVE `/opt/dezhost`
> and the new `DASHBOARD_ASSET_PREFIX=/_dash` default would break the current dezhost.com dashboards; the
> whole go-live runs on `:edge` in `/opt/teculiar`. **Open decision for the operator:** the locked plan is
> "Dezhost starts fresh — import blog posts only" (customers/orders/invoices/domains do NOT carry over);
> confirm before cutting over, since it drops the live customer base from the new tenant.

> **Sub-phase 4.5 — Update distribution (reversible): DOCUMENTED (2026-07-02).** Model recorded in ops
> **Part G**: API + dashboards are hosted/single-version (update = deploy new images, every tenant current
> instantly); theme + language packs are versioned bundles published to `teculiar.net/releases/...`, applied
> from each tenant's admin **Updates** panel (auto or one-click, one-step revert). The Dezhost storefront
> updates by pulling the new published image. The generalized `release-sync` publish command (from
> `scripts/i18n-sync.ts`) is the remaining code piece, deferred until after cutover.

### Phase 4.6 — per-subdomain white-label + edge TLS *(planned)*
Replaces the H.4/H.5 **Apache reverse-proxy** onboarding with **DNS-only** onboarding: each tenant points
**one hostname per surface** (`admin.`/`client.`/`api.`/apex) at our edge; we serve everything white-label.
Adds a `TenantDomain` map + full-host tenant/surface resolution (replacing the first-label
`subdomainFromHost` heuristic), a **free Caddy** on-demand-TLS edge (gated by an allowlist; needed only for
external **custom** domains — your own domains keep pre-issued certs), **per-tenant URL emission**,
**per-tenant CORS allowlist**, DNS-TXT **domain-ownership verification**, and a **one-time-code SSO handoff**
for the separate-origin client case. Certs follow whoever terminates the host (tenants may keep their own
apex cert). Keeps Phase 5/6 invariants (runtime API base, origin allowlist, host-only tokens). Full plan +
box undo/convert steps: [teculiar-phase4.6-plan.md](./teculiar-phase4.6-plan.md).

### Phase 5 — Option 2: custom themes *(accepted, later)*
A buyer builds a theme in the hosted admin (Customizer + the deferred Properties/Custom-Themes tab,
anticipated by `Theme.styling`), downloads the theme files, and self-runs the storefront against the
hosted API — same proxy/runtime model as Blue.

### Phase 6 — Option 3: headless integration *(accepted, later)*
A **hosted JS SDK + embeddable widgets** (web components / iframes for domain search, product cards, cart,
checkout, login) + the documented `/api/v1` + **webhooks**, to embed ordering into an arbitrary existing
site. **Assessment: do NOT build an installed "agent"** — a stateless SDK/widgets + webhooks is simpler,
safer, and lower-maintenance for web-order embedding; an agent only pays off for local/offline
provisioning, which this doesn't need.

---

## How to move through the phases

1. **Finish & merge Phase 1** (the plan file). It unblocks everything because menus/pages/elements all
   need the modular language list + locale-aware formatting.
2. **Phase 2** in a new branch (`feat/teculiar-theme-foundation` suggested): build Theme/Menus/Pages tabs +
   the "Blue" rename, driving header/footer from menu data. Resolve the Phase 2 open questions first.
3. **Phase 3** ✅ done (Customizer mechanism merged to `main`).
4. **Phase 4** (in progress on `feat/teculiar-phase4-separation`): the SaaS separation — see the locked
   decisions above and the approved program plan. Then **Phase 5** (custom themes) and **Phase 6**
   (headless) follow.

Keep each phase on its own branch, test per [CLAUDE.md](../CLAUDE.md) (local first, then prod), and update
this file + the relevant `docs/` as decisions are made.
