# E2E Framework — Architecture & Execution

A maintainable, Page-Object-Model Playwright suite that validates the **complete
customer lifecycle** on the live site. Built from small, reusable building blocks so
~47 meaningful tests share one set of factories, flows, fixtures, and page objects
instead of duplicating checkout/payment code.

- Discovered business logic: [E2E-WORKFLOWS.md](./E2E-WORKFLOWS.md)
- Test matrix: [E2E-TEST-MATRIX.md](./E2E-TEST-MATRIX.md)

## TL;DR

```bash
# Credentials live in .env (E2E_* and VIRTUALMIN_ADMIN_*). Then:
npm run e2e:lifecycle                 # full suite against https://www.dezhost.com
npm run e2e:lifecycle -- --grep "Category 6"   # one category
npm run e2e:lifecycle:report          # open the HTML report
npm run e2e:lifecycle:typecheck       # type-check the framework only
```

## Layout

```
tests/e2e/
  config/env.ts            # one place for URLs, creds, flags, timeouts, domain settings
  helpers/
    api-client.ts          # typed client for the whole /api/v1 contract (token cache)
    auth.ts                # browser auth: inject cookies / drive the login form
    catalog.ts             # product/price selectors
    records.ts             # match hosting/vps/domain services + domain records
    polling.ts             # pollUntil() — explicit waits, no sleeps
    money.ts               # cents helpers
    unique.ts              # collision-free emails / domains / slugs
    gateways.ts            # enable + restore the SANDBOX gateway
    virtualmin.ts          # delete-domain teardown via remote.cgi
    teardown-registry.ts   # crash-safe record of created hosting accounts
    diagnostics.ts         # attach JSON/text to the report on failure
  factories/               # CustomerFactory, DomainFactory, OrderFactory, InvoiceFactory
  pages/                   # BasePage, LoginPage, CheckoutPage, ClientPortalPage, AdminPage
  flows/
    catalog.flow.ts        # resolve the live catalogue once (cached)
    checkout.flow.ts       # hostingOrder / vpsOrder / domainOnlyOrder building blocks
    provisioning.flow.ts   # waitForHostingActive / waitForDomainActive / VPS waits
  fixtures/test-fixtures.ts# extends `test` with api/adminApi/clientApi, catalog,
                           #   checkoutDeps, page objects, and per-test Virtualmin teardown
  global-setup.ts          # validate creds, sweep orphans, enable sandbox (record prior)
  global-teardown.ts       # sweep created accounts, restore sandbox
  specs/lifecycle/*.spec.ts# the 11 lifecycle spec files
  tsconfig.json            # strict type-check for the framework
playwright.lifecycle.config.ts   # dedicated parallel config (HTML/trace/screenshot/video)
```

## Building blocks (how a test is written)

```ts
import { test, expect } from "../../fixtures/test-fixtures";
import { hostingOrder } from "../../flows/checkout.flow";
import { waitForHostingActive } from "../../flows/provisioning.flow";

test("hosting provisions to ACTIVE", async ({ checkoutDeps, clientApi }) => {
  const order = await hostingOrder(checkoutDeps, { buyer: { kind: "new" }, scenario: "register" });
  expect(order.paidInvoice.status).toBe("PAID");          // invoice
  const wait = await waitForHostingActive(clientApi, order.hostingDomain); // provisioning
  expect(wait.status).toBe("ACTIVE");                     // service
});
```

The `checkoutDeps` fixture already carries the resolved catalogue, an anonymous API
client, a client factory, and the teardown hook — so a spec never re-implements
checkout, payment, or cleanup.

### Fixtures (`fixtures/test-fixtures.ts`)

| Fixture | What it gives you |
|---|---|
| `api` | anonymous `ApiClient` (no token) |
| `makeApi` | factory for a fresh `ApiClient` |
| `adminApi` / `clientApi` | `ApiClient` logged in as admin / the shared E2E client |
| `catalog` | resolved live products (hosting tiers, VPS, domain) |
| `checkoutDeps` | bundle passed to the checkout flows |
| `teardown` | `registerHostingDomain(d)` → deleted after the test |
| `checkoutPage` / `loginPage` / `portalPage` / `adminPage` | page objects |

## Configuration (`config/env.ts`)

Everything is environment-overridable. Defaults target production.

| Var | Default | Purpose |
|---|---|---|
| `E2E_BASE_URL` / `E2E_API_URL` | `https://www.dezhost.com` / `…/api/v1` | targets |
| `E2E_ADMIN_EMAIL/PASSWORD` | — | admin login (cron, gateways, invoices) |
| `E2E_CLIENT_EMAIL/PASSWORD` | — | reusable existing-customer account |
| `VIRTUALMIN_ADMIN_ENDPOINT/USERNAME/PASSWORD` | — | hosting teardown |
| `E2E_ENABLE_SANDBOX` | `1` | enable+restore the SANDBOX gateway for the run |
| `E2E_TEARDOWN_HOSTING` | `1` | delete created Virtualmin accounts |
| `E2E_PROVISIONING_TIMEOUT_MS` | `240000` | provisioning poll deadline (4 min) |
| `E2E_HOSTING_PROVISION_GAP_MS` | `8000` | small buffer before each hosting create |
| `E2E_HOSTING_PROVISION_SETTLE_MS` | `25000` | hold after ACTIVE for the Apache reload |
| `E2E_WORKERS` | `4` (3 in CI) | parallel workers |
| `E2E_REGISTER_TLD` / `E2E_EXTERNAL_TLD` | `com` | TLDs for generated domains (never `.de`) |

