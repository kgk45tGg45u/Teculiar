# Localization Rules

Dezhost chooses locale from the browser language on first visit.

Saved preference wins everywhere. When a user chooses a language, store it as `dezhost_locale` in cookie and local storage. Public, client, and admin pages, plus checkout, must use that saved value before checking browser language.

Server-rendered routing reads `dezhost_locale` before `Accept-Language`. Client helpers read local storage/cookie before `navigator.language`.

Current supported locales: `de`, `en`.
