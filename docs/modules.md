# Integration Modules

Integration modules connect the platform to external providers. They are managed in
**Admin → Products → Modules** and are **pluggable**: disabling or removing one only turns off the
automation it provides — products, categories, invoices and the rest of the system keep working, with
the corresponding tasks then done manually by an admin.

## Registry & kinds

Modules are described by a code catalog (`apps/api/src/modules/module-registry/module-catalog.ts`) and
their enabled-state + config are stored in `SystemSetting` rows (`module.<name>.<field>`). The
`ModuleRegistryService` resolves config values from the DB first and falls back to the prod/dev `.env`.

Every module declares a **kind**. Kinds are open-ended; today:

| Module       | Kind       | Provides                                            |
|--------------|------------|-----------------------------------------------------|
| `resellbiz`  | `registrar`| Domain registration, transfer, renewal, price sync  |
| `virtualmin` | `hosting`  | Shared-hosting account provisioning & management     |

Future server-provider modules (e.g. Hetzner) will add a new kind and a catalog entry without touching
core logic. Products and product categories connect to a module through their `provisioningModule`
field.

## Disabling a module

- Provisioning that resolves to a **disabled** module is left `QUEUED` for the admin to handle manually
  (no provider call is made). See `runServiceModule` / `runDomainModule` in `billing.service.ts`.
- The expiry/status cron only runs when a registrar module is **active**, and only for domains whose
  registrar resolves to an active registrar module — manual (admin-registered) domains are skipped.
- An unknown module name (no catalog entry) defaults to **active** so legacy/`.env`-only providers keep
  working.

## Resell.biz (registrar)

Config fields (Admin → Products → Modules → Resell.biz):

- **API mode** — `Test` (`https://test.httpapi.com`) or `Live` (`https://httpapi.com`).
- **Reseller ID** — the LogicBoxes `auth-userid`.
- **API key** — stored encrypted-at-rest in the DB; shown masked. Blank on save keeps the stored key.
- **Default name servers** — used when the customer leaves name servers blank at checkout.

Name-server resolution for a registration (always **≥ 2** name servers are sent):

1. Customer-supplied name servers from checkout (if two or more).
2. The module's configured default name servers.
3. Platform fallback: `ns5.dezhost.com`, `ns6.dezhost.com`.

The customer + contact records are created on Resell.biz per registration from the order's contact
data (the customer ID / contact IDs are **not** configured).

`.env` fallbacks: `RESELLBIZ_API_KEY` / `RESELLBIZ_PASSWORD`, `RESELLBIZ_RESELLER_ID` /
`RESELLBIZ_AUTH_USERID`, `RESELLBIZ_API_BASE_URL`, `RESELLBIZ_DEFAULT_NS`.

## Virtualmin (hosting)

Config fields:

- **Virtualmin Server URL**, **Admin Username**, **Admin Password** (masked), **Allow Self-Signed SSL**.
- **Minutes between server jobs** — a single global minimum delay enforced between Virtualmin
  create / suspend / delete jobs. Virtualmin cannot process simultaneous server CRUD, so all writes are
  serialized in-process and spaced by this delay. Reads/status are never throttled. `0` disables it.

`.env` fallbacks: `VIRTUALMIN_ADMIN_ENDPOINT`, `VIRTUALMIN_ADMIN_USERNAME`,
`VIRTUALMIN_ADMIN_PASSWORD`, `VIRTUALMIN_ADMIN_ALLOW_SELF_SIGNED`.

## Domain pricing without a registrar

When no registrar module is active, TLD prices are managed manually in the **Domain Prices** table
(`DomainTldPrice`); the "Sync from Resell.biz" button is hidden. The storefront pricing page and
checkout only show/charge TLDs that have a real price (`amountCents > 0`) — unpriced rows are hidden.
