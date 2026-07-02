# Teculiar — Operator Runbook (Virtualmin)

This is the **step-by-step you run on your existing Dezhost Virtualmin server** to stand up Teculiar as a
hosted SaaS. It is deliberately hand-holding. Read the model once, then follow the parts in order.

> Related: architecture in [teculiar-architecture.md](./teculiar-architecture.md); the full program plan
> is `~/.claude/plans/first-read-teculiar-roadmap-jiggly-bumblebee.md`.

## The model in one picture

```
ONE Virtualmin box (your current Dezhost server):
  teculiar.net , *.teculiar.net   → Apache proxy → Docker: Teculiar API (:4000)
                                                    (API reads the Host header,
                                                     e.g. dezhost.teculiar.net,
                                                     and talks to THAT tenant's DB)
  userNNNN.teculiar.net/admin,/client → Apache proxy → Docker: Dashboards (:3000)
  teculiar.com                    → Apache proxy → Docker: Storefront (thin, :3001)
  MariaDB (already installed)     → control-plane DB + one DB per tenant
  Uploads                         → /home/<vs>/uploads/<tenant>/...  (filesystem)
  Update bundles                  → served at https://teculiar.net/releases/...
```

- **Hosted (never downloaded):** the API + the admin/client dashboards. All business logic + secrets.
- **Downloaded by each buyer:** only the thin **Blue storefront** (marketing/checkout views). It proxies
  `/admin`, `/client`, `/api` back to the buyer's `*.teculiar.net`, so its browser calls are same-origin.
- **A "tenant" = a subdomain + its own database.** Dezhost and Teculiar.com are just two tenants running
  the identical code; they differ only by the **modules they enable** and their **admin settings/content**.

Each part below is tagged **[DO NOW]** (server prep, safe today) or **[AFTER CODE]** (waits on a build
sub-phase — I'll tell you when it's ready).

---

## Part A — DNS  **[DO NOW]**

Goal: make `teculiar.net`, every `*.teculiar.net` tenant subdomain, and `teculiar.com` resolve to this
server's public IP. (Leave `dezhost.com` exactly as it is until Part F cutover.)

1. Find the server's public IP: `curl -4 ifconfig.co` on the box.
2. In whatever manages each domain's DNS (Virtualmin's BIND if the domain's nameservers point here, or
   your registrar's DNS panel):
   - **teculiar.net** → `A` record `@` → server IP.
   - **`*.teculiar.net`** → a **wildcard `A` record**: name `*`, type `A`, value = server IP. This makes
     `dezhost.teculiar.net`, `teculiar.teculiar.net`, `user0003.teculiar.net`, … all resolve automatically
     (no per-tenant DNS edits ever).
   - **teculiar.com** → `A` record `@` (and `www`) → server IP.
3. Verify from your laptop: `dig +short teculiar.net`, `dig +short anything.teculiar.net`,
   `dig +short teculiar.com` all return the server IP.

> Wildcard TLS (Part C) needs DNS-based validation. If teculiar.net's **nameservers are Virtualmin's own
> BIND**, that's automatic. If DNS is at an external provider, note whether Virtualmin has a DNS plugin for
> it (Cloudflare/Route53/etc.) — you'll need it for the wildcard cert.

---

## Part B — Virtual servers  **[DO NOW]**

Create the Apache/Webmin homes that will host each site. In Virtualmin → **Create Virtual Server**:

1. **teculiar.net** — a top-level virtual server. This hosts the API + dashboards proxy + the update
   bundles directory. Enable: Web (Apache), DNS (if this box is authoritative), SSL.
2. **teculiar.com** — a top-level virtual server. This hosts the thin storefront for Teculiar's own
   marketing site.

(You do **not** create a virtual server per tenant. Tenants are just wildcard subdomains handled by the
teculiar.net Apache config + the shared API. The DB per tenant is created later by the Tecreator module.)

---

## Part C — TLS certificates  **[DO NOW]**

In Virtualmin, for each virtual server → **Server Configuration → SSL Certificate → Let's Encrypt**:

1. **teculiar.com** — request a normal cert for `teculiar.com` + `www.teculiar.com` (HTTP validation is
   fine).
2. **teculiar.net + wildcard** — request a cert covering **`teculiar.net` and `*.teculiar.net`**. A
   wildcard **requires DNS-based validation**:
   - In the Let's Encrypt page, choose the **DNS** validation mode.
   - If Virtualmin's BIND is authoritative for teculiar.net, Virtualmin writes the `_acme-challenge`
     TXT record itself — just submit.
   - If DNS is external, install/point Virtualmin at that provider's DNS plugin first, or do a one-off
     manual DNS-01 (`certbot certonly --manual --preferred-challenges dns -d 'teculiar.net' -d
     '*.teculiar.net'`) and import the resulting cert into the teculiar.net virtual server.
