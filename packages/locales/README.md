# @dezhost/locales — language-pack standard

The single, canonical bundle of user-facing strings and locale/format rules for the
whole platform. It is consumed by **both** `apps/web` and `apps/api`, and it is exactly
what gets published to the CDN and pulled by Teculiar buyer installs. There is no other
source of UI copy — inline strings get migrated here.

## Layout

```
packages/locales/
  manifest.json          # { version, languages, updatedAt } — one shared version for all packs
                         # languages[] is primary-first (build-time default for edge code);
                         # English is always the source-of-truth pack regardless of order
                         # (SOURCE_LOCALE), and is the per-key fallback.
  index.ts               # loader + types (loadDictionary / loadNamespace / t / getMeta)
  en/  common.json admin.json client.json storefront.json email.json invoice.json meta.json
  de/  common.json admin.json client.json storefront.json email.json invoice.json meta.json
  scripts/copy-assets.mjs
```

Add a language by creating a new `<code>/` directory with the same seven namespace files
and listing the code in `manifest.json`. (`index.ts` statically imports the shipped
languages; register a new built-in language there too. Dynamic CDN-pulled packs are a
later Teculiar concern.)

## Namespaces

| Namespace    | Contents |
|--------------|----------|
| `common`     | nav, CTA, status labels (order/service/invoice/ticket), billing-cycle labels |
| `admin`      | admin dashboard / nav strings |
| `client`     | client portal strings |
| `storefront` | shared site chrome — header/footer/toggle copy |
| `email`      | default subjects/bodies, layout-block text, shared labels, block-library labels |
| `invoice`    | every label on the invoice PDF/HTML |
| `meta`       | locale/format rules: `bcp47`, `numberFormat`, `dateFormat`, `defaultCurrency` |

## Rules

- **English is the source of truth.** `en/` defines the complete key set.
- **Per-key English fallback.** A non-English pack may omit keys; at runtime they resolve
  to the English value (`loadDictionary` deep-merges English underneath the locale). A key
  missing even in English surfaces as the dotted key itself, so bugs are visible.
- **One shared version.** All packs move together under `manifest.version`; bump it on any
  English change.
- **Format fallback is `en-GB`.** `getMeta(locale)` fills each missing format rule from
  `en-GB` (the most date-compatible neutral locale) — not from English text fallback.

## Loader API (`index.ts`)

- `loadDictionary(locale)` → full dictionary with English merged in (cached per locale).
- `loadNamespace(locale, ns)` → one namespace, English-merged.
- `t(locale, "common.nav.hosting")` → dotted-key lookup with English fallback.
- `getMeta(locale)` → `{ bcp47, numberFormat, dateFormat, defaultCurrency }` (en-GB fallback).
- `getManifest()`, `availableLocales()`, `hasPack(locale)`, `SOURCE_LOCALE`, `NAMESPACES`.

`apps/web` imports the `.ts` source via the `@dezhost/locales` tsconfig path mapping (the
bundler reads the JSON directly). `apps/api` consumes the built `dist/`, where the JSON is
copied next to `index.js` by `scripts/copy-assets.mjs` during `npm run build`.

## Sync + versioning (`scripts/i18n-sync.ts`)

Run from the repo root. English is the source; for every other language the tool prunes
keys absent from English and fills missing keys (via the DeepSeek API when
`DEEPSEEK_API_KEY` is set, otherwise it seeds the English value as a placeholder).

```
node scripts/i18n-sync.ts --check        # CI: identical key sets + manifest sanity (no writes)
node scripts/i18n-sync.ts                 # prune + fill missing translations, refresh updatedAt
node scripts/i18n-sync.ts --bump          # also bump manifest version (patch) — after English changes
```

The future Admin "auto-translate" button and Teculiar installs reuse this exact script and
bundle format.
