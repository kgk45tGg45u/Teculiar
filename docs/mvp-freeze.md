# MVP Freeze: Order, Billing, Invoice, Payment

This freeze protects the storefront money path. After it passes, only blockers should change checkout, billing, invoice numbering, payment confirmation, or provisioning lifecycle.

## Freeze Checklist

- Guest checkout creates an order, unpaid invoice, pending service/domain rows, then pays by sandbox.
- Logged-in checkout sends auth to `/orders/checkout` and allows the same account email.
- Successful payment finalizes invoice numbering before client/admin display.
- Customer `Kundennummer` is a persisted six-digit value and never reuses an order or invoice number.
- Client is sent to `/client` immediately after payment confirmation.
- Hosting and domain provisioning run after payment and never mark service `ACTIVE` unless the module succeeds.
- Provider failures keep service/domain non-active, leave order `PROVISIONING`, and write module/audit logs.
- Resell.biz domain tests use the test API, not live production.
- `.de` registrations stay manual and log the registrar skip reason.

## Automated Gate

Run from repo root:

```sh
npm test
npm run typecheck
npm run build
npm --workspace @crimson/api run resellbiz -- env-check
```

Expected:

- All tests pass except explicitly skipped sandbox-only tests.
- `resellbiz -- env-check` shows credentials present and test API config for MVP registration testing.
- Paid invoice UI shows the final invoice number, not `N-...`.

## Manual Smoke

1. Start API and web:

```sh
npm --workspace @crimson/api run start:dev
npm --workspace @crimson/web run dev
```

2. Guest hosting checkout:
   - Open storefront hosting product.
   - Use new email and sandbox payment.
   - Confirm redirect lands on `/client?...`.
   - Confirm dashboard shows order/service quickly.
   - Confirm service remains pending/provisioning until Virtualmin module succeeds.

3. Logged-in checkout:
   - Log in as existing client.
   - Order with same profile email.
   - Confirm no "Email is already registered" error.
   - Confirm `/orders/checkout` received auth and payment succeeds.

4. Domain checkout:
   - Use a non-`.de` test domain.
   - Pay with sandbox.
   - Confirm Resell.biz test API/module log appears.
   - Confirm domain becomes active only on module success.

5. Provider failure:
   - Break Resell.biz or Virtualmin test config.
   - Pay order.
   - Confirm invoice is paid/final-numbered.
   - Confirm order is `PROVISIONING`, service/domain is non-active, and logs show failure.

6. Invoice views:
   - Check admin order, admin invoice, admin client, client invoice list/detail.
   - Paid invoices must show final invoice number everywhere.
   - Check HTML and PDF downloads keep the formatted German invoice layout and six-digit `Kundennummer`.

## Allowed MVP Test Env

- Payments: internal sandbox gateway first.
- Domains: Resell.biz test API only.
- Hosting: Virtualmin test/staging account only.
- Live Mollie/PayPal validation can remain post-freeze unless sandbox checkout is blocked.

## Non-MVP / Manual

- `.de` registrations/transfers are manual and must not call Resell.biz.
- Failed module retry remains admin/manual unless a successful module log already exists.
- Production provider credentials and live payment webhooks are post-freeze hardening.