3. Confirm auto-renew is on (Virtualmin renews Let's Encrypt automatically).

---

## Part D — MariaDB: control-plane DB + admin user  **[DO NOW]**

Teculiar keeps a tiny **control-plane database** (the tenant registry: which subdomain → which DB, plan,
status, update prefs) and uses a **MariaDB admin user** that the Tecreator module uses to create each
tenant's database on purchase.

Run on the box (adjust names/passwords; store the password in your password manager):

```sql
-- 1) control-plane DB (tenant registry)
CREATE DATABASE teculiar_control CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- 2) a provisioning admin user Tecreator uses to create per-tenant DBs
CREATE USER 'teculiar_admin'@'localhost' IDENTIFIED BY 'CHANGE_ME_STRONG';
-- needs to create databases + users + grant on them:
GRANT ALL PRIVILEGES ON *.* TO 'teculiar_admin'@'localhost' WITH GRANT OPTION;
FLUSH PRIVILEGES;
```

> Per-tenant databases (`db_dezhost`, `db_teculiar`, `db_user0003`, …) are **created automatically** by the
> Tecreator module later — you don't create them by hand.

Creating the `teculiar_control` database + the `teculiar_admin` user is all you do **now**. Its single
`tenants` table is created **later, at deploy time (Part E)** — it needs the built app (Prisma), which
lives in the API image. Once the API image is available, run this **once**:

```bash
# Part E step — NOT now. Run from the repo checkout or inside the API container.
CONTROL_PLANE_DATABASE_URL="mysql://teculiar_admin:CHANGE_ME_STRONG@localhost:3306/teculiar_control" \
  npm run db:cp:push
```

> ⚠️ **Two different privilege levels.** A `teculiar_admin` created through Virtualmin's virtual-server DB
> UI usually has rights **only on `teculiar_control`** — enough for `CONTROL_PLANE_DATABASE_URL`. But
> **Tecreator** (Phase 4.3) needs to create *new* per-tenant databases, which requires **global**
> `CREATE DATABASE`/`CREATE USER`/`GRANT`. Before that phase, grant them as MySQL **root**:
> `GRANT ALL PRIVILEGES ON *.* TO 'teculiar_admin'@'localhost' WITH GRANT OPTION; FLUSH PRIVILEGES;`
> (or use a separate privileged user for `TENANT_ADMIN_DATABASE_URL`). Not needed for 4.1.

Keep these for the API's environment file (Part E), which maps to the exact env vars the code reads:
- **`CONTROL_PLANE_DATABASE_URL`** → the `teculiar_control` connection string. **Setting this is what turns
  multi-tenancy ON.** Leave it unset and the API runs single-tenant (today's Dezhost), unchanged.
- **`TENANT_ADMIN_DATABASE_URL`** → the `teculiar_admin` connection string (e.g.
  `mysql://teculiar_admin:…@localhost:3306/mysql`). Tecreator's `createTenant` uses it to `CREATE DATABASE`
  + a least-privilege user per tenant.
- *(optional)* **`CORS_TENANT_SUFFIXES`** — extra buyer domains to allow via CORS (comma-separated);
  `teculiar.net`/`teculiar.com` are always allowed. **`TRUST_FORWARDED_HOST=true`** — only if Apache is
  configured **without** `ProxyPreserveHost On` (the API then reads `X-Forwarded-Host` for the tenant).

---

## Part E — Deploy the containers + Apache proxies  **[AFTER CODE — 4.1/4.2 LANDED ✅]**

The build now produces **three Docker images** (up from two): **API** (`Dockerfile.api`), **Dashboards**
(`Dockerfile.web`, admin+client), **Storefront** (`Dockerfile.storefront`, thin Blue theme). CI
(`.github/workflows/deploy.yml`) builds+pushes all three (`dezhost-api`/`dezhost-web`/`dezhost-storefront`);
`docker-compose.prod.yml` runs all three. They deploy the same way today's prod does (Docker + Compose,
behind Apache), just three services.

1. **Env file** `/opt/teculiar/.env`: control-plane DB URL, `teculiar_admin` creds, `JWT_*`, `APP_URL`/CORS
   = `https://teculiar.net,https://*.teculiar.net,https://teculiar.com`, uploads path. **New web env vars:**
   - **Dashboards (`web`):** `API_INTERNAL_URL` (SSR → API over the container network, default
     `http://api:4000`); `DASHBOARD_ASSET_PREFIX` = the browser-reachable dashboards origin (e.g.
     `https://teculiar.teculiar.net`) so the storefront's `/admin`,`/client` proxy loads dashboard assets
     without colliding with the storefront's own `/_next`.
   - **Storefront (`storefront`):** `TECULIAR_UPSTREAM` = the tenant origin it proxies to (Teculiar.com →
     `https://teculiar.teculiar.net`; Dezhost → `https://dezhost.teculiar.net`); optional
     `TECULIAR_API_UPSTREAM` to send `/api`+`/uploads` straight to the API container. **No API URL is baked
     at build time** — the same storefront image serves every tenant.
2. **`docker-compose.prod.yml`** brings up: `api` (:4000), `web`/dashboards (:3000), `storefront` (:3001),
   sharing the uploads volume. `docker compose up -d`.
3. **Apache reverse proxies** (Virtualmin → each virtual server → **Configure Website / Edit Directives**,
   or "Proxy Paths"):
   > ⚠️ **`ProxyPreserveHost On` is REQUIRED** on the teculiar.net vhost. The API resolves the tenant from
   > the `Host` header (`<tenant>.teculiar.net`); without this directive Apache rewrites Host to
   > `127.0.0.1:4000` and every request looks like "unknown tenant". (Alternatively set
   > `TRUST_FORWARDED_HOST=true` and ensure Apache forwards `X-Forwarded-Host`.)
   - **teculiar.net** vhost (this also serves `*.teculiar.net` — add `ServerAlias *.teculiar.net`):
     - `/api`      → `http://127.0.0.1:4000/api`
     - `/admin`    → `http://127.0.0.1:3000/admin`
     - `/client`   → `http://127.0.0.1:3000/client`
     - `/releases` → served as static files from the teculiar.net home (update bundles)
     - `/`         → the dashboards or a simple landing (tenant dashboards live under the subdomains)
   - **teculiar.com** vhost: `/` → `http://127.0.0.1:3001` (the thin storefront). Its `/admin`,`/client`,
     `/api` are proxied **by the storefront app itself** to `teculiar.teculiar.net`, so you don't add those
     here.
4. Reload Apache. Check `https://teculiar.net/api/v1/health` (or the real health route) responds, and
   `https://teculiar.com` shows the storefront.

> I'll provide the exact `docker-compose.prod.yml` + the copy-paste Apache proxy blocks when 4.1/4.2 land.

---

## Part F — Bring up Teculiar.com (tenant #0) + Dezhost (first customer)  **[AFTER CODE — 4.3/4.4]**

1. **Provision the Teculiar.com tenant** (dogfood): I'll provide a one-line admin command that calls
   `createTenant("teculiar")` → creates `db_teculiar`, migrates, seeds catalog (Teculiar plans) + Blue
   content, registers it in the control-plane. Then log in at `https://teculiar.teculiar.net/admin`,
   enable the **Tecreator** module, and author the marketing pages/docs/blog.
2. **Provision the Dezhost tenant:** `createTenant("dezhost")` → `db_dezhost`, migrate, seed catalog/config
   + Blue content, then **import Dezhost's existing blog posts** (content-only import script I'll provide).
   Enable Dezhost's hosting modules (virtualmin/resellbiz). Author Dezhost branding in its admin.
