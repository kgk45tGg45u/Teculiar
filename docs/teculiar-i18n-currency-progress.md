# Teculiar Phase 1 (modular languages / locale / currency) — progress & handoff

Working tracker for the Phase 1 refactor. **Authoritative source of where we are** — read this
first when resuming. The approved plan is at
`/Users/balsamico/.claude/plans/just-plan-don-t-change-typed-token.md`; later phases
(Theme/Menus/Pages/Customizer) are in [docs/teculiar-roadmap.md](./teculiar-roadmap.md).

- **Branch:** `feat/teculiar-i18n-currency` (off `main`, pushed to origin 2026-06-21)
- **Status:** Steps 1–8 implemented & committed; Phase 1 verified locally by the user (2026-06-21).
  Now working a **follow-up batch** (storefront i18n polish + country VAT + scope-aware locale) tracked
  in [teculiar-roadmap.md → "Phase 1 — follow-up batch"](./teculiar-roadmap.md#phase-1--follow-up-batch-in-progress-2026-06-21).
  **Done:** product-grid currency (`73e7e58`), toggle modal (`a2d34fb`), Apply-button toggle (`d68e0f8`),
  scope-aware admin/client locale (`8988b60`). **Pending:** country-VAT (next), then inline-`de/en`-copy.

### ▶ RESUME HERE — Country-based VAT (the "step 3")
Approved data model + approach (also fixes the reported checkout VAT-0 bug):
- **Setting:** `tax.countries` SystemSetting JSON `{ default: "DE", rates: { DE: 19, AT: 20, … } }`
  (percent per ISO country). Replaces the single `vatPercent` setting/UI.
- **One source of truth:** `vatPercentForCountry(country)` (resolve `rates[country]` → else `rates[default]`,
  **never 0** as a silent fallback). Use it in **all three** VAT paths that currently diverge:
  1. checkout form `orderSummary` (`apps/web/components/checkout/checkout-form.tsx`, ~L1604, currently
     `subtotal * vatPercent/100` with `vatPercent` from `/storefront/settings` defaulting to **0**);
  2. `orders.service.previewOrder` (`apps/api/.../orders/orders.service.ts`, flat `vatPercent`);
  3. billing engine — `tax.service.resolveVat` (`apps/api/.../billing/tax.service.ts`) + the per-line
     `line.taxRate ?? vat.rate` in `billing-engine.service.ts` (watch the `0 ?? rate` nullish trap).
- **By country:** rate = buyer country (checkout form field / existing client's saved `User.countryCode`).
  **Keep EU reverse-charge** (B2B cross-border w/ valid VAT ID → 0) in `resolveVat`.
- **Admin UI:** replace the single VAT field with a per-country table + default-country selector
  (`apps/web/components/admin/...` settings) writing `tax.countries`; expose the buyer-country rate via
  `/storefront/settings` (or a small endpoint) so checkout is country-aware, not a flat number.
- **Recalc:** order create + renewal must compute VAT from the (then-current) buyer country.
- **Tests:** mirror `apps/api/test/i18n-currency.test.mjs` — `vatPercentForCountry` fallback to default
  (not 0), order/renewal VAT by country, reverse-charge still 0.
- **Note:** prod verification still pending deploy (only `main` deploys; this branch does not).
- **Cadence:** small reviewable commits, build green between each, stop for review after each major step.
- **Build/verify:** `npm run typecheck` and `npm run build` (both must be green). API unit tests: see "Testing" below.
- No self-credit in code/commits (per CLAUDE.md).

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
- **Remaining inline i18n is DEFERRED to a later phase:** marketing page bodies
  (hero/feature copy), checkout/login local copy maps, and the blog CMS editor still use inline
  `de/en` ternaries. They work in de/en but won't pick up a 3rd language. Phase 1 covers the
  modular system + chrome/dashboards/invoices/emails only.
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
remaining inline `de/en` copy (marketing bodies, checkout/login maps, blog CMS editor), the
main-currency-change admin guard, and a per-locale email-template editor.

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
