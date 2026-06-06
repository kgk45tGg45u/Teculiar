# Playwright Scenario README

This file is test input. Playwright reads the fenced `json playwright-scenarios` block below and turns each scenario into a browser test.

Edit or add scenarios in the JSON block. Keep `id` stable so reports stay easy to compare.

```json playwright-scenarios
{
  "version": 1,
  "scenarios": [
    {
      "id": "homepage-browsing",
      "title": "Homepage browsing",
      "tags": ["smoke", "storefront"],
      "steps": [
        { "goto": "/de" },
        { "expectHeading": "Brauchst du Freiraum?" },
        { "expectText": "Unsere Leistungen" },
        { "expectText": "NVMe SSD Speicher" },
        { "expectText": "DNS-Verwaltung" },
        { "expectText": "Kostenlose Beratung" }
      ]
    },
    {
      "id": "language-switch",
      "title": "German to English language switch",
      "tags": ["smoke", "localization"],
      "steps": [
        { "goto": "/de" },
        { "expectHeading": "Brauchst du Freiraum?" },
        { "goto": "/en" },
        { "expectUrl": "/en" },
        { "expectHeading": "Need some space?" },
        { "expectText": "Our services" }
      ]
    },
    {
      "id": "client-login-guard",
      "title": "Client dashboard redirects to login",
      "tags": ["auth", "client"],
      "steps": [
        { "goto": "/client" },
        { "expectUrl": "/login?next=%2Fclient" },
        { "expectHeading": "Login" },
        { "expectText": "Forgot password?" }
      ]
    },
    {
      "id": "admin-login-guard",
      "title": "Admin console redirects to admin login",
      "tags": ["auth", "admin"],
      "steps": [
        { "goto": "/admin" },
        { "expectUrl": "/admin/login?next=%2Fadmin" },
        { "expectHeading": "Admin Login" },
        { "expectText": "First admin setup" }
      ]
    },
    {
      "id": "hosting-product-browsing",
      "title": "Hosting order entry page browsing",
      "tags": ["storefront", "hosting"],
      "steps": [
        { "goto": "/en/webhosting" },
        { "expectHeading": "Web hosting you actually understand." },
        { "expectText": "Daily backups" },
        { "expectText": "What exactly is web hosting?" },
        { "expectText": "Ask a question" }
      ]
    },
    {
      "id": "client-login-dashboard",
      "title": "Client login opens dashboard",
      "tags": ["auth", "client", "dashboard"],
      "requiresEnv": ["E2E_CLIENT_EMAIL", "E2E_CLIENT_PASSWORD"],
      "steps": [
        { "login": { "scope": "client", "emailEnv": "E2E_CLIENT_EMAIL", "passwordEnv": "E2E_CLIENT_PASSWORD" } },
        { "expectUrl": "/client" },
        { "expectText": "Dashboard" },
        { "expectText": "Services" },
        { "expectText": "Invoices" }
      ]
    },
    {
      "id": "client-invoice-view",
      "title": "Client invoice view opens",
      "tags": ["billing", "client"],
      "requiresEnv": ["E2E_CLIENT_EMAIL", "E2E_CLIENT_PASSWORD"],
      "steps": [
        { "login": { "scope": "client", "emailEnv": "E2E_CLIENT_EMAIL", "passwordEnv": "E2E_CLIENT_PASSWORD" } },
        { "goto": "/client/invoices" },
        { "expectText": "Invoices" },
        { "expectText": "Status" }
      ]
    },
    {
      "id": "ticket-creation",
      "title": "Client creates support ticket",
      "tags": ["support", "client", "mutating"],
      "requiresEnv": ["E2E_CLIENT_EMAIL", "E2E_CLIENT_PASSWORD", "E2E_RUN_MUTATING"],
      "steps": [
        { "login": { "scope": "client", "emailEnv": "E2E_CLIENT_EMAIL", "passwordEnv": "E2E_CLIENT_PASSWORD" } },
        { "goto": "/client/tickets/new" },
        { "select": { "label": "Department", "value": "SUPPORT" } },
        { "select": { "label": "Priority", "value": "NORMAL" } },
        { "fill": { "label": "Subject", "value": "Playwright smoke ticket" } },
        { "fill": { "label": "Message", "value": "Automated E2E smoke ticket from Playwright." } },
        { "click": { "role": "button", "name": "Create ticket" } },
        { "expectUrl": "/client/tickets/" },
        { "expectText": "Playwright smoke ticket" }
      ]
    },
    {
      "id": "admin-login-check",
      "title": "Admin login opens console",
      "tags": ["auth", "admin"],
      "requiresEnv": ["E2E_ADMIN_EMAIL", "E2E_ADMIN_PASSWORD"],
      "steps": [
        { "login": { "scope": "admin", "emailEnv": "E2E_ADMIN_EMAIL", "passwordEnv": "E2E_ADMIN_PASSWORD" } },
        { "expectUrl": "/admin" },
        { "expectText": "Admin" },
        { "expectText": "MRR" },
        { "expectText": "Support" }
      ]
    }
  ]
}
```

## Step Cheat Sheet

- `goto`: relative path or absolute URL.
- `expectHeading`: visible heading text.
- `expectText`: visible text anywhere on page.
- `expectUrl`: path or URL fragment.
- `select`: `{ "label": "...", "value": "..." }`.
- `fill`: `{ "label": "...", "value": "..." }`, also supports `name`, `placeholder`, or `css`.
- `check`: same locator shape as `fill`.
- `click`: text string, `{ "role": "button", "name": "..." }`, or `{ "text": "..." }`.
- `login`: browser login helper for `client` or `admin`.
- `requiresEnv`: env vars needed. Missing vars mark scenario skipped.
- `tags`: use `E2E_TAGS=smoke,auth` to run matching scenarios only.
