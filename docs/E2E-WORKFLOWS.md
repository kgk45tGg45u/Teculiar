# Discovered Customer-Lifecycle Workflows

This document records the business logic the comprehensive E2E suite was built
against, discovered from the codebase (`apps/api`, `apps/web`) and verified live
on production (https://www.dezhost.com). The tests assert the **actual** behaviour
described here — nothing is hardcoded where the codebase already encodes the rule.

> Source of truth: `apps/api/src/modules/{orders,billing,products,cron,external}`,
> `apps/web/components/{checkout,portal}`, `prisma/schema.prisma`.

---

## 1. Checkout (storefront)

`apps/web/components/checkout/checkout-form.tsx` → `apps/api` `OrdersController`.

1. `POST /orders/checkout` `{ items[], customer }` — **order creation is deferred**.
   The backend prices the items, runs the system-wide uniqueness check, creates a
   **PENDING invoice** carrying an `orderSnapshot`, and returns `{ invoice, order: { id: invoice.id } }`.
   The **invoice id doubles as the checkout/session id** until payment succeeds.
2. `POST /orders/:id/pay` `{ method, paymentMethodId, iban? }` — pays the invoice.
   - **Synchronous success** (sandbox / unconfigured gateway): the order is created
     now (`ensureOrderForInvoice`), `onInvoicePaid` runs provisioning in the background.
   - **Redirect gateways** (PayPal / Mollie): the invoice stays `PENDING` and a
     `paymentRedirectUrl` is returned; the order is created later on confirm-payment.
3. `POST /billing/invoices/:id/confirm-payment` — captures redirect payments. For a
   brand-new customer it returns an `accessToken` so the storefront auto-logs-in.

### Customer types
- **New customer**: checkout is called **without** auth and **with** a password. The
  backend creates a *pending checkout user*; on payment it is **materialised** into a
  real `User` (`materializePaidCheckoutUser`) with that email + password.
- **Existing customer**: checkout is called **with** a client JWT. The account's email
  is used; password is ignored. (An anonymous checkout with an already-registered
  email is rejected unless the correct password is supplied.)

## 2. Authentication

- `POST /auth/login` → `{ accessToken, refreshToken, user.roles }`.
- Cookies the web app reads: `teculiar_client_access_token` / `teculiar_admin_access_token`
  (+ `_refresh_token`). Client and admin scopes are independent.
- Portal pages are guarded by middleware; injecting the access cookie is enough to load them.

## 3. Payment gateways

Configured & enabled on production (verified): **CREDIT_CARD** (Mollie), **PAYPAL**,
**SEPA** (Mollie direct debit), **BANK_TRANSFER** (manual wire). **SANDBOX** exists
but is disabled by default.

Key mechanic (`apps/api/.../processors/abstract-payment.service.ts`):

| Method | `paymentMethodId` | Result |
|---|---|---|
| any | `sandbox` | **forced synchronous SUCCEEDED** (no external call, amount>0) |
| CREDIT_CARD | `creditcard` | Mollie hosted page → `PENDING` + `mollie.com` redirect |
| PAYPAL | `paypal_redirect` | PayPal order → `PENDING` + `paypal.com` approval URL |
| PAYPAL | `paypal` | JS-SDK popup mode (no redirect URL) |
| SEPA | `sepa` (+ IBAN) | mandate + recurring charge → `PENDING` |
| BANK_TRANSFER | `bank_transfer` | invoice stays `PENDING`, manual `BANK_TRANSFER` txn, SALES ticket on "I have paid" |

`paymentMethodId="sandbox"` is the deterministic path the suite uses for full-lifecycle
tests — it does not require the storefront SANDBOX gateway to be enabled and creates no
production-visible config change.

## 4. Domain workflows

Domain handling is driven by item `configuration.domainAction` / hosting `domainUse`:

- **register** → `external.resellBiz.register()` (Resell.biz **TEST API** `test.httpapi.com`).
- **transfer** → `external.resellBiz.transfer()` (requires an auth code).
- **external / none** → no registrar call; the customer points existing DNS.
- **`.de` is special**: routed to *manual* registration and skipped by the registrar,
  so the suite uses `.com` (configurable) for register/transfer.

**Uniqueness rule** (`orders.service.ts assertOrderItemsAvailable`): a domain name may
be active only once **per type, system-wide** — a 2nd active domain *registration* OR a
2nd active *hosting* service for the same name is rejected (HTTP 400), but **one domain +
one hosting for the same name is allowed** (the normal "register then host" flow).
"Active" means status NOT IN `CANCELLED/EXPIRED/FAILED` (so even `PENDING` blocks a dup).

## 5. Hosting / VPS provisioning

`billing.service.ts onInvoicePaid → processPaidService` after payment:

- **SHARED_HOSTING → Virtualmin** (`VirtualminProviderService`): a **real** `create-domain`
  call on the panel. Service starts `PENDING/PROVISIONING` and becomes **ACTIVE** when the
  panel confirms (first-activation logic). **These accounts are torn down by the suite.**
- **VPS / DEDICATED_SERVER → Hetzner** (`HetznerProviderService`): a **stub** — returns a
  fake server id and `PROVISIONING`; it has no `status()` method, so VPS **never
  auto-activates** and stays `PROVISIONING`. No real server is created, nothing to tear down.
- Status is re-checked by the cron every 15 min (Phase 3.5: page views read stored DB state only —
  the `?refresh=1` on-view probe was removed).

## 6. Service & domain activation

- Hosting: `PENDING → PROVISIONING → ACTIVE` once Virtualmin reports the domain exists.
- Domain: `PENDING → ACTIVE` once Resell.biz reports `active/invoicepaid/transfer complete`.
- The portal reads stored state via `GET /services`; only the cron reconcile (or the admin
  `POST /admin/dev/services/refresh`) talks to the provider. The suite polls `GET /services`
  up to **4 minutes** for ACTIVE (the cron flips it).

## 7. Wallet / add funds

`POST /billing/add-funds { amountCents, method }` creates a "Funds deposit" invoice
(`orderSnapshot.accountCreditCents`) and pays it. `method:"SANDBOX"` → synchronous; on
success `finalizePaidInvoice → addUserBalance` credits `User.balanceCents`. Balance is
read from `GET /users/me` and shown in the portal.

## 8. Invoice generation & automation (cron)

- `POST /billing/invoices` (admin) creates an invoice from lines (a `CUSTOM`, 0%-VAT line
  yields a total exactly equal to the amount).
- Cron entry points: `GET|POST /cron` (secret) and `POST /cron/admin/run` (admin JWT).
- `cron → billingMaintenance → payInvoicesAutomatically(now)`: for due (`dueAt<=now`),
  `PENDING/OVERDUE`, `total>0` invoices —
  - if **wallet balance ≥ total** → debit balance, mark **PAID**, record an
    `ACCOUNT_BALANCE` transaction (the deterministic path the suite tests);
  - else if the user has a **valid automatic payment method** → charge the remainder.
- Cron also renews due subscriptions, marks overdue invoices, suspends unpaid hosting,
  refreshes domain/hosting statuses, sends reminders, and regenerates the sitemap.

## 9. Dashboard (client portal)

Single SPA (`components/portal/client-dashboard.tsx`) over per-area routes:

| Area | Page | Data source |
|---|---|---|
| Services | `/client/services` | `GET /services` (type ≠ DOMAIN) |
| Domains | `/client/domains` | `GET /services` (type = DOMAIN → DomainRecords) |
| Invoices | `/client/invoices` | `GET /billing/invoices` |
| Add funds | `/client/billing/add-funds` | `POST /billing/add-funds` |
| Profile / wallet | `/client/profile` | `GET /users/me` (`balanceCents`) |

Paid invoices show **no badge** (only Pending/Overdue are badged) — see
`apps/web/lib/status-labels.ts`.

## 10. Status model (canonical)

`prisma/schema.prisma`:

- **OrderStatus**: `PENDING → PROVISIONING → COMPLETE` (+ `FAILED`, `CANCELLED`).
- **InvoiceStatus**: `PENDING`, `PAID`, `OVERDUE`, `FAILED`, `CANCELLED`, `REFUNDED`.
- **ServiceStatus**: `PENDING`, `PROVISIONING`, `ACTIVE`, `SUSPENDED`, `CANCELLED`, `TERMINATED`, `FAILED`, `PROVISIONING_FAILED`.
- **DomainStatus**: `PENDING`, `PENDING_TRANSFER`, `ACTIVE`, `TRANSFERRING`, `EXPIRED`, `LOCKED`, `SUSPENDED`, `CANCELLED`, `FAILED`.
- **TransactionStatus**: `PENDING`, `SUCCEEDED`, `FAILED`, `REFUNDED`.
