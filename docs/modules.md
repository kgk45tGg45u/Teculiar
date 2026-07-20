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
| `tecreator`  | `platform` | Provisions whole Teculiar tenants (Teculiar.com's own catalog) |
| `paypal`     | `payment`  | PayPal checkout + vault charges                     |
| `mollie`     | `payment`  | Credit card, SEPA Direct Debit, PayPal-via-Mollie   |

Products connect to a module through their own `provisioningModule` field. Since **Phase 6.2 the
resolution is product-first** — one shared chain in `module-catalog.ts`
(`effectiveProductModule` / `effectiveServiceModule`):

1. the product's own `provisioningModule` (`"none"` = explicit MANUAL provisioning, stops the chain);
2. for services, the `Service.moduleName` snapshot captured at provision time;
3. the category's `provisioningModule` — now only a **default** (prefilled into the admin product
   form for new products; migration `20260719130000` backfilled it onto every existing product);
4. the product-type default (`VPS`/`DEDICATED_SERVER` → `hetzner`, else `virtualmin`).

## Module-gated notification emails

Some notification events **ship with a module** and only exist while that module is active
(`apps/api/src/modules/email/email-events.ts`, each event's `module` field):

| Event(s)                                                              | Module        | Kind       |
|----------------------------------------------------------------------|---------------|------------|
| `hosting_account_information` / `_suspended` / `_terminated`          | `virtualmin`  | hosting    |
| `domain_information`                                                  | `resellbiz`   | registrar  |

When the module is inactive these events are **hidden from Admin → Emails** and **never dispatched**
(`isEmailEventModuleActive` gates both `adminSettings` and `dispatch`). Turning the module back on restores
them. All other events (billing, account, support) are always available.

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

## Payment modules (`payment` kind, Phase 6.4)

`paypal` and `mollie` are catalog entries with **no config fields**: their credentials stay in
`PaymentProcessorConfig` (Admin → Settings → Payment Gateways, one row per checkout method).
`PaymentRegistryService` resolves a checkout method to a provider service
(`processors/paypal-provider.service.ts` / `mollie-provider.service.ts` /
`sandbox-provider.service.ts`, all implementing `PaymentProvider`): the stored config shape picks
the provider (a Mollie `apiKey` on the PAYPAL row wins over PayPal credentials), and the module
toggle on the Modules page is a **kill switch** — while off, the module's methods disappear from
`/storefront/payment-gateways` and any charge falls back to the sandbox provider. Adding a
gateway = one catalog entry + one `PaymentProvider` registered in the registry.

## Domain pricing without a registrar

When no registrar module is active, TLD prices are managed manually in the **Domain Prices** table
(`DomainTldPrice`); the "Sync from Resell.biz" button is hidden. The storefront pricing page and
checkout only show/charge TLDs that have a real price (`amountCents > 0`) — unpriced rows are hidden.
