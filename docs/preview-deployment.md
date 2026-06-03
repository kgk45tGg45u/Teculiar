# Preview Deployment

This repo is ready for a GitHub-backed preview deployment with Vercel for the Next.js web app, Render for the NestJS API, and a MySQL-compatible database.

## 1. MySQL Database

Create one MySQL 8+ or compatible MariaDB database for preview and copy its connection string.

Use a `mysql://USER:PASSWORD@HOST:3306/DATABASE` URL as `DATABASE_URL` on Render. Enable SSL in the provider settings when required by the host.

Migrations run automatically on Render start:

```bash
npm exec prisma migrate deploy -- --schema prisma/schema.prisma
```

## 2. Render API

Render can create the API service from `render.yaml`.

Use these settings if creating it manually:

- Runtime: Node
- Build command: `npm install && npm exec prisma generate -- --schema prisma/schema.prisma && npm --workspace @dezhost/api run build`
- Start command: `npm exec prisma migrate deploy -- --schema prisma/schema.prisma && npm --workspace @dezhost/api run start:prod`
- Health check: `/api/v1/health`

Set these required environment variables:

- `DATABASE_URL`: MySQL-compatible connection string
- `APP_URL`: Vercel web URL
- `PUBLIC_WEB_URL`: Vercel web URL
- `PUBLIC_API_URL`: Render API URL ending in `/api/v1`
- `CORS_ORIGINS`: Vercel web URL, plus any preview domains
- `JWT_ACCESS_SECRET`: generated secret
- `JWT_REFRESH_SECRET`: generated secret
- `CRON_SECRET`: generated secret

Optional emergency admin recovery:

- `EMERGENCY_ADMIN_EMAIL`: temporary admin login email
- `EMERGENCY_ADMIN_PASSWORD`: strong temporary password

Use these only when locked out. Login at `/admin/login`, create or reset a real admin account, then remove both variables and redeploy Render.

Keep Resell.biz on the test API for preview:

- `RESELLBIZ_API_BASE_URL=https://test.httpapi.com`
- `RESELLBIZ_RESELLER_ID`
- `RESELLBIZ_API_KEY`
- `RESELLBIZ_DEFAULT_NS`

## 3. Vercel Web

Create a Vercel project from the GitHub repository.

Use these project settings:

- Framework: Next.js
- Install command: `npm install`
- Build command: `npm --workspace @dezhost/web run build`
- Output directory: `apps/web/.next`

Set:

- `NEXT_PUBLIC_API_URL`: Render API URL ending in `/api/v1`

The web workspace `prebuild` script compiles `@dezhost/shared`, so the web build remains valid if Vercel uses its project-level build command instead of `vercel.json`.

After Vercel gives a URL, copy it back to Render as `APP_URL`, `PUBLIC_WEB_URL`, and `CORS_ORIGINS`.

## 4. Preview Smoke Checks

After both services deploy:

```bash
curl https://YOUR_RENDER_API.onrender.com/api/v1/health
curl https://YOUR_RENDER_API.onrender.com/api/v1/storefront/products
```

Then open:

- `https://YOUR_VERCEL_APP.vercel.app/de`
- `https://YOUR_VERCEL_APP.vercel.app/client`
- `https://YOUR_VERCEL_APP.vercel.app/admin`

Storefront payment flow note: successful payment should redirect clients to the dashboard quickly. Domain and hosting provisioning must stay in the background, and services become active only after module create succeeds.

## Current Preview

Live services:

- Vercel web: `https://dezhost-preview.vercel.app`
- Render API: `https://dezhost-api-preview.onrender.com/api/v1`
- Database: MySQL-compatible preview database

Completed setup:

- Created Vercel project `dezhost-preview`.
- Set Vercel production and development env `NEXT_PUBLIC_API_URL=https://dezhost-api-preview.onrender.com/api/v1`.
- Connected the Vercel project to the GitHub repository on branch `main`.
- Confirmed Render health endpoint: `https://dezhost-api-preview.onrender.com/api/v1/health`.
- Confirmed API CORS allows `https://dezhost-preview.vercel.app`.
- Confirmed storefront products endpoint responds.

Add `NEXT_PUBLIC_API_URL` to Vercel's Preview environment before using branch preview deployments.

Emergency admin recovery is available through Render env vars. It is disabled when `EMERGENCY_ADMIN_EMAIL` or `EMERGENCY_ADMIN_PASSWORD` is missing.
