# Internationalization & Currency

Dezhost ships a **modular** language and currency system: an admin configures any number of
languages and currencies, and the public site, client/admin panels, invoices, and transactional
emails follow that configuration. Adding a third language or currency is a settings change, not a
code change.

> This document is the authoritative reference. [localization.md](./localization.md) is a short
> pointer kept for backwards links.

## Shared locale packs — `@dezhost/locales`

All translatable strings live in one workspace package, `packages/locales`, consumed by **both**
`apps/web` and `apps/api` (and later by Teculiar buyer installs).

- `manifest.json` — the configured languages, **primary-first** (e.g. `["de", "en"]`).
- One folder per language (`de/`, `en/`, …) with a JSON file per **namespace**:
  `common`, `admin`, `client`, `storefront`, `email`, `invoice`, `meta`.
- **English is the source-of-truth key set.** Every other language falls back to English **per key**
  at runtime, so a partially translated pack never renders a blank string.
- `meta.json` holds the per-language format rules (`bcp47`, `numberFormat`, `dateFormat`,
  `defaultCurrency`) and falls back to `en-GB` (the most neutral, date-compatible locale) when a
  rule is missing.
- Loader API (`packages/locales/index.ts`): `loadDictionary(locale)`, `loadNamespace(locale, ns)`,
  `t(locale, "ns.dotted.key")`, `getMeta(locale)`, `hasPack(locale)`.
- `scripts/i18n-sync.ts --check` verifies every language has the English key set (and can DeepSeek-fill
  gaps). Run it after editing packs.

Web reads the `.ts` source via a tsconfig path mapping; the API consumes the **built `dist/`** (the
build copies the JSON next to `dist/index.js`).

## Where configuration lives — SystemSetting keys

Two JSON rows in the `SystemSetting` table drive everything. Edit them via **Admin → Settings**
(language/currency section), never by hand in normal operation.

| Key | Shape | Meaning |
|-----|-------|---------|
| `i18n.languages` | `{ "main": "de", "others": ["en", "it"] }` | Configured languages. `main` is the primary/fallback language. |
| `currency.config` | `{ "main": "EUR", "others": ["USD"], "rates": { "USD": { "rate": 1.08, "buffer": 0, "bufferEnabled": false } } }` | Configured currencies, per-currency conversion `rate` and optional `buffer`. |

Legacy fallbacks: when `currency.config` was never saved, the old `usdExchangeRate` / `usdBufferCents`
settings are migrated into a `USD` entry on read. When `i18n.languages` is unset, the default is
`{ main: "de", others: ["en"] }`.

Backend readers: `BillingService.i18nLanguages()` / `currencyConfig()` / `mainCurrency()`, and the
dependency-free `common/currency.ts` `readMainLanguage()` / `readMainCurrency()` for services that
only hold a Prisma client.

## Currency model

- **Stored amounts are denominated in the configured main currency** (`currency.config.main`, = EUR
  for Dezhost). Changing the main currency does **not** convert existing price data.
- Display conversion happens at render time via `convert(cents, target)` using the configured `rate`
  (+ optional `buffer`). `convert()` returns `0` for `0`-cent (free) items in every helper.
- Web money helpers (`apps/web/lib/api.ts`): `money()` (convert + format for the current display
  currency), `frozenMoney()` (format an already-frozen amount, no conversion), `serverMoney()`.
- Backend formatting: `common/i18n.ts` `formatMoney(cents, currency, locale)` (Intl, locale number
  format) and `formatDate(value, locale)`.

## Locale resolution & persistence

Effective client locale priority: **explicit choice > toggle > browser (if a pack exists) > main
language**. Routing accepts **any well-formed locale code** (admin-added languages route to `/it/…`),
with English per-key fallback for codes without a pack.

The saved preference is `User.locale`. The language toggle and the client portal persist the
effective locale to the account via `PATCH /users/me` (`persistClientLocale`, validated server-side
to a well-formed code), so **transactional emails read the up-to-date `User.locale`**. A guest's
choice is stored only in the `dezhost_locale` cookie/localStorage until they sign in.

The **toggle is hidden** when exactly one language **and** one currency are configured; each selector
hides on its own when only one option exists.

## Invoices — immutable snapshots

Issued invoices freeze their **currency** and **locale** at creation and render from those snapshots —
never re-converted or re-translated:

- `Invoice.currency` is stamped from the main currency at creation; transactions/charges use the
  invoice's own currency.
- `Invoice.locale` is stamped from the main language at creation; `invoiceLocale()` prefers it, then
  the buyer's `User.locale`, then the main language. The final-invoice rebuild copies both.
- The invoice document (`billing/invoice-document.ts`) reads labels from the `invoice` pack and money/
  dates from the snapshot locale's meta.

## Emails — localized

`email.service.ts` resolves each recipient's language from the up-to-date `User.locale` → main
language, then seeds subjects, bodies, default layout blocks and the admin block palette from the
`email` pack (`email-layouts.ts` `buildDefaultLayouts`/`emailLayoutBlockLibrary`). A DB
`EmailTemplate` override wins **per-locale**; with no override, the pack default applies. Money
placeholders use the invoice's **frozen currency** + recipient locale; dates via `formatDate`. The
admin editor seeds and saves overrides on the **main language** (a per-locale editor is a later phase).

## Database

`User.locale`, `Invoice.locale`, `Content.locale` and `EmailTemplate.locale` are free-form `String`
columns (values validated in app code, not the DB), so admin-added languages can be stored. The
`Locale` enum is retained **only** for the still-de/en blog/announcement content
(`Announcement.locale`, `Translation.targetLocale`) — deferred to a later phase. Migration:
`prisma/migrations/20260620120000_locale_to_string_and_invoice_locale` (MariaDB-idempotent; locally
sync with `npm run db:push`).

## Deferred (post-Phase-1)

- Inline `de/en` copy still in marketing page bodies, checkout/login local maps, and the blog CMS
  editor — works in de/en but won't pick up a 3rd language until converted.
- Admin guard/warning when changing the main currency on a store with existing priced data.
- A per-locale email-template editor (the editor currently edits the main language).
