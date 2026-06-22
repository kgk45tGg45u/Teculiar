# Teculiar Phase 1 (modular languages / locale / currency) — progress & handoff

Working tracker for the Phase 1 refactor. **Authoritative source of where we are** — read this
first when resuming. The approved plan is at
`/Users/balsamico/.claude/plans/just-plan-don-t-change-typed-token.md`; later phases
(Theme/Menus/Pages/Customizer) are in [docs/teculiar-roadmap.md](./teculiar-roadmap.md).

- **Branch:** `feat/teculiar-i18n-currency` (off `main`, pushed to origin 2026-06-21)
- **Status:** Steps 1–8 implemented & committed; Phase 1 verified locally by the user (2026-06-21).
  **Follow-up batch COMPLETE (2026-06-22):** all user-visible **dashboard/checkout/auth chrome** is now
  on the `@dezhost/locales` packs with German authored throughout — `typecheck`, `i18n-sync --check`, and
  the production `next build` are green. See
  [teculiar-roadmap.md → "Phase 1 — follow-up batch" item 4](./teculiar-roadmap.md#phase-1--follow-up-batch-in-progress-2026-06-21)
  for the full converted-component list, new pack groups, and the deliberately-skipped items
  (dead `ClientRow`/`BlogManager`, email content seeds, language-neutral tokens). Earlier follow-ups:
  product-grid currency (`73e7e58`), toggle modal (`a2d34fb`), Apply-button toggle (`d68e0f8`),
  scope-aware admin/client locale (`8988b60`), **country-based VAT + global VAT switch** (`4a7453d`,
  `82fd3a9`, + checkout commit). Chrome i18n commits: `f33ca8b` → `9d4ce2f`.
- **Scope clarified 2026-06-21 (the user):** the inline-copy work is **chrome only** — checkout
  (`checkout-form.tsx`), auth (`login-form.tsx`, `signup-form.tsx`) and the **admin + client dashboards**.
  ALL user-visible strings there move onto `@dezhost/locales` (the `{de,en}` maps/ternaries **and** the
  bare English/German-only literals; thread `locale` into admin components that lack it). **NOT in Phase 1
  (owned by later phases — do not pack):** marketing/storefront **page content** (home, hosting, VPS,
  reseller, IT-Solutions prose, web-design, domains, about, contact, legal, blog post bodies) → **Phase 3
  Customizer** per-element translations; **product names/descriptions** → **per-language admin input
  fields** later.

### ✅ DONE — Country-based VAT (the "step 3")
Shipped as designed; also fixes the reported checkout VAT-0 bug. **Single source of truth** lives in
[`packages/shared/src/tax.ts`](../packages/shared/src/tax.ts) and is used by both API and web:
- **Setting:** `tax.countries` SystemSetting JSON `{ enabled, default, rates }` — global on/off switch,
  default ISO country, and percent per uppercase ISO country. Replaces the single `vatPercent` setting/UI
  (the legacy `vatPercent` is still written, kept in sync with the default country's rate / 0 when off).
- **Resolver:** `resolveVat(context, config)` + `vatPercentForCountry(config, country)`. A country with no
  rate falls back to the **default country's** rate (never silently 0). `enabled: false` ⇒ 0 everywhere.
  EU B2B cross-border with a valid VAT ID ⇒ reverse charge (0); non-EU buyers ⇒ zero-rated export.
- **All three VAT paths unified** on the resolver:
  1. checkout `orderSummary` ([`checkout-form.tsx`](../apps/web/components/checkout/checkout-form.tsx)) —
     now reads `taxCountries` from `/storefront/settings` and resolves the buyer-country rate live
     (buyer country tracked from the country selector + logged-in profile);
  2. `orders.service.previewOrder` / `createAdminOrder` — `billing.vatForBuyer({ countryCode, isBusinessCustomer, vatId })`;
  3. billing engine — `tax.service.resolveVat` delegates to the shared resolver; `createInvoice` threads
     the resolved `taxConfig` into `engine.createDraft` (per-line `line.taxRate ?? vat.rate` unchanged —
     only the funds-deposit line sets an explicit 0, which is intentional, not the nullish trap).
- **By country:** rate follows the buyer country — checkout field for guests, existing client's saved
  `User.countryCode` for renewals (`renewSubscription` already passes it through `createInvoice`).
- **Admin UI:** [`tax-country-settings.tsx`](../apps/web/components/admin/tax-country-settings.tsx) — a
  "Charge VAT" checkbox (global switch) + default-country selector + per-country rate table, writing
  `tax.countries` via `PATCH /admin/dev/billing/settings`. Buyer-country rate exposed via `/storefront/settings`.
- **Tests:** [`apps/api/test/tax.test.mjs`](../apps/api/test/tax.test.mjs) — country rate, default fallback
  (not 0), reverse-charge, non-EU export, global-off, sanitize. Plus a country-rate case in
  `i18n-currency.test.mjs`. `typecheck` + `build` green for shared/api/web; `next build` green.
- **Note:** prod verification still pending deploy (only `main` deploys; this branch does not).

## How to resume (new session)
```bash
cd "/Users/balsamico/code/New Dezhost"
git checkout feat/teculiar-i18n-currency
git log --oneline main..HEAD          # see everything done so far
npm install                            # ensure workspaces linked
npm run typecheck && npm run build     # confirm green baseline
node scripts/i18n-sync.ts --check      # locale packs sane
```
Local full-stack run (changes are NOT on prod yet, so test locally — see the
`local-fullstack-testing` memory): `set -a && source .env && set +a`, then
`npm run dev:api` (:4000) and `npm run dev:web` (:3000). Admin login `admin@dezhost.local`
(reset bcrypt hash via Prisma if needed). Then do Step 6c.

## Locked decisions (do not re-litigate)
- **Currency:** stored amounts are denominated in the **configured main currency**
  (`currency.config.main`, = EUR for Dezhost). The full "EUR literal → main currency" change was
  done. Changing the main currency **does not convert existing price data**.
  → **Approved follow-up:** add an admin **guard/warning** when changing the main currency on a
  store that already has priced data (a LATER step, not Phase 1 core).
- **Inline i18n split (clarified 2026-06-21):** *dashboard/checkout/auth chrome* IS converted to packs
  in Phase 1 (this is the final follow-up item — checkout, login, signup, admin + client dashboards,
  blog-admin chrome). *Marketing/storefront page bodies* (hero/feature copy, IT-Solutions prose, legal,
  blog post content) stay inline and are migrated to **per-element translations in the Phase 3
  Customizer** — never onto the packs. *Product names/descriptions* become **per-language admin input
  fields** in a later phase, not pack keys.
- **Issued invoices are immutable:** snapshot currency + locale + amounts at creation; render from
  the snapshot, never re-convert/re-translate. (Currency snapshot done; **locale snapshot needs
  `Invoice.locale` from Step 7**.)
- **Client locale** = saved `User.locale`; resolution priority explicit choice > toggle > browser
  (if a pack exists) > main language; persist effective locale to DB; emails use up-to-date
  `User.locale`. (Persistence wiring lands in Step 7.)
- **Toggle hidden** when exactly one language + one currency configured.
- Routing accepts **any well-formed locale code** (admin-added languages route correctly), English
  per-key fallback for codes without a pack.

## Done so far (commits, newest last)
| Commit | Step | What |
|--------|------|------|
| `0f2c52d` | 1 | `@dezhost/locales` workspace package: `manifest.json` + en/de packs (common/admin/client/storefront/email/invoice/meta), loader (`loadDictionary`/`loadNamespace`/`t`/`getMeta`, per-key English fallback, en-GB meta fallback), `packages/locales/README.md`, `scripts/i18n-sync.ts` (`--check` + DeepSeek fill). |
| `db42ee6` | 2 | Web `Locale`/`Currency` → `string`; `Language`/`CurrencyDef` shapes; `apps/web/lib/supported-locales.ts` (manifest-derived, edge-safe) kills the duplicated de/en lists in middleware/sitemap/toggle; `apps/web/lib/dictionary.ts` `getDictionary`. Manifest is **primary-first** `["de","en"]`. |
| `1f12c1d` | 3 | `getDictionary` reads the shared packs; inline `dictionary` deleted from `i18n.ts`; header `nav`, footer (storefront pack), `status-labels`, `api.cycleLabel` all read packs. String parity verified. |
| `66d83fb` | 4 | Web currency → N currencies: `CurrencyConfig {main,currencies,rates}`, `convert()`, `money/frozenMoney/serverMoney` format via `getMeta` (bcp47); `currentLocale/currentCurrency` resolve from config; `CurrencyConfigInit` provider replaces `ExchangeRateInit`; `currencyConfigFromSettings` legacy-shim. **Fix:** `convert()` returns 0 for 0¢ everywhere (old `serverMoney` added buffer to free items). |
| `ca792e7` | — | chore: gitignore local `.claude/settings*.json`. |
| `636e6f8` | 5 | Backend `settingJson`/`upsertSettingJson`; `i18nLanguages()`/`currencyConfig()` readers w/ legacy `usd*`→USD shim; `languages`+`currencyConfig` in `publicSettings()` + admin settings payload; `updateSettings` + controller accept/sanitize them (keys `i18n.languages`, `currency.config`). Web `i18n-catalog.ts` (BCP-47 + ISO-4217 catalogs); admin `LanguageCurrencySettings` editor (main/other langs+currencies, per-currency rate + buffer); toggle = grouped selectors, hide-when-single, threaded via `SiteHeader` from all 3 layouts. |
| `fb1f838` | fix | Locale routing accepts any well-formed code (admin-added langs route to `/it/…` instead of `/de/it/…`); `getLocale`/`currentLocale` no longer coerce to manifest packs only. |
| `ad58238` | 6a | apps/api wired to `@dezhost/locales` (dep + prebuild/prestart hooks); `apps/api/src/common/i18n.ts` (`t`/`formatMoney`/`formatDate`); `invoice-document.ts` fully localized (labels from packs, money/date via meta, takes `locale`); `billing.service.invoiceLocale()` resolves invoice locale (snapshot → buyer `User.locale` → main). |
| `9d6e553` | 6b | Stored `currency:"EUR"` → main currency: `Invoice.currency` stamped at creation; transactions/charges use the invoice's own currency; previewOrder/DomainTldPrice/ProductPrice use main; `PaymentProcessor`/abstract-payment types `"EUR"`→`string`; `common/currency.ts` `readMainCurrency` + `mainCurrency()` on service/repo. **Tests:** `apps/api/test/i18n-currency.test.mjs` + invoice test updates. |
| `bbc32c1` | 7a | Prisma migration: `User.locale`/`Content.locale`/`EmailTemplate.locale` `Locale` enum → `String`; new `Invoice.locale` (frozen at creation next to `currency`; final-invoice rebuild copies it). `Locale` enum kept only for deferred `Announcement.locale`/`Translation.targetLocale`. Migration `20260620120000_locale_to_string_and_invoice_locale` is MariaDB-idempotent (`MODIFY COLUMN` + `ADD COLUMN IF NOT EXISTS`); local syncs via `db push`. Dropped the email/cms `Locale` casts + the templateFor try/catch. **Tests:** invoice-locale stamping in `i18n-currency.test.mjs`. |
| `0bb334b` | 8 | Docs: new `docs/i18n-currency.md` (authoritative — packs, `i18n.languages`/`currency.config` registry, currency model, locale resolution + persistence, immutable invoice snapshots, localized emails, String locale columns); `docs/localization.md` reduced to a pointer; README localization line + `packages/locales` entry. No e2e specs hard-coded breaking `de/en`/`EUR/USD` (only a still-valid `dezhost_locale=de` cookie in login.spec). |
| `abda7d7` | 7b | Client-locale persistence: `locale` on `PATCH /users/me` (validated to a well-formed code via `wellFormedLocale`) + exposed on `publicUser`/`publicUserSelect`. Web `persistClientLocale()` writes a signed-in client's choice from the toggle, and the client portal syncs the effective browser-derived locale when it drifts from the stored `profile.locale`. **Tests:** `apps/api/test/user-locale-persistence.test.mjs`. |
| `17b5d25` | 6c | Email localization: dispatch/`sendEventToUser`/`sendCustomToUser` resolve recipient locale from up-to-date `User.locale` → main language (`common/currency.ts` `readMainLanguage`); subjects/bodies/layout-block text + admin block palette seeded from the `email` pack (`email-layouts.ts` `buildDefaultLayouts`/`emailLayoutBlockLibrary` take the localized dict); `templateFor`/admin editor key on the main language with per-locale DB overrides still winning (try/catch tolerates the pre-Step-7 enum); `current_date` + invoice money via `common/i18n` `formatDate`/`formatMoney`; the two `formatEuro()`/`formatDateLabel()` helpers in billing/orders dispatch now use the invoice's frozen currency + recipient locale; test-variable sample money localized. **Tests:** email localization (by `User.locale` + main fallback) in `email-module.test.mjs`; frozen-currency order-email money + `readMainLanguage` in `i18n-currency.test.mjs`; removed the stale `mailpit-preset` controller assertion. |

## Refinements vs. the original plan (intentional)
- **`getDictionary` is synchronous** (packs are static imports) — plan said `await`. Simpler; works in server + client components.
- **Toggle gets `languages`/`currencies` as SSR props** (via `SiteHeader` from layouts) instead of reading injected globals — avoids hydration timing issues. `CurrencyConfigInit` still injects the currency config for client `money()`.
- **Routing leniency**: accepts any well-formed locale code (not just enabled ones). Tradeoff: an unknown `/zz` renders English-fallback (loose for SEO). Possible later refinement: validate against enabled languages server-side and 404 unknown.
- **Backend i18n is a plain helper** (`apps/api/src/common/i18n.ts`), not a Nest service — no DI/circular-dep cost.
- **Step 6 split** into 6a (invoice), 6b (currency literals + tests), 6c (emails — TODO).

## Remaining work

### Step 6c — Email localization (DONE)
Files: `apps/api/src/modules/email/{email-layouts.ts, email.service.ts}`, `common/currency.ts`,
billing/orders `dispatch*Email`.
- ✅ Recipient language resolved from up-to-date **`User.locale`** → main language
  (`readMainLanguage`), no hard-coded "de". `resolveLocale()` in `email.service.ts`.
- ✅ Default subjects/bodies + layout-block text + admin block palette seeded from the **`email`
  pack**; `email-layouts.ts` `buildDefaultLayouts`/`emailLayoutBlockLibrary` take the localized dict.
  DB `EmailTemplate` overrides still win per-locale (`templateFor` try/catch swallows the pre-Step-7
  enum mismatch so any language falls back to the pack). The admin editor seeds & saves overrides on
  the **main language**. No template-row migration.
- ✅ Money via `common/i18n.formatMoney` with the **invoice's frozen currency** + recipient locale;
  dates via `formatDate`. Old `formatEuro()`/`formatDateLabel()` removed from billing/orders dispatch.
  Test-variable sample money localized.
- ✅ **Resolved in 7a:** the `email.service.ts` `Locale` cast + try/catch guard and import are gone
  (`EmailTemplate.locale` is now `String`). The admin editor still only edits the **main-language**
  override (per-locale editor = later phase).

### Step 7 — Prisma migration (DONE) — MariaDB-idempotent
Migration `20260620120000_locale_to_string_and_invoice_locale`. **Prod applies it via
`migrate deploy`; locally run `npm run db:push`** to sync MySQL 8.3 (the `ADD COLUMN IF NOT EXISTS`
is MariaDB-only). After pulling, run `npm run db:generate` so the client types match.
- ✅ `Locale` enum → `String` on `User.locale`, `EmailTemplate.locale`, `Content.locale` (validated
  in app code). Enum **kept** for the deferred `Announcement.locale` + `Translation.targetLocale`.
- ✅ `Invoice.locale String` (default `'de'`, backfills existing German invoices), **captured at
  creation** in `billing.service.createInvoice` next to `currency`; final-invoice rebuild copies it.
  `invoiceLocale()` already prefers `invoice.locale`.
- ✅ Client-locale **persistence**: toggle + client portal write effective `User.locale` via
  `PATCH /users/me` (`persistClientLocale`, validated server-side). Emails read up-to-date `User.locale`.
- ⚠️ **For whoever deploys:** run `prisma db push` locally (or `migrate deploy` on prod) before
  testing — the unit tests use mocked Prisma so they pass without it, but the running app needs the
  `Invoice.locale` column and the relaxed enum.

### Step 8 — Docs + tests + verification
- ✅ `docs/i18n-currency.md` created (modular system, config location, admin flow, single-language
  no-toggle, SystemSetting-keys registry). `docs/localization.md` reduced to a pointer.
- ✅ Root `README.md` localization line + `packages/locales` entry updated. `CLAUDE.md` had no stale
  i18n references.
- ✅ Playwright specs: nothing hard-codes breaking `de/en`/`EUR/USD` (verified). `login.spec.ts`'s
  `dezhost_locale=de` cookie is still valid.
- ⏳ **Remaining (runtime, needs a running stack / deploy):**
  - Local matrix (plan §Verification 2–6): `npm run db:push` to sync the schema, then drive the
    local full-stack — toggle hides on single language+currency; admin-add a 3rd language/currency;
    invoice freezes currency+locale; an email renders in the recipient's `User.locale`.
  - **Prod verification on https://www.dezhost.com after deploy** (per CLAUDE.md, `E2E_*` +
    `set -a && source .env`). The user is taking the website check.

### Deferred (post-Phase-1)
Tracked as actionable next steps in **[teculiar-roadmap.md → "Phase 1 — deferred follow-ups"](./teculiar-roadmap.md#phase-1--deferred-follow-ups-do-after-phase-1-ships)**:
the main-currency-change admin guard, and a per-locale email-template editor. **Owned by later phases
(not packs):** marketing/storefront **page content** i18n → Phase 3 Customizer per-element translations;
**product names/descriptions** → per-language admin input fields.

## Gotchas / notes for future-me
- **API unit tests** (`apps/api/test/*.test.mjs`) are `node --test` files importing the **built
  `dist/`** with mocked deps (no DB). Run after building: from `apps/api/`,
  `node --test test/<file>.test.mjs`. The repo `npm test -w @dezhost/api` does `build && node --test test/*.test.mjs`.
- **Pre-existing baseline failures**: 4 `order-payment-lifecycle.test.mjs` checkout tests fail at
  baseline too (network/env-dependent) — verified by stashing. Don't chase them; just don't ADD
  failures.
- **Dev-server stale dist**: when verifying api `dist/` directly, the running `nest start --watch`
  may not have recompiled — run `npm run build -w @dezhost/api` before requiring `dist/`.
- **Packs in dist**: `@dezhost/locales` build copies JSON next to `dist/index.js`
  (`scripts/copy-assets.mjs`); apps/api consumes the built dist, apps/web reads the `.ts` source via
  tsconfig path mapping. `dist` is gitignored.
- **Local DB currently set** (for testing): `i18n.languages = {main:"de", others:["en","it"]}`,
  `currency.config = {main:"EUR", others:["USD"], rates:{USD:{rate:1.08,buffer:0,bufferEnabled:false}}}`.
  Adjust via Admin → Settings.
- **Toggle freshness**: admin settings changes appear after a hard refresh (Next client router cache).
- Manifest `languages` is **primary-first**; English is always `SOURCE_LOCALE` regardless of order.
