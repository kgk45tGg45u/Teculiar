# Teculiar Phase 1 (modular languages / locale / currency) — progress & handoff

Working tracker for the Phase 1 refactor. **Authoritative source of where we are** — read this
first when resuming. The approved plan is at
`/Users/balsamico/.claude/plans/just-plan-don-t-change-typed-token.md`; later phases
(Theme/Menus/Pages/Customizer) are in [docs/teculiar-roadmap.md](./teculiar-roadmap.md).

- **Branch:** `feat/teculiar-i18n-currency` (off `main`)
- **Status:** Steps 1–6c done & committed. **Next: Step 7 (Prisma migration) → Step 8 (docs/tests).**
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
- ⚠️ **Carry-over for Step 7:** `email.service.ts` still imports `Locale` from `@prisma/client` and
  casts `locale as Locale` in `templateFor`/`updateSettings`. When Step 7 turns
  `EmailTemplate.locale` into `String`, drop the cast/`try-catch` guard and the `Locale` import.
  The admin editor currently only edits the **main-language** override (per-locale editor = later phase).

### Step 7 — Prisma migration (the one real migration) — MariaDB-idempotent
Per the `db-engine-and-migrations` memory: **prod=MariaDB, local=MySQL 8.3**. Hand-write
MariaDB-idempotent SQL (`... IF NOT EXISTS`); locally use `npm run db:push` (the IF-NOT-EXISTS
syntax fails on MySQL 8.3), keep `migration.sql` for prod.
- `Locale` enum (`de`/`en`) → `String` on `User.locale`, `EmailTemplate.locale`, `Content.locale`
  (default main language; validate values in app code, not DB). `prisma/schema.prisma` currently
  has `Locale` as a Prisma enum.
- Add `Invoice.locale String`, backfilled to the main language, **captured at creation**
  (set it in `billing.service.createInvoice` next to `currency`). This is what freezes an invoice's
  language. `invoiceLocale()` already prefers `invoice.locale` when present.
- Client-locale **persistence**: write effective `User.locale` (browser-derived if a pack exists;
  toggle writes immediately for logged-in clients via an API call). Emails then read up-to-date
  `User.locale`.

### Step 8 — Docs + tests + verification
- Create `docs/i18n-currency.md` (how the modular system works, where config lives, admin flow,
  single-language no-toggle). **Reconcile/replace the existing [docs/localization.md](./localization.md).**
  Add a SystemSetting-keys registry note (`i18n.languages`, `currency.config`).
- Update root `README.md` + any stale `CLAUDE.md` references.
- Update Playwright specs that assume hard-coded `de/en`/`EUR/USD`.
- Local verification matrix (plan §Verification 2–6) then **prod verification on
  https://www.dezhost.com after deploy** (per CLAUDE.md, with `E2E_*` + `set -a && source .env`).

### Deferred (post-Phase-1, approved today)
- Convert remaining inline `de/en` copy (marketing page bodies, checkout/login local maps, blog CMS
  editor) for full 3rd-language coverage.
- Admin **guard/warning** when changing the main currency on a store with existing priced data.

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
