# Preview Deployment

This repo is ready for a GitHub-backed preview deployment with Vercel for the Next.js web app, Render for the NestJS API, and Neon Postgres for the database.

## 1. Neon Postgres

Create one Neon Postgres project for preview and copy its pooled connection string.

Use the Neon pooled URL as `DATABASE_URL` on Render. Keep `sslmode=require` in the URL.

Migrations run automatically on Render start:

```bash
npm exec prisma migrate deploy -- --schema prisma/schema.prisma
```

## 2. Render API

Render can create the API service from `render.yaml`.

Use these settings if creating it manually:

- Runtime: Node
- Build command: `npm install && npm exec prisma generate -- --schema prisma/schema.prisma && npm --workspace @crimson/api run build`
- Start command: `npm exec prisma migrate deploy -- --schema prisma/schema.prisma && npm --workspace @crimson/api run start:prod`
- Health check: `/api/v1/health`

Set these required environment variables:

- `DATABASE_URL`: Neon pooled connection string
- `APP_URL`: Vercel web URL
- `PUBLIC_WEB_URL`: Vercel web URL
- `PUBLIC_API_URL`: Render API URL ending in `/api/v1`
- `CORS_ORIGINS`: Vercel web URL, plus any preview domains
- `JWT_ACCESS_SECRET`: generated secret
- `JWT_REFRESH_SECRET`: generated secret
- `CRON_SECRET`: generated secret

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
- Build command: `npm --workspace @crimson/web run build`
- Output directory: `apps/web/.next`

Set:

- `NEXT_PUBLIC_API_URL`: Render API URL ending in `/api/v1`

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
