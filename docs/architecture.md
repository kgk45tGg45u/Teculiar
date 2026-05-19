# Architecture

## High-Level Layout

```text
apps/
  web/
    app/
      [locale]/          localized public CMS and product routes
      client/            customer portal
      admin/             staff console
    components/          design system and feature components
    store/               Zustand client state
  api/
    src/
      common/            guards, decorators, middleware
      modules/
        auth/
        users/
        products/
        billing/
        tickets/
        cms/
        external/
        prisma/
packages/
  shared/                cross-app domain contracts
prisma/
  schema.prisma
```

## Backend Module Contract

Each API module follows the same shape:

- `*.controller.ts` exposes versioned REST endpoints.
- `*.service.ts` owns domain behavior and orchestration.
- `*.repository.ts` owns persistence queries and Prisma specifics.
- DTOs validate untrusted request payloads before reaching services.

## Billing Engine

The billing engine separates:

- Catalog prices and setup fees
- Subscription renewal schedules
- Invoice lifecycle state
- Line item tax and discount calculation
- Payment processor abstraction
- Affiliate attribution

Invoice payment state is the automation gate. Orders create unpaid invoices plus pending services/domains only; module calls wait until `onInvoicePaid(invoiceId)`.

When an invoice becomes paid, the billing module:

- assigns a final sequential invoice number if one does not exist yet
- activates, renews, or unsuspends linked services
- registers, transfers, or renews linked domains
- writes module logs with idempotency keys before provider calls
- keeps the invoice paid if a provider action fails
- writes audit logs for payment, status, and module outcomes

Temporary invoice numbers use the `N-100001` style. Final accounting numbers are assigned once on paid state and are not removed when an invoice is later marked unpaid.

This avoids coupling provider provisioning to revenue recognition. A service can fail provisioning while the related invoice and transaction retain an auditable state.

## Provider Abstraction

External providers are deliberately thin adapters:

- `VirtualminProviderService` for shared hosting and Nextcloud/CRM hosting automation.
- `ResellBizProviderService` for domains.
- `HetznerProviderService` for dedicated and cloud server provisioning.

Product categories own the selected automation module. Products inherit their module from the category first, then fall back to legacy product-level module settings only when no category is assigned. `Webhosting` defaults to `virtualmin`, `Domain` defaults to `resellbiz`, and `IT Solutions` defaults to manual handling until a module is configured.

The product module calls provider interfaces, not provider SDK details. That keeps migrations and failover practical.

## Localization and CMS

Public pages resolve by locale and slug. German is the default locale. Translation records support AI-generated drafts, manual overrides, and SEO metadata per language.

## Security

- JWT access tokens are short-lived.
- Refresh tokens are hashed, rotated, and stored per device/session.
- TOTP is enforced per-user when enabled.
- Admin routes require permission claims.
- CSRF middleware protects cookie-authenticated write routes.
- GDPR export and deletion are modeled for traceability.
