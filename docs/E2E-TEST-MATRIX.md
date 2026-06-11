# E2E Test Matrix — Customer Lifecycle

47 tests across 11 spec files in `tests/e2e/specs/lifecycle/`, built from reusable
building blocks (factories → flows → fixtures). Run with
`npm run e2e:lifecycle`. See [E2E-FRAMEWORK.md](./E2E-FRAMEWORK.md) for architecture and
[E2E-WORKFLOWS.md](./E2E-WORKFLOWS.md) for the discovered business logic.

## Product matrix (live, from `GET /products`)

| Product | Type | Module | Provisioning behaviour | Teardown |
|---|---|---|---|---|
| Silber / Gold / Platin Hosting | `SHARED_HOSTING` | Virtualmin | real account, → ACTIVE | **yes** (delete-domain) |
| Cloud VPS Starter | `VPS` | Hetzner (stub) | stays PROVISIONING, no real server | none |
| Domains | `DOMAIN` | Resell.biz **test API** | register/transfer (throwaway test domains) | none |

## Domain scenarios (hosting)

| Scenario | Backend path | Registrar | Virtualmin |
|---|---|---|---|
| `none` (no domain) | hosting only | — | yes |
| `external` (use existing, no transfer) | hosting only | — | yes |
| `register` (new domain) | hosting + domain item | Resell.biz register | yes |
| `transfer` (transfer in) | hosting + domain item | Resell.biz transfer | yes |
| add existing & host it | domain-only register **then** host the same name | Resell.biz register | yes |

> `none` and `external` share one backend path (hosting under a domain, no registrar);
> they are tested separately for intent/coverage. "Add existing & host it" is a two-step
> flow exercising the *one domain + one hosting per name* allowance.

## Payment gateways

| Gateway | Tested as | Asserted |
|---|---|---|
| SANDBOX | full lifecycle (sync) | invoice **PAID**, order placed, provisioning |
| CREDIT_CARD (Mollie) | initiation | invoice **PENDING** + `mollie.com` redirect |
| PAYPAL | initiation | invoice **PENDING** + `paypal.com` redirect |
| SEPA (Mollie DD) | initiation | SEPA transaction recorded |
| BANK_TRANSFER | manual | invoice **PENDING** + `BANK_TRANSFER` txn |

## Category coverage

| # | Category | Spec | Tests |
|---|---|---|---|
| 1 | Hosting orders (random tier × 4 domain scenarios + free-domain rule) | `01-hosting-orders.spec.ts` | 5 |
| 1 | VPS orders (no domain; + register/transfer/existing-customer) | `02-vps-orders.spec.ts` | 4 |
| 2 | Existing-customer orders (hosting / hosting+domain / VPS / add-existing-&-host) | `03-existing-customer.spec.ts` | 4 |
| 3 | Domain-only (register / transfer / duplicate-rule) | `04-domain-only.spec.ts` | 3 |
| 4 | Service provisioning (hosting→ACTIVE ≤4min ×2, VPS stays PROVISIONING) | `05-service-provisioning.spec.ts` | 3 |
| 5 | Domain provisioning (register progresses, transfer status) | `06-domain-provisioning.spec.ts` | 2 |
| 6 | Wallet / add funds (credit, profile reflects, accumulation) | `07-wallet-and-automation.spec.ts` | 3 |
| 7 | Invoice automation (cron pays from wallet, cron reports it) | `07-wallet-and-automation.spec.ts` | 2 |
| 8 | Cron validation (runs, jobs present, no failures, auth) | `08-cron-validation.spec.ts` | 6 |
| — | UI checkout (POM: new-customer sandbox, portal, rendering) | `09-checkout-ui.spec.ts` | 4 |
| — | Payment-gateway coverage (discovery + per-gateway) | `10-payment-gateways.spec.ts` | 7 |
| — | Dashboard verification (services / domains / invoices, API + UI) | `11-dashboard-verification.spec.ts` | 4 |
| | **Total** | | **47** |

## Customer types

- **New**: created during checkout (unique email + strong password), materialised on
  payment, then logged in — `{ buyer: { kind: "new" } }`.
- **Existing**: the reusable `E2E_CLIENT_*` account, logged-in checkout —
  `{ buyer: { kind: "existing", api: clientApi, email } }`.

## Verifications per successful order

- **Services**: visible, correct product (type + name), billing cycle (when surfaced), status.
- **Domains**: visible, registration/transfer status, expiry shape when present.
- **Invoices**: visible, correct total, payment status (PAID).

## Reliability

- No arbitrary sleeps — explicit polling (`pollUntil`) with deadlines and last-value capture.
- Provisioning waits poll up to **4 minutes**; failures attach API snapshots + diagnostics.
- Unique emails/domains per test avoid cross-run collisions.
- Balance-mutating specs run **serial**; the rest run **in parallel**.
- Hosting creation is **serialised through a cross-worker provisioning gate** that holds
  until each Virtualmin account is fully provisioned + an Apache-reload settle, so the
  server never runs two `create-domain`s at once (which corrupts its httpd config).
- Every created Virtualmin account is deleted (per-test fixture + global sweep backstop).
