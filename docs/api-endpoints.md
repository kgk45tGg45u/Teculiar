# REST API Endpoints

Base URL: `/api/v1`

## Auth

- `POST /auth/register`
- `POST /auth/bootstrap-admin` - creates the first admin only while no admin exists.
- `POST /auth/login`
- `POST /auth/refresh`
- `POST /auth/logout`
- `POST /auth/2fa/setup`
- `POST /auth/2fa/verify`

## Users and Teams

- `GET /users/me`
- `PATCH /users/me`
- `GET /users/me/export`
- `DELETE /users/me`
- `GET /users`
- `GET /users/:id`
- `PATCH /users/:id/segment`
- `GET /teams/:id`
- `POST /teams/:id/members`

## Products and Services

- `GET /storefront/products`
- `GET /storefront/settings` - public checkout settings, including VAT percent.
- `GET /storefront/payment-gateways` - public enabled payment methods for checkout. API credentials are not exposed.
- `GET /products`
- `POST /products`
- `POST /admin/dev/products` - temporary unguarded product create endpoint until admin auth UI is wired.
- `PATCH /admin/dev/products/:id` - temporary unguarded product update endpoint until admin auth UI is wired.
- `GET /products/:id`
- `PATCH /products/:id`
- `GET /services`
- `POST /services`
- `GET /services/:id`
- `POST /admin/dev/services/refresh` - admin/manual service and domain status refresh. The API server also runs this once per day and stores the latest provider status in the database.
- `POST /services/:id/upgrade`
- `POST /services/:id/cancel`
- `POST /services/:id/restart`

## Orders and Checkout

- `POST /orders/preview`
- `POST /orders/checkout`
- `POST /orders/:id/pay`
- `GET /orders/:id`
- `PATCH /orders/:id/status` - temporary admin order status update. Accepts `completed`, `in_progress`, or `canceled`.
- `GET /domains/search?domain=example.com`
- `GET /orders/admin` - temporary unguarded admin queue endpoint until the admin auth UI is wired.
- `GET /orders/admin/domain-prices` - temporary unguarded Resell.biz TLD price table.
- `POST /orders/admin/domain-prices` - temporary unguarded manual TLD price and suggested TLD update.
- `POST /orders/admin/domain-prices/sync` - temporary unguarded Resell.biz pricing sync trigger for cron/admin use.

Lifecycle notes:
- Storefront checkout may create an order, unpaid invoice, pending services, and pending domain records before payment. New-client login must happen only after successful payment materializes the real client user.
- After successful payment, send the client to the dashboard fast. Domain and hosting provisioning runs in the background.
- Shared-hosting services must stay `PENDING` until the Virtualmin create/status API proves the domain exists on the Virtualmin server. Never mark hosting `ACTIVE` from payment alone.
- Virtualmin hosting create requires the customer domain name. If no domain name is present in service configuration, provisioning must fail or stay non-active; do not create nameless Virtualmin services.
- Domain registrations and transfers must write Resell.biz module/audit logs. `.de` registrations are manual and should log a Resell.biz skip reason instead of silently doing nothing.

## Billing

- `GET /billing/invoices`
- `POST /billing/invoices`
- `GET /billing/invoices/:id`
- `POST /billing/invoices/:id/send`
- `POST /billing/invoices/:id/pay` - gateway payment; successful payment finalizes the invoice number and triggers `onInvoicePaid`.
- `POST /billing/invoices/:id/mark-paid` - admin/manual payment; same lifecycle behavior as gateway payment.
- `POST /billing/invoices/:id/mark-unpaid` - admin/manual reversal; keeps the invoice final number, creates audit metadata, and suspends linked hosting services without termination.
- `DELETE /billing/invoices/:id` - admin invoice delete.
- `POST /billing/subscriptions`
- `POST /billing/subscriptions/:id/renew`
- `GET /admin/dev/billing/settings` - temporary admin billing settings, including VAT percent.
- `PATCH /admin/dev/billing/settings` - temporary admin billing/invoice settings update. Stores company address, USt-IdNr, VAT percent, footer, payment instructions, and bank details.
- `GET /admin/dev/billing/payment-gateways` - temporary admin payment gateway settings. Stores provider/API config in `PaymentProcessorConfig`.
- `PATCH /admin/dev/billing/payment-gateways` - temporary admin payment gateway update. Checkout uses only enabled method names/titles.
- `POST /admin/dev/module-logs/:id/retry` - temporary admin module retry guard. Skips retry when a successful module log already exists for the same target/action.
- `GET /admin/dev/virtualmin/templates` - temporary admin helper for Virtualmin plans/templates.
- `GET /admin/dev/virtualmin/plans/detect` - temporary admin helper that fetches Virtualmin plans server-side and shows real names/options for confirmation.
- `POST /admin/dev/virtualmin/plans/sync` - temporary admin helper that saves confirmed Virtualmin hosting package names/options into products. Admin still sets billing-cycle prices.
- `DELETE /admin/dev/products/:id` - temporary admin helper to deactivate a product.
- `GET /services/:id/hosting-panel` - active shared-hosting controls, usage, links, mailboxes, databases, FTP users, subdomains, and email-client instructions.
- `POST /services/:id/hosting-panel` - active shared-hosting control action endpoint for add/remove/password actions.
- `GET /billing/transactions`
- `POST /billing/coupons`
- `GET /billing/reports/revenue`

## Tickets

- `GET /tickets`
- `POST /tickets`
- `GET /tickets/:id`
- `POST /tickets/:id/replies`
- `POST /tickets/:id/internal-notes`
- `PATCH /tickets/:id/assign`
- `PATCH /tickets/:id/status`
- `GET /tickets/canned-replies`

## CMS

- `GET /cms/pages/:locale/:slug`
- `POST /cms/pages`
- `PATCH /cms/pages/:id`
- `GET /cms/posts`
- `POST /cms/posts`
- `POST /cms/translations/auto`
- `PATCH /cms/translations/:id/manual-override`

## External Provider Placeholders

- `POST /external/domains/search`
- `POST /external/domains/register`
- `POST /external/domains/transfer`
- `POST /external/hosting/provision`
- `POST /external/servers/provision`

## Temporary Tools

- `GET /virtualmin-client`
- `POST /virtualmin-client`

## Temporary Scripts

- `npm --workspace @crimson/api run resellbiz` - Resell.biz domain status, auth code, nameserver, and transfer script. See `docs/resellbiz-client.md`.
