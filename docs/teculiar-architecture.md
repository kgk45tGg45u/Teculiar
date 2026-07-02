# Teculiar — Architecture (SaaS separation)

How Teculiar works as a hosted, multi-tenant SaaS, and how Dezhost becomes one tenant of it. This is the
durable technical reference for Phase 4. Operator steps live in
[teculiar-operations.md](./teculiar-operations.md); the roadmap context in
[teculiar-roadmap.md](./teculiar-roadmap.md).

## One codebase, many tenants

There is exactly **one codebase** (this monorepo, renamed to **Teculiar**). Dezhost and Teculiar.com run
the **identical** backend + frontend. Two tenants differ **only** by:
1. **Which modules they enable** (Dezhost → `virtualmin`/`resellbiz` hosting; Teculiar.com → `tecreator`
   tenant-provisioning), and
2. **Admin settings + content** their admins define (branding, catalog, menus, pages, blog).

No tenant-specific code, forks, or `if (tenant === "dezhost")` branches — differences are pure data/config.

## What is hosted vs downloaded (Model B)

| Part | Where it runs | Contains logic/secrets? | Distributed? |
|---|---|---|---|
| **API** (`apps/api`, NestJS) | Hosted on Teculiar | Yes (billing, provisioning, pricing, gateway creds) | No — single hosted version |
| **Admin + Client dashboards** | Hosted on Teculiar | Yes | No — single hosted version |
| **Blue storefront** (marketing/checkout views) | **Downloaded to the buyer's server** | **No** — presentational only | Yes — versioned theme bundle |
| **Language packs** | Consumed by storefront + dashboards | No | Yes — versioned |

The downloaded storefront is deliberately "dumb": it renders data and posts orders to the API. It holds no
pricing math, no provisioning, no secrets — those stay in the hosted API. This protects the company's IP:
buyers never receive the system's logic.

## Tenancy: shared API + database-per-tenant

- **One stateless API** (scale horizontally later behind a load balancer; single instance for now) serves
  all tenants.
- **Each tenant has its own database**, a clone of today's Prisma schema (**the tenant schema is
  unchanged**). Hard isolation: a query can never cross tenants because the database *is* the boundary.
- **Tenant identity = the subdomain** the request arrives on (`dezhost.teculiar.net`,
  `teculiar.teculiar.net`, `user0003.teculiar.net`).

### Request flow (per-request connection routing)

```
request → API
  1. TenantResolver middleware reads the Host header → subdomain
  2. look up the tenant in the CONTROL-PLANE DB (subdomain → dbName, status, secrets ref)
  3. get/create that tenant's Prisma client from a pooled connection registry (cached)
  4. stash it in AsyncLocalStorage as the request's TenantContext
  5. every downstream service uses the request's tenant Prisma client — unchanged service code
```

The tenant-aware Prisma provider is a **single choke point**: existing services keep calling
`this.prisma.*` and automatically hit the right tenant DB. This is the **highest-risk piece** — it is built
first and guarded by a **cross-tenant leak test** (requests to tenant A must never read/write tenant B).

### Control-plane database (tiny, separate)

A small registry DB, unrelated to tenant data. The `Tenant` record holds:

```
Tenant {
  id, subdomain, dbName, dbUserRef, jwtSecretRef,
  brand, plan, status,           // billing/lifecycle
  modules,                       // which module kinds this tenant enables
  autoUpdate,                    // update checkbox
  themeVersion, localeVersion,   // current distributed-artifact versions
  prevThemeVersion, prevLocaleVersion   // backs "revert to last version"
}
```

Per-tenant **secrets** (JWT signing key, payment-gateway creds, module config) live inside **each tenant's
own DB** (the existing `SystemSetting` / `module.<name>.<field>` pattern), so isolation extends to secrets.
Use a **per-tenant JWT signing secret** (a leaked secret compromises one tenant, not all).

