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

- `GET /products`
- `POST /products`
- `GET /products/:id`
- `PATCH /products/:id`
- `GET /services`
- `POST /services`
- `GET /services/:id`
- `POST /services/:id/upgrade`
- `POST /services/:id/cancel`
- `POST /services/:id/restart`

## Billing

- `GET /billing/invoices`
- `POST /billing/invoices`
- `GET /billing/invoices/:id`
- `POST /billing/invoices/:id/send`
- `POST /billing/invoices/:id/pay`
- `POST /billing/subscriptions`
- `POST /billing/subscriptions/:id/renew`
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
- `POST /external/hosting/provision`
- `POST /external/servers/provision`
