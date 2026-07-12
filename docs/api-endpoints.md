# REST API Endpoints

Base URL: `/api/v1`

## Auth

Admin and client are fully separate auth scopes (`User.scope`: `STAFF` vs `CLIENT`). An email is
unique per scope, so the same address can hold an independent admin account and an independent
client account; credentials from one scope never work on the other portal.

- `POST /auth/register` - creates a client login (CLIENT scope only; an email already used by an admin is still free here). Required: `name`, `email`, `password`. Storefront signup may also send `phone`, `companyName`, `vatId`, `address` (`line1`, `postalCode`, `city`, optional `state`), `countryCode`, and `customerType` (`INDIVIDUAL` or `BUSINESS`).
- `POST /auth/bootstrap-admin` - creates the first admin only while no admin exists.
- `POST /auth/login` - body may include `scope`: `"admin"` (admin dashboard) or `"client"` (default; client portal + storefront checkout). Login only searches that scope's accounts.
- `POST /auth/password-reset/request` - body: `email`, optional `scope` (`"admin"`/`"client"`, default client) choosing which scope's account gets the reset link.
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

Customer-number note:
- `User.customerNumber` is a persisted unique integer exposed as a zero-padded six-digit `Kundennummer` in portal/admin/invoice UI. It is separate from order and invoice numbers; existing users are backfilled by migration.

## Products and Services

- `GET /storefront/products`
- `GET /storefront/products?category=webhosting` - public product list filtered by product category slug.
- `GET /storefront/settings` - public checkout settings, including VAT percent.
- `GET /storefront/payment-gateways` - public enabled payment methods for checkout. API credentials are not exposed.
- `GET /products`
- `POST /products`
- `POST /admin/dev/products` - temporary guarded product create endpoint. Accepts `domainRequirement` (`NECESSARY` | `OPTIONAL` | `NOT_NEEDED`) and `freeDomainBillingCycle` (a billing cycle, or null) — see [ordering-and-invoices.md](ordering-and-invoices.md#product-domain-requirement).
- `PATCH /admin/dev/products/:id` - temporary guarded product update endpoint (same `domainRequirement` / `freeDomainBillingCycle` fields).
- `GET /admin/dev/product-categories` - temporary admin category list. Categories own the automation module used by products inside them.
- `POST /admin/dev/product-categories` - temporary admin category create.
- `PATCH /admin/dev/product-categories/:id` - temporary admin category update, including module selection.
- `DELETE /admin/dev/product-categories/:id` - temporary admin category deactivate; linked products are moved out of the category.
- `GET /products/:id`
- `PATCH /products/:id`
- `GET /services` - shared client portal overview/services table source.
- `GET /services?refresh=1` - optional on-demand provider status probe before returning service rows.
- `POST /services`
- `GET /services/:id`
- `POST /admin/dev/services/refresh` - admin/manual service and domain status refresh. The API server also runs this once per day and stores the latest provider status in the database.
- `POST /services/:id/upgrade`
- `POST /services/:id/cancel`
- `POST /services/:id/restart`

## Orders and Checkout

- `POST /orders/preview`
- `POST /orders/checkout` - accepts optional client bearer auth. When auth is present, the token user owns the order and invoice; submitted customer email is not allowed to reassign the order to another existing account.
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
- `GET /billing/invoices/:id/html` - protected German print layout for invoice viewing.
- `GET /billing/invoices/:id/pdf` - protected styled PDF download rendered from the HTML invoice structure.
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
- `DELETE /admin/dev/products/:id` - temporary guarded admin helper to deactivate a product.
- `GET /services/:id/hosting-panel` - active shared-hosting controls, usage, links, mailboxes, databases, FTP users, subdomains, and email-client instructions.
- `POST /services/:id/hosting-panel` - active shared-hosting control action endpoint for add/remove/password actions.
- `GET /billing/transactions`
- `POST /billing/coupons`
- `GET /billing/reports/revenue`

## Tickets

- `GET /tickets`
- `POST /tickets` - creates a ticket with an 8-character public ticket id.
- `GET /tickets/:id` - accepts database id or public ticket id. Client access is scoped to the ticket owner; staff can view all.
- `POST /tickets/:id/replies` - staff replies set status `ANSWERED`; client replies set status `CUSTOMER_REPLY`.
- `POST /tickets/:id/attachments` - guarded multipart upload. Field name: `files`. Allows PNG/JPG/WebP screenshots and PDF files only, max 5 files per upload.
- `POST /tickets/:id/close` - client or staff closes the ticket.
- `POST /tickets/:id/internal-notes`
- `PATCH /tickets/:id/assign`
- `PATCH /tickets/:id/status`
- `GET /tickets/canned-replies`
- `GET /admin/dev/tickets` - temporary guarded staff ticket list.
- `POST /admin/dev/tickets/maintenance` - temporary guarded auto-close helper for answered tickets.

## Knowledgebase

- `GET /knowledgebase` - public published article list.
- `GET /knowledgebase/suggest?q=terms` - public related article lookup used on the new ticket form.
- `GET /knowledgebase/:slug` - public SEO-friendly article detail.
- `GET /admin/dev/knowledgebase` - temporary guarded admin article list.
- `POST /admin/dev/knowledgebase` - temporary guarded admin article create.
- `PATCH /admin/dev/knowledgebase/:id` - temporary guarded admin article update.
- `DELETE /admin/dev/knowledgebase/:id` - temporary guarded admin article delete.

## CMS

- `GET /cms/pages/:locale/:slug`
- `POST /cms/pages`
- `PATCH /cms/pages/:id`
- `GET /cms/posts?locale=de&tag=hosting` - published blog posts, newest first. Optional tag filter powers tag archive pages.
- `GET /cms/posts/:locale/:slug` - published blog post detail.
- `GET /cms/post-tags?locale=de` - unique published blog tags.
- `POST /cms/posts`
- `GET /cms/admin/dev/posts` - guarded admin blog list.
- `POST /cms/admin/dev/blog-assets` - guarded blog image upload. Stores PNG/JPG/WebP under `apps/web/public/uploads/blog`.
- `GET /cms/admin/dev/announcements` - guarded admin announcement list.
- `POST /cms/admin/dev/announcements` - guarded admin announcement create.
- `PATCH /cms/admin/dev/announcements/:id` - guarded admin announcement update.
- `DELETE /cms/admin/dev/announcements/:id` - guarded admin announcement delete.
- `GET /cms/announcements` - client announcement list for the authenticated client, excluding hidden rows.
- `POST /cms/announcements/:id/read` - mark one announcement read for the authenticated client.
- `POST /cms/announcements/:id/hide` - hide one announcement for the authenticated client.
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

- `npm --workspace @dezhost/api run resellbiz` - Resell.biz domain status, auth code, nameserver, and transfer script. See `docs/resellbiz-client.md`.
