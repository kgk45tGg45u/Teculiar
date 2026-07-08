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
     - `/api`      → `http://127.0.0.1:4001/api`
     - `/admin`    → `http://127.0.0.1:3010/admin`
     - `/client`   → `http://127.0.0.1:3010/client`
     - `/releases` → served as static files from the teculiar.net home (update bundles)
     - `/`         → the dashboards or a simple landing (tenant dashboards live under the subdomains)
   - **teculiar.com** vhost: `/` → `http://127.0.0.1:3011` (the thin storefront). Its `/admin`,`/client`,
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

---

# Part H — Concrete deploy (4.1–4.3 landed): env, containers, Apache, white-label, repos

Everything below is ready to run now. Follow it top to bottom on **eu01.dezhost.com**. Where a value is
`REPLACE_...`, paste your own (I give the exact strings for your box in chat, kept out of the repo).

## H.0 — Build the new images (once) — WITHOUT touching live prod

The `:latest` images in ghcr are today's **single-tenant** build (no multi-tenant code / no control-plane
schema), so `db:cp:push` would fail on them. Build the Phase-4 images from this branch under a separate
**`:edge`** tag. CI is set up so **main → `:latest` + auto-deploy live prod**, but **this branch (or a
manual run) → `:edge` only, no deploy** — live prod is untouched.

1. Push the branch so GitHub Actions builds it:
   ```bash
   git push -u origin feat/teculiar-phase4-separation
   ```
   (If `git push` is fine but only `gh` is broken, this just works. Otherwise use the GitHub web UI →
   Actions → "Build & Deploy" → **Run workflow** → pick the branch.)
2. Watch **GitHub → Actions**: the `Build Docker images` job builds + pushes
   `ghcr.io/kgk45tgg45u/dezhost-{api,web,storefront}:edge`. The `Deploy` job is **skipped** (branch, not main).