> **Implementation (sub-phase 4.1, shipped).** The control-plane is a **separate Prisma schema/client**
> (`prisma/control-plane/schema.prisma` → gitignored `prisma/control-plane/generated`, imported through the
> single wrapper `apps/api/src/tenancy/control-plane-prisma.ts`). The whole tenancy layer is
> **backward-compatible**: it activates only when **`CONTROL_PLANE_DATABASE_URL`** is set; otherwise the API
> runs in single-tenant fallback (today's Dezhost) unchanged. The choke point is a **`PrismaService` Proxy**
> that resolves the request's client from `AsyncLocalStorage` (set by `TenantMiddleware`), so existing
> `this.prisma.*` calls need no edits. Per-tenant JWT secrets are stored as tenant-DB `SystemSetting`s
> (`security.jwtAccessSecret`/`security.jwtRefreshSecret`) and read via `tenancy/jwt-secrets.ts`. For now the
> per-tenant DB connection string is stored on the control-plane `Tenant.dbUrl`; the `dbUserRef`/
> `jwtSecretRef` fields are reserved for a future secrets-manager indirection (4.6). A cross-tenant leak
> test (`apps/api/test/tenancy.test.mjs`) guards the choke point.

## Routing at the edge (the buyer's domain)

The buyer keeps DNS on their own server. The **downloaded storefront reverse-proxies**:

```
theirdomain.com/            → served locally by the Blue storefront
theirdomain.com/admin       → proxy → <tenant>.teculiar.net/admin   (hosted dashboards)
theirdomain.com/client      → proxy → <tenant>.teculiar.net/client
theirdomain.com/api/*       → proxy → <tenant>.teculiar.net/api/*    (hosted API)
```

Because the storefront proxies `/api`, the browser calls its **own** origin (`/api/...`) — same-origin, no
CORS, and **no `NEXT_PUBLIC_API_URL` baked at build time**. One storefront artifact works for every tenant;
the only deploy-time setting is `TECULIAR_UPSTREAM = https://<tenant>.teculiar.net`.

> Contrast with today: `NEXT_PUBLIC_API_URL` is currently baked into the web image at build (`Dockerfile.web`
> build-arg). The proxy model removes that coupling.

> **Implementation (sub-phase 4.2, shipped).** The old single `apps/web` Next app was split into three:
> **`packages/web-core`** (`@dezhost/web-core`, shared source: `lib/*` incl. the customizer registry +
> `LayoutRenderer`, `components/{ui,layout,marketing}`, `globals.css`), **`apps/storefront`**
> (`@dezhost/storefront`, the thin distributable Blue theme = the moved `app/[locale]/*` + checkout +
> custom-page render), and **`apps/web`** (`@dezhost/web`, hosted admin+client dashboards only). The
> storefront's `next.config.mjs` reverse-proxies `/api`,`/uploads`,`/admin`,`/client`,`/login`,
> `/reset-password` → `TECULIAR_UPSTREAM` (with an optional `TECULIAR_API_UPSTREAM` to point `/api` at a
> different origin in local dev). `lib/api.ts` resolves the base URL at runtime (browser → `/api/v1`
> same-origin; server → `TECULIAR_UPSTREAM`), so **no API URL is baked into the storefront** — one artifact
> per tenant. The dashboards set `DASHBOARD_ASSET_PREFIX` so their assets load from a browser-reachable
> origin through the storefront's `/admin`,`/client` proxy (no `/_next` collision). The storefront was
> audited to hold no secrets/business logic (only public `apiGet` + non-secret tax/cycle display helpers).

## Provisioning a tenant (Tecreator module)

Teculiar sells itself using itself. Buying a Teculiar plan runs the **Tecreator** module — a new
provisioning module (`kind: "platform"`, name `tecreator`) implementing the existing `HostingProvider`
interface (`provision/status/restart`). It plugs into the **unchanged** order pipeline:

```
checkout → invoice paid
  → BillingService.onInvoicePaid
  → OrdersService.activateItem
  → external.hostingProvider("tecreator").provision(request)
      → createTenant(subdomain):
          MariaDB admin conn → CREATE DATABASE + user/grant
          prisma migrate deploy
          seed (catalog defaults + Blue content + language packs)
          register in control-plane
      → return externalId = subdomain, credentials in metadata (emailed to buyer)
```

Mirror `apps/api/src/modules/external/virtualmin-provider.service.ts`; register in
`apps/api/src/modules/external/external.service.ts`; add the catalog entry + `"platform"` kind in
`apps/api/src/modules/module-registry/module-catalog.ts`.

## Updates (Teculiar-push hosted; reversible theme/locale)

- **API + dashboards** are hosted and **single-version**: updating = deploying new images. Every tenant is
  current immediately; there is no per-tenant version pin for hosted parts.
- **Theme + language packs** are versioned bundles published to `https://teculiar.net/releases/...` (+
  manifest), extending the existing `packages/locales` manifest + `scripts/i18n-sync.ts` (`--check/--bump`)
  model (no CDN yet). A tenant's **auto-update** flag controls auto-pull vs one-click apply; **revert**
  restores the previous version (control-plane `prev*` fields, keep last 1).
- **Contract stability:** `/storefront/*` and `/api/v1` stay backward-compatible so an older downloaded
  theme keeps working against the current API. Enforced by a compatibility rule + smoke test.

## Storage & scale (deliberately lean now)

- **Uploads** stay on the **server filesystem**, tenant-scoped (`uploads/<tenant>/...`). No object storage
  yet (single box). Revisit when adding a second app server / load balancer.
- **No load balancer** initially — one API instance on the existing Virtualmin box. The stateless API +
  DB-per-tenant design means adding an LB later is additive, not a rewrite.

## Deferred (Phases 5–6)

- **Phase 5 — custom themes (Option 2):** built in the hosted admin (Customizer + the deferred
  Properties/Custom-Themes tab, backed by `Theme.styling`), downloaded, self-run against the hosted API —
  same proxy/runtime model as Blue.
- **Phase 6 — headless (Option 3):** a hosted **JS SDK + embeddable widgets + webhooks** over `/api/v1`.
  **Not an installed agent** — a stateless SDK/widgets is simpler and safer for embedding ordering into an
  arbitrary existing site.
