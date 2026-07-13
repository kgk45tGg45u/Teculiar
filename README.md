# Dezhost Hosting SaaS Platform

Production-grade SaaS foundation for a German hosting and IT services provider. The repo is structured as a monorepo with a public marketing site, Teculiar customer/admin panels, NestJS API, Prisma/MySQL data model, and shared domain contracts.

## Systems

- `apps/web` - Next.js app with localized Dezhost public pages, `/client` and `/admin` Teculiar panels, dark mode, and a Dezhost-led design system.
- `apps/api` - NestJS REST API with auth, billing, products, tickets, CMS, users, and provider abstraction modules.
- `prisma` - MySQL schema covering accounts, teams, billing, products, services, domains, support, CMS, localization, permissions, and GDPR workflows. Use MySQL 8+ or a compatible MariaDB server.
- `packages/shared` - shared enums and DTO-level contracts used by both web and API.
- `packages/locales` - the shared language-pack bundle (`@teculiar/locales`) consumed by both web and API; see [docs/i18n-currency.md](docs/i18n-currency.md).

## Architecture Principles

- Modular boundaries: every backend domain owns its controller, service, and repository.
- Provider isolation: Virtualmin, Resell.biz, and Hetzner integrations sit behind interfaces and do not leak into billing or product logic.
- Billing is event-oriented: invoice generation, coupons, tax policy, transactions, and subscription renewals are separate concepts.
- Localization is first-class and **modular**: an admin configures the languages and currencies; the site, panels, localized prices, invoices, and emails follow. See [docs/i18n-currency.md](docs/i18n-currency.md).
- Security is layered: JWT access and refresh tokens, TOTP 2FA, role permissions, validation pipes, rate limiting, CSRF middleware, audit logs, GDPR export/deletion records.

## Getting Started

Use Node `24.15.0` with npm `11+`. The project no longer needs Docker for day-to-day website work; the public Next.js website can run with only Node and npm.

```bash
npm install
cp .env.example .env
npm run dev
```

For the full API stack, use any native or hosted MySQL-compatible database and point `DATABASE_URL` at it. MySQL 8+ is the target; MariaDB works when it supports Prisma's MySQL features.

```bash
mysql -e "CREATE DATABASE dezhost_hosting CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;"
npm run db:generate
npm run db:migrate
npm run dev:full
```

## Key URLs

- Public website: `http://localhost:3000/de`
- Customer portal: `http://localhost:3000/client`
- Admin panel: `http://localhost:3000/admin`
- Storefront (marketing site, separate app): `http://localhost:3001/de`
- REST API: `http://localhost:4000/api/v1`

### Storefront local host/tenant setup

The storefront (`apps/storefront`) is a separate Next.js app on port **3001** — none of the
plain `dev`/`dev:web`/`dev:full` scripts start it. Use `npm run dev:storefront` (storefront only)
or `npm run dev:all` (web + storefront + API).

Tenant resolution is host-based (`apps/api/src/tenancy/tenant.middleware.ts`):

- **No control-plane configured** (typical local dev): every host falls back to the single
  tenant from `.env` (`DATABASE_URL`), so plain `http://localhost:3001/de` works as-is.
- **Control-plane configured**: the API resolves the tenant from the first host label, so open
  `http://<tenant>.localhost:3001` (e.g. `http://dezhost.localhost:3001/de`) — browsers resolve
  `*.localhost` without `/etc/hosts` entries.

In `next dev`, the storefront's `next.config.mjs` rewrites proxy `/api` + `/uploads` to
`localhost:4000` and `/admin`, `/client`, `/login` to `localhost:3000`, so the whole platform is
reachable same-origin from port 3001. Override targets with `TECULIAR_UPSTREAM` /
`TECULIAR_API_UPSTREAM` if your ports differ.

## Native Scripts

- `npm run dev` - starts only the website, no database required.
- `npm run dev:full` - starts the website and API together; requires `DATABASE_URL`.
- `npm run dev:storefront` - starts only the storefront (`apps/storefront`) on port 3001.
- `npm run dev:all` - starts website, storefront and API together; requires `DATABASE_URL`.
- `npm run db:push` - syncs the Prisma schema to a local development database without creating a migration.
- `npm run db:migrate` - creates and applies Prisma migrations when you want migration history.
- `npm --workspace @teculiar/api run resellbiz -- status example.com` - temporary Resell.biz domain admin script.
- `npm run e2e` - runs Playwright browser scenarios from `tests/e2e/README.md`; setup notes live in `tests/e2e/RUN_TESTS.md`.

## Cron

Run `https://YOUR_API_HOST/api/v1/cron` every 5 minutes with the configured cron secret. Full setup: [docs/cron.md](docs/cron.md).

## Design Direction

The UI intentionally avoids cloning existing German providers. It uses a conversion-focused section flow, clean readable typography, crisp cards, and a small palette:

- Dezhost: primary actions and emphasis
- Ink: text, borders, dark mode surfaces
- White: page background and contrast

Dark mode is supported with CSS variables and a persisted Zustand preference.