3. Your box already has ghcr pull credentials (today's prod uses them), so it can pull `:edge` in H.3.

> Alternative (no CI): build on the box from a checkout —
> `docker build -f Dockerfile.api -t ghcr.io/kgk45tgg45u/dezhost-api:edge .` (and `.web`, `.storefront`).

## H.1 — Verify the `teculiar_admin` privileges

`teculiar_admin` needs **global** rights (not just on `teculiar_control`) because Tecreator creates a NEW
database + user per tenant on purchase. Check, and grant if missing, as MySQL **root**:

```sql
-- what does teculiar_admin currently have?
SHOW GRANTS FOR 'teculiar_admin'@'localhost';
-- you want a line like: GRANT ALL PRIVILEGES ON *.* TO `teculiar_admin`@`localhost` WITH GRANT OPTION
-- if it only shows GRANT ... ON `teculiar_control`.* then grant the global rights:
GRANT ALL PRIVILEGES ON *.* TO 'teculiar_admin'@'localhost' WITH GRANT OPTION;
FLUSH PRIVILEGES;
```

> ⚠️ **The containers connect over TCP from the Docker network, not the socket.** The API reaches MariaDB
> via `host.docker.internal` (a `172.x` bridge address), so a user defined **only** as `@'localhost'` fails
> with `P1000: Authentication failed` even though the password is correct. Grant the user for the Docker
> network too (mirror how today's working Dezhost DB user is defined). Check + fix as root:
>
> ```sql
> SELECT user, host FROM mysql.user WHERE user = 'teculiar_admin';   -- likely only 'localhost'
> -- allow it from the Docker network (MariaDB must NOT be exposed publicly — keep 3306 firewalled):
> CREATE USER 'teculiar_admin'@'%' IDENTIFIED BY 'REPLACE_DB_PASSWORD';
> GRANT ALL PRIVILEGES ON *.* TO 'teculiar_admin'@'%' WITH GRANT OPTION;
> FLUSH PRIVILEGES;
> ```
> (If you prefer to scope it, use the Docker subnet host instead of `'%'`, e.g. `'teculiar_admin'@'172.%'`.)

> If you'd rather keep `teculiar_admin` scoped to `teculiar_control` and use a *separate* privileged user
> for tenant creation, create that user and use it only in `TENANT_ADMIN_DATABASE_URL` (H.2). Either works.

## H.2 — The environment file `/opt/teculiar/.env`

Create it once (paste the concrete values I give you in chat for the two `REPLACE_...` items — your
`teculiar_admin` password + a random 64-char JWT secret). **Do NOT commit this file.**

```bash
sudo mkdir -p /opt/teculiar
sudo nano /opt/teculiar/.env      # paste the block below, then Ctrl-O, Enter, Ctrl-X
```

```dotenv
# ── Default DB (the API's startup `migrate deploy` + the fallback client outside a request run against
#    this; it is NOT tenant data — tenants get their own DBs). Create it once:
#      CREATE DATABASE teculiar_default CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
DATABASE_URL=mysql://teculiar_admin:REPLACE_DB_PASSWORD@host.docker.internal:3306/teculiar_default

# ── Multi-tenancy (setting CONTROL_PLANE_DATABASE_URL is what turns it ON) ──
CONTROL_PLANE_DATABASE_URL=mysql://teculiar_admin:REPLACE_DB_PASSWORD@host.docker.internal:3306/teculiar_control
TENANT_ADMIN_DATABASE_URL=mysql://teculiar_admin:REPLACE_DB_PASSWORD@host.docker.internal:3306/mysql
# Apache forwards the real Host (ProxyPreserveHost On on teculiar.net), so leave this OFF:
# TRUST_FORWARDED_HOST=true
CORS_TENANT_SUFFIXES=dezhost.com

# ── Auth / JWT (single value; per-tenant secrets are seeded into each tenant DB automatically) ──
JWT_ACCESS_SECRET=REPLACE_RANDOM_64_CHARS
JWT_REFRESH_SECRET=REPLACE_RANDOM_64_CHARS

# ── Dashboards (web) ──
API_INTERNAL_URL=http://api:4000       # SSR → API over the docker network
DASHBOARD_ASSET_PREFIX=/_dash          # white-label: bundles at /_dash/_next (Apache strips → /_next)

# ── Storefront (teculiar.com = tenant #0) ──
TECULIAR_UPSTREAM=https://teculiar.teculiar.net   # SSR data-fetch target for the teculiar.com storefront

# ── Which image tag this stack runs (edge = the Phase-4 pre-release; live prod uses latest) ──
IMAGE_TAG=edge

# ── Host ports (this stack coexists with the LIVE Dezhost prod, which holds 4000/3000). Use spare
#    ports here so both stacks run side by side on the box during the transition. ──
API_PORT=4001
WEB_PORT=3010
STOREFRONT_PORT=3011
```

> `host.docker.internal` lets the containers reach MariaDB on the host (already used by today's prod).
> Generate a secret with `openssl rand -hex 32`.

**Create the control-plane's one table** (run once, after the API image is on the box):

```bash
docker run --rm --env-file /opt/teculiar/.env --add-host host.docker.internal:host-gateway \
  ghcr.io/kgk45tgg45u/dezhost-api:edge npm run db:cp:push
```

## H.3 — Bring up the three containers

`docker-compose.prod.yml` (in the repo) already defines `api` (:4000), `web`/dashboards (:3000) and
`storefront` (:3001). Copy it to `/opt/teculiar/` and start:

```bash
cd /opt/teculiar
docker compose -f docker-compose.prod.yml pull
docker compose -f docker-compose.prod.yml up -d
docker compose -f docker-compose.prod.yml ps      # all three healthy
```

## H.4 — Apache for `teculiar.net` (+ every `*.teculiar.net` tenant)

In Virtualmin → the **teculiar.net** virtual server → **Services → Configure Website → Edit Directives**
(or "Edit Proxy Website"), add — inside the SSL `<VirtualHost *:443>` — and add `ServerAlias *.teculiar.net`:

```apache
# The API resolves the tenant from the Host header (dezhost.teculiar.net, teculiar.teculiar.net, …) —
# this line is REQUIRED so Apache keeps the original Host instead of rewriting it to 127.0.0.1.
ProxyPreserveHost On
SSLProxyEngine on

# API + uploads → the API container
ProxyPass        /api      http://127.0.0.1:4001/api
ProxyPassReverse /api      http://127.0.0.1:4001/api
ProxyPass        /uploads  http://127.0.0.1:4001/uploads
ProxyPassReverse /uploads  http://127.0.0.1:4001/uploads

# Dashboards (admin + client + login) → the dashboards container
ProxyPass        /admin           http://127.0.0.1:3010/admin
ProxyPassReverse /admin           http://127.0.0.1:3010/admin
ProxyPass        /client          http://127.0.0.1:3010/client
ProxyPassReverse /client          http://127.0.0.1:3010/client
ProxyPass        /login           http://127.0.0.1:3010/login
ProxyPassReverse /login           http://127.0.0.1:3010/login
ProxyPass        /reset-password  http://127.0.0.1:3010/reset-password
ProxyPassReverse /reset-password  http://127.0.0.1:3010/reset-password

# Dashboard bundles: assetPrefix=/_dash → strip back to the dashboards' real /_next
ProxyPass        /_dash/  http://127.0.0.1:3010/
ProxyPassReverse /_dash/  http://127.0.0.1:3010/
```

Reload Apache, then check: `curl -sI https://teculiar.net/api/v1/health` → 200, and
`https://dezhost.teculiar.net/admin` (after the tenant exists) shows the admin login.

## H.5 — Apache for a WHITE-LABEL site (`teculiar.com`, and later `dezhost.com`)

> **⛔ RETIRED (Phase 4.6, 2026-07-04).** White-label domains no longer use Apache proxy blocks — they route
> through the **Caddy edge** (on-demand TLS on the floating IP) with a **DNS-only** flip. See
> `deploy/caddy/README.md` (runbook) + `docs/teculiar-phase4.6-server-migration.md` §6. Do NOT apply the
> block below to any new domain; it is kept only as a historical reference. (H.4 for teculiar.net remains
> valid — the platform host stays on Apache.)

This is the answer to "**theirdomain.com/client must stay theirdomain.com/client**." The buyer's vhost
**reverse-proxies** (never redirects) the hosted paths to the tenant subdomain, and serves everything else
from the local storefront container. The browser URL never changes; assets load same-origin.

For **teculiar.com** (tenant `teculiar`), in its Virtualmin vhost SSL `<VirtualHost *:443>`:

```apache
SSLProxyEngine on
# ProxyPreserveHost OFF so the upstream sees the TENANT host (teculiar.teculiar.net) and picks the
# right tenant DB — do NOT preserve teculiar.com here.
ProxyPreserveHost Off

# Hosted paths → the tenant subdomain on this same box (white-label reverse proxy)
ProxyPass        /api             https://teculiar.teculiar.net/api            nocanon
ProxyPassReverse /api             https://teculiar.teculiar.net/api
ProxyPass        /uploads         https://teculiar.teculiar.net/uploads        nocanon
ProxyPassReverse /uploads         https://teculiar.teculiar.net/uploads
ProxyPass        /admin           https://teculiar.teculiar.net/admin          nocanon
ProxyPassReverse /admin           https://teculiar.teculiar.net/admin
ProxyPass        /client          https://teculiar.teculiar.net/client         nocanon
ProxyPassReverse /client          https://teculiar.teculiar.net/client
ProxyPass        /login           https://teculiar.teculiar.net/login          nocanon
ProxyPassReverse /login           https://teculiar.teculiar.net/login
ProxyPass        /reset-password  https://teculiar.teculiar.net/reset-password nocanon
ProxyPassReverse /reset-password  https://teculiar.teculiar.net/reset-password
ProxyPass        /_dash           https://teculiar.teculiar.net/_dash          nocanon
ProxyPassReverse /_dash           https://teculiar.teculiar.net/_dash

# Everything else → the local thin storefront container (MUST be last)
ProxyPass        /  http://127.0.0.1:3011/
ProxyPassReverse /  http://127.0.0.1:3011/
```

For a **buyer domain** like `dezhost.com`, use the IDENTICAL block but replace every
`teculiar.teculiar.net` with `dezhost.teculiar.net`, and set the storefront container's
`TECULIAR_UPSTREAM=https://dezhost.teculiar.net` (so its server-side data fetches hit the right tenant).

> Why it's white-label: the customer's browser only ever sees `theirdomain.com/...`; Apache fetches the
> dashboard HTML + `/_dash` bundles + `/api` from the tenant and streams them back on `theirdomain.com`.
> No `theirdomain.teculiar.net` ever appears in the URL bar or in the page's asset URLs. Auth cookies are
> set host-only, so they scope to `theirdomain.com`.

## H.6 — The two repos + local folders  ✅ DONE

**One Teculiar monorepo builds all three images; each site is a deployment of those images.** There are
exactly two GitHub repos, both now populated:

1. **`kgk45tGg45u/Teculiar`** (this monorepo, renamed — Phase 4.0 ✅). It holds the API + dashboards +
   storefront theme, and **builds all 3 images** via `.github/workflows/deploy.yml`. **teculiar.net AND
   teculiar.com are both served from these images** (teculiar.com is tenant #0) — there is **no separate
   teculiar.com repo**. The Phase-4 branch `feat/teculiar-phase4-separation` is pushed and builds `:edge`.
2. **`kgk45tGg45u/Dezhost`** (private, populated ✅) — the **thin storefront deploy** for `dezhost.com`:
   a `docker-compose.yml` running the published `dezhost-storefront` image with
   `TECULIAR_UPSTREAM=https://dezhost.teculiar.net`, an `.env.example`, and the `dezhost.com` Apache
   white-label block in `apache/dezhost.com.conf`. **No app source lives here** — it consumes the image the
   monorepo publishes, so **updating Teculiar updates Dezhost automatically** (pull the new image; the
   dashboards/API are hosted + always current). Local folder: `~/code/Dezhost` (mirrors the repo).

**Deploy the Dezhost storefront** (on eu01, alongside the `/opt/teculiar` stack — do this at the Part F
cutover, once `dezhost.teculiar.net` is verified):

```bash
sudo git clone https://github.com/kgk45tGg45u/Dezhost.git /opt/dezhost-storefront
cd /opt/dezhost-storefront
cp .env.example .env         # TECULIAR_UPSTREAM=https://dezhost.teculiar.net, STOREFRONT_PORT=3021, IMAGE_TAG=edge
docker compose pull
docker compose up -d         # storefront on 127.0.0.1:3021
```

Then cut over **via DNS only** (Phase 4.6): point dezhost.com at the Caddy edge per
`docs/teculiar-phase4.6-server-migration.md` §6c — `apache/dezhost.com.conf` is **deprecated**, no Apache
swap happens. ⚠️ Cutover gating still applies — see **H.8 / Part F**.

## H.7 — Provision the first tenants (breaks the chicken-and-egg)

Tecreator normally provisions a tenant on purchase, but the first tenants have no store to buy from yet.
Use the **bootstrap CLI** (baked into the API image, reuses the same `createTenant` primitive). Run it
**inside the API container**:

```bash
cd /opt/teculiar
# The API image is a monorepo build: the compiled output lives at apps/api/dist (the container boots
# `node apps/api/dist/main.js`), so the CLI is at apps/api/dist/tenancy/bootstrap-tenant.js — NOT dist/…
# Teculiar.com = tenant #0 (its catalog will be the Teculiar plan; enable the Tecreator module after login)
docker compose exec api node apps/api/dist/tenancy/bootstrap-tenant.js teculiar info@teculiar.com "Teculiar"
# Dezhost = the hosting tenant (enable virtualmin/resellbiz after login)
docker compose exec api node apps/api/dist/tenancy/bootstrap-tenant.js dezhost  admin@dezhost.com "Dezhost"
```

> If the path ever moves, find it: `docker compose exec api sh -c 'find /app -name bootstrap-tenant.js'`.

Each run prints the tenant's **admin email + a one-time generated password** — save them. Then:

1. Log in at `https://teculiar.teculiar.net/admin` (and `https://dezhost.teculiar.net/admin`).
2. In each tenant's admin, enable its modules: **teculiar → Tecreator**; **dezhost → Virtualmin/ResellBiz**.
3. Create each tenant's catalog: **teculiar** gets the **Teculiar plan** (a monthly recurring product with
   provisioning module `tecreator`); **dezhost** gets its hosting/VPS/domain products (provisioning module
   `virtualmin`/`resellbiz`).
4. Point the domains: `teculiar.com` → the storefront (H.5, upstream `teculiar.teculiar.net`);
   `dezhost.com` → the storefront (H.5, upstream `dezhost.teculiar.net`). Both stay fully white-label.
5. Verify: `https://teculiar.com` and `https://dezhost.com` show the storefront; `.../client` and
   `.../admin` load same-origin (URL bar unchanged); buying the Teculiar plan on teculiar.com provisions a
   brand-new `userNNNN.teculiar.net` tenant (Tecreator) and emails its credentials.

> Suspension/licensing is automatic from here: if a tenant's Teculiar invoice goes unpaid past the grace
> period, billing suspends it (control-plane `status: suspended`) — its dashboards/API lock (403) while its
> public storefront + data stay; paying reactivates it instantly.

## H.8 — Going live (the exact remaining steps)

Everything up to and including **H.5 is done** (images built, `.env`, the three containers up, Apache for
`teculiar.net` + `teculiar.com`). What remains to go live is server-side only:

1. **Provision the two tenants** — run the H.7 `bootstrap-tenant.js` commands for `teculiar` and `dezhost`;
   save each printed admin email + one-time password.
2. **Bring up teculiar.com** — log into `https://teculiar.teculiar.net/admin`, enable **Tecreator**, seed
   the Teculiar plan (monthly recurring, provisioning module `tecreator`), author the marketing pages.
   Verify `https://teculiar.com` shows the storefront and `/client`, `/admin` load same-origin.
   **teculiar.net + teculiar.com can go fully live now — they are brand-new sites and cannot affect the
   live dezhost.com.**
3. **Dezhost cutover (Part F)** — this is the ONLY step that touches the live site. Do it last: provision
   `dezhost`, enable virtualmin/resellbiz, import the old blog posts, verify everything at
   `dezhost.teculiar.net`, deploy the Dezhost storefront (H.6), THEN flip dezhost.com's **DNS** to the Caddy
   edge (`docs/teculiar-phase4.6-server-migration.md` §6c — no Apache swap; rollback = revert DNS). Keep the
   old single-tenant instance reachable read-only until satisfied.

> ### ✅ `main` is the production deploy channel (post-cutover, 2026-07-08)
> The cutover is done: dezhost.com runs on the stack in `/opt/teculiar` (API + dashboards + teculiar.com
> storefront) + `/opt/dezhost-storefront` (dezhost.com's public storefront) behind the Caddy edge; the old
> single-tenant `/opt/dezhost` Apache path is retired (containers torn down 2026-07-07). `deploy.yml` has
> been **repointed** (master-plan **0.6**): `main` → build `:latest` → deploy **/opt/teculiar** *and*
> **/opt/dezhost-storefront**. Two prerequisites before the first `main` merge:
> 1. **Flip the box onto the `:latest` channel** (one-time — a workflow can't edit server `.env`):
>    ```bash
>    sed -i 's/^IMAGE_TAG=edge/IMAGE_TAG=latest/' /opt/teculiar/.env /opt/dezhost-storefront/.env
>    ```
>    Both compose files already use `${IMAGE_TAG:-latest}`.
> 2. **The repointed `deploy.yml` must be in the merge** — Actions runs the workflow at the merged ref, so
>    land it on the branch first (done), then merge.
>
> After that, every merge to `main` updates the whole stack — **updating Teculiar updates the Dezhost
> storefront**, which pulls the same monorepo-built `dezhost-storefront` image. ⚠️ The first merge overwrites
> ghcr `:latest` (today's old single-tenant build) with the multi-tenant build — intended, single-tenant is
> being retired. Keep `:edge` (feature-branch builds, no deploy) as an optional pre-prod channel. The
> dezhost→teculiar image/scope **rename** is a separate deliberate change (master-plan **9.1**), not part of this.

_This runbook is updated as each sub-phase lands._