## Sandbox payment (why & safety)

Full-lifecycle tests need a **deterministic, synchronous** "payment succeeded".
The platform provides this via `paymentMethodId="sandbox"` (forced success, no real
money). API-driven tests use it directly with **no production config change**. For the
**UI** checkout to offer a Sandbox radio, `global-setup` temporarily **enables** the
SANDBOX storefront gateway and **records its prior state**; `global-teardown`
**restores** it — production is left exactly as found. Set `E2E_ENABLE_SANDBOX=0` to opt
out (UI sandbox tests then skip).

## Hosting teardown (no orphaned accounts)

Every successful hosting order creates a real Virtualmin virtual server. The suite:

1. **records** the domain the moment the order is placed (`teardown.registerHostingDomain`,
   also persisted to `tests/e2e/results/created-virtualmin-domains.json`);
2. **deletes** it after the test via `delete-domain` on the panel (per-test fixture);
3. **sweeps** any leftovers in `global-teardown` and at the next run's `global-setup`
   (crash backstop). Domains are generated uniquely, so cleanup is exact.

VPS (Hetzner stub) and domain-only (Resell.biz test API) create nothing real to remove.

## Hosting provisioning throttle (server safety) — IMPORTANT

Virtualmin rewrites the shared Apache config on every `create-domain`. Running two
creates at once — **or even rapid back-to-back creates** — races that rewrite and can
corrupt the server's httpd config (taking the API down). To prevent this, **every**
hosting-creating path (API checkout + UI checkout submit) runs through a single
**cross-worker provisioning gate** (`helpers/provision-gate.ts`) that holds a global
on-disk lock through the *entire* create:

> pay → **wait until the account reports ACTIVE** → settle (`hostingSettleMs`, for the
> Apache reload) → release.

So the next hosting create only begins once the previous one has fully finished on the
server — concurrency-safe regardless of `E2E_WORKERS`. Non-hosting flows never touch the
gate. If the panel is slow you can widen the spacing with `E2E_HOSTING_PROVISION_SETTLE_MS`.
Hosting orders are therefore effectively serialised; expect the hosting-heavy specs to run
sequentially even at high worker counts.

## Reporting & diagnostics

`playwright.lifecycle.config.ts` emits:
- **HTML report** → `tests/e2e/results/lifecycle-html` (`npm run e2e:lifecycle:report`)
- JSON → `tests/e2e/results/lifecycle-results.json`
- Markdown summary → `tests/e2e/results/lifecycle-report.md`
- **Screenshots, traces and video on failure** (`retain-on-failure`)
- Provisioning failures additionally **attach** the last API service snapshot +
  diagnostics so a timeout is debuggable without re-running.

## Parallelism

`fullyParallel: true`. Tests use unique data, so order/domain creation never collides.
The wallet/automation file declares `test.describe.configure({ mode: "serial" })` because
it mutates the shared client's balance; everything else runs concurrently.

## CI

`.github/workflows/e2e-lifecycle.yml` — **manual** (`workflow_dispatch`, with optional
`--grep` and a teardown toggle) and **nightly** (`schedule`). It is deliberately not run
on every push because it provisions real accounts. Required GitHub **secrets**:
`E2E_ADMIN_EMAIL`, `E2E_ADMIN_PASSWORD`, `E2E_CLIENT_EMAIL`, `E2E_CLIENT_PASSWORD`,
`VIRTUALMIN_ADMIN_ENDPOINT`, `VIRTUALMIN_ADMIN_USERNAME`, `VIRTUALMIN_ADMIN_PASSWORD`
(optional repo **vars** `E2E_BASE_URL` / `E2E_API_URL`). The HTML report and (on failure)
traces are uploaded as artifacts.

## Execution recipes

```bash
# Everything
npm run e2e:lifecycle

# A single category / file / test
npm run e2e:lifecycle -- --grep "Category 4"
npm run e2e:lifecycle -- tests/e2e/specs/lifecycle/08-cron-validation.spec.ts
npm run e2e:lifecycle -- --grep "duplicate domain"

# Fast, side-effect-light subset (no hosting provisioning): cron + gateways + wallet
npm run e2e:lifecycle -- --grep "Cron|Payment gateways|Wallet"

# Debug
npm run e2e:lifecycle:headed
npm run e2e:lifecycle:ui

# Leave created accounts in place (skip teardown) for inspection
E2E_TEARDOWN_HOSTING=0 npm run e2e:lifecycle -- --grep "Category 1"
```
