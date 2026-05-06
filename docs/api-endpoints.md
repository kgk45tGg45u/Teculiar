# REST API Endpoints

Base URL: `/api/v1`

## Auth

- `POST /auth/register`
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
- `GET /products`
- `POST /products`
- `POST /admin/dev/products` - temporary unguarded product create endpoint until admin auth UI is wired.
- `PATCH /admin/dev/products/:id` - temporary unguarded product update endpoint until admin auth UI is wired.
- `GET /products/:id`
- `PATCH /products/:id`
- `GET /services`
- `POST /services`
- `GET /services/:id`
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

## Billing

- `GET /billing/invoices`
- `POST /billing/invoices`
- `GET /billing/invoices/:id`
- `POST /billing/invoices/:id/send`
- `POST /billing/invoices/:id/pay`
- `POST /billing/subscriptions`
- `POST /billing/subscriptions/:id/renew`
- `GET /admin/dev/billing/settings` - temporary admin billing settings, including VAT percent.
- `PATCH /admin/dev/billing/settings` - temporary admin billing settings update.
- `GET /admin/dev/virtualmin/templates` - temporary admin helper for Virtualmin plans/templates.
- `DELETE /admin/dev/products/:id` - temporary admin helper to deactivate a product.
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
