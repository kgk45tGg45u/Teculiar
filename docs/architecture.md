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

This avoids coupling provider provisioning to revenue recognition. A service can fail provisioning while the related invoice and transaction retain an auditable state.

## Provider Abstraction

External providers are deliberately thin adapters:

- `VirtualminProviderService` for shared hosting and Nextcloud/CRM hosting automation.
- `ResellBizProviderService` for domains.
- `HetznerProviderService` for dedicated and cloud server provisioning.

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