3. **Deploy the Dezhost storefront** from your private **`Dezhost`** repo: the thin Blue storefront with
   `TECULIAR_UPSTREAM=https://dezhost.teculiar.net` + Dezhost branding.
4. **Cutover dezhost.com:** point dezhost.com at the new thin storefront (on this box or Dezhost's host);
   verify `dezhost.com/admin`, `/client`, `/api` proxy correctly to `dezhost.teculiar.net`; verify the blog
   posts are present. Then **archive the old single-tenant Dezhost** read-only for records.
   ⚠️ Reminder: customers/orders/invoices/domains do **not** carry over (start-fresh decision) — only blog
   posts. Keep the old instance reachable read-only until you're satisfied.
5. Run the full production E2E (Playwright) per `CLAUDE.md`.

---

## Part G — Publishing updates + revert  **[AFTER CODE — 4.5]**

- API + dashboards are hosted and single-version: you update them by **deploying new images** (Part E step
  2 again). Every tenant is current instantly — nothing to push per tenant.
- **Theme + language packs** are versioned bundles published to `https://teculiar.net/releases/...` with a
  manifest. In a tenant's admin **Updates** panel:
  - **Auto-update ON** → the tenant pulls new theme/locale versions automatically.
  - **Auto-update OFF** → the tenant sees "update available" and applies with one click.
  - **Revert to last version** → restores the immediately previous theme/locale version (one step back).
- I'll provide the `release-sync` publish command (generalized from `scripts/i18n-sync.ts`).

---

## Quick checklist (what you can do today, before any code ships)

- [ ] Part A — DNS: `teculiar.net`, wildcard `*.teculiar.net`, `teculiar.com` → server IP (verified with `dig`).
- [ ] Part B — Virtual servers for `teculiar.net` and `teculiar.com`.
- [ ] Part C — Let's Encrypt: normal cert for teculiar.com, **wildcard** cert for `teculiar.net`+`*.teculiar.net` (DNS validation).
- [ ] Part D — MariaDB: `teculiar_control` DB + `teculiar_admin` user (password saved).
- [ ] Part E onward waits on the build — I'll hand you the compose file + Apache blocks when ready.

_This runbook is updated as each sub-phase lands._
