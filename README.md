# Crimson Hosting SaaS Platform

Production-grade SaaS foundation for a German hosting and IT services provider. The repo is structured as a monorepo with a public marketing site, customer portal, admin panel, NestJS API, Prisma/PostgreSQL data model, and shared domain contracts.

## Systems

- `apps/web` - Next.js app with localized public pages, `/client`, `/admin`, dark mode, and a crimson-led design system.
- `apps/api` - NestJS REST API with auth, billing, products, tickets, CMS, users, and provider abstraction modules.
- `prisma` - PostgreSQL schema covering accounts, teams, billing, products, services, domains, support, CMS, localization, permissions, and GDPR workflows.
- `packages/shared` - shared enums and DTO-level contracts used by both web and API.

## Architecture Principles

- Modular boundaries: every backend domain owns its controller, service, and repository.
- Provider isolation: Virtualmin, Resell.biz, and Hetzner integrations sit behind interfaces and do not leak into billing or product logic.
- Billing is event-oriented: invoice generation, coupons, tax policy, transactions, and subscription renewals are separate concepts.
- Localization is first-class: `/de/` and `/en/` content, localized prices, and German legal pages.
- Security is layered: JWT access and refresh tokens, TOTP 2FA, role permissions, validation pipes, rate limiting, CSRF middleware, audit logs, GDPR export/deletion records.

## Getting Started

Use Node `24.15.0` with npm `11+`. The project no longer needs Docker for day-to-day website work; the public Next.js website can run with only Node and npm.

```bash
npm install
cp .env.example .env
npm run dev
```

For the full API stack, use any native or hosted PostgreSQL database and point `DATABASE_URL` at it. On macOS, Postgres.app or Homebrew PostgreSQL are much smaller than Docker Desktop.

```bash
createdb crimson_hosting
npm run db:generate
npm run db:migrate
npm run dev:full
```

## Key URLs

- Public website: `http://localhost:3000/de`
- Customer portal: `http://localhost:3000/client`
- Admin panel: `http://localhost:3000/admin`
- REST API: `http://localhost:4000/api/v1`

## Native Scripts

- `npm run dev` - starts only the website, no database required.
- `npm run dev:full` - starts the website and API together; requires `DATABASE_URL`.
- `npm run db:push` - syncs the Prisma schema to a local development database without creating a migration.
- `npm run db:migrate` - creates and applies Prisma migrations when you want migration history.
- `npm --workspace @crimson/api run resellbiz -- status example.com` - temporary Resell.biz domain admin script.

## Cron

Run `https://YOUR_API_HOST/api/v1/cron` every 5 minutes with the configured cron secret. Full setup: [docs/cron.md](docs/cron.md).

## Design Direction

The UI intentionally avoids cloning existing German providers. It uses a conversion-focused section flow, clean readable typography, crisp cards, and a small palette:

- Crimson: primary actions and emphasis
- Ink: text, borders, dark mode surfaces
- White: page background and contrast

Dark mode is supported with CSS variables and a persisted Zustand preference.
