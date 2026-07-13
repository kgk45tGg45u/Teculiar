# Localization Rules

> Superseded by **[i18n-currency.md](./i18n-currency.md)** — the authoritative reference for the
> modular language/currency system. This file is kept for backwards links and the core routing rule.

Dezhost chooses locale from the saved preference first, then the browser language. Resolution
priority: **explicit choice > toggle > browser (if a pack exists) > main language**.

- The saved preference is `User.locale` (for signed-in clients) plus the `teculiar_locale`
  cookie/localStorage. Public, client, admin, and checkout surfaces all use the saved value before
  checking the browser language.
- Server-rendered routing reads `teculiar_locale` before `Accept-Language`; client helpers read
  local storage/cookie before `navigator.language`.
- Supported languages are **configured by an admin** (`i18n.languages` in `SystemSetting`), not
  hard-coded. Routing accepts any well-formed locale code, with English per-key fallback for codes
  without a pack.
- Language **and currency are scope-aware**: `/admin` uses `teculiar_admin_locale` /
  `teculiar_admin_currency`, the public/client surfaces use `teculiar_locale` / `teculiar_currency`, so an
  admin's choice never leaks to the storefront. Client reads are reactive (re-sync on the `dezhost:prefs`
  event, `pageshow` bfcache restore, and back/forward) — see [i18n-currency.md](./i18n-currency.md).

See [i18n-currency.md](./i18n-currency.md) for the packs, currency model, invoice/email
localization, and the SystemSetting key registry.
