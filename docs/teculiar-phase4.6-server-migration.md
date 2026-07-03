# Teculiar — Phase 4.6 server migration (convert the `:edge` box, no data loss)

Step-by-step for **eu01.dezhost.com** to move the not-yet-live `:edge` stack from the Apache-proxy
onboarding (H.4/H.5) to the Phase-4.6 custom-domain model, and bring `dezhost.com`, `teculiar.com`,
`teculiar.net` up under it. Design: [teculiar-phase4.6-plan.md](./teculiar-phase4.6-plan.md).

> You completed operations **H.0–H.6** (images built, `/opt/teculiar/.env`, the 3 containers up on
> 4001/3010/3011, Apache for teculiar.net + teculiar.com). **H.7 was NOT run — no tenants provisioned, so
> the 2 DBs you made are `teculiar_control` + `teculiar_default`, no `db_*` tenant DBs.** Live `/opt/dezhost`
> (single-tenant prod) is untouched by everything here.

---

## 0. What to DELETE — nothing. Keep all three.

| Thing you made | Verdict | Why |
|---|---|---|
| DB `teculiar_control` | **KEEP** | The control-plane registry — the new `tenant_domains` table lives here. |
| DB `teculiar_default` | **KEEP** | The API's startup `migrate deploy` + fallback client target. Still used. |
| Folder `/opt/teculiar` (you wrote `/etc/teculiar` — it's `/opt`) | **KEEP** | Holds `.env` + `docker-compose.prod.yml`. Reconfigured, not removed. |
| `teculiar` **virtual server** in Virtualmin | **KEEP** | Serves teculiar.net (platform) + its wildcard cert. |
| `teculiar.com` virtual server | **KEEP** | Tenant #0's storefront host. |
| The 3 containers (api/web/storefront) | **KEEP** (rebuild image, restart) | Same services; they just need the new 4.6 code baked in. |

**So this is a reconfigure, not a teardown.** If you *had* run H.7 and created `db_teculiar`/`db_dezhost`,
you'd drop those two + their control-plane rows before re-provisioning — but you didn't, so skip that.

---

## 1. Rebuild the `:edge` images (they need the new 4.6 code)

The running containers are the pre-4.6 build; they lack the full-host resolver + the `register-domain` CLI.
Rebuild `:edge` from `feat/teculiar-phase4-separation` (push the branch → GitHub Actions builds `:edge`, or
build on the box). Then on eu01:

```bash
cd /opt/teculiar
docker compose -f docker-compose.prod.yml pull        # get the new :edge images
```

## 2. Create the `tenant_domains` table (control-plane)

Adds the new table to `teculiar_control` via Prisma `db push` (safe, additive; no tenant data touched):

```bash
docker run --rm --env-file /opt/teculiar/.env --add-host host.docker.internal:host-gateway \
  ghcr.io/kgk45tgg45u/dezhost-api:edge npm run db:cp:push
```

## 3. `/opt/teculiar/.env` — one change

**Keep** everything (control-plane URL, admin creds, JWT, ports 4001/3010/3011). **Keep
`DASHBOARD_ASSET_PREFIX=/_dash`** — your three own-domains serve admin/client on the apex *path*
(`dezhost.com/admin`), so the storefront + dashboards share an origin and `/_dash` still prevents the
`/_next` asset collision. (It's only dropped when a host uses per-surface subdomains like
`admin.dezhost.com`, which is the later external-customer path.) Nothing else changes here.

## 4. Bring the stack back up + provision the two tenants (H.7, unchanged)

```bash
cd /opt/teculiar
docker compose -f docker-compose.prod.yml up -d
docker compose -f docker-compose.prod.yml ps                     # all 3 healthy

docker compose exec api node apps/api/dist/tenancy/bootstrap-tenant.js teculiar info@teculiar.com "Teculiar"
docker compose exec api node apps/api/dist/tenancy/bootstrap-tenant.js dezhost  admin@dezhost.com  "Dezhost"
```

Save each printed one-time admin password.

## 5. Register the custom domains (NEW — this is what makes dezhost.com/teculiar.com resolve)

The API resolves a tenant from the request Host. `<sub>.teculiar.net` resolves automatically (fallback), but
your **own apex domains must be mapped** in `tenant_domains`, or the API sees `Host: dezhost.com` and can't
tell which tenant it is:

```bash
docker compose exec api node apps/api/dist/tenancy/register-domain.js teculiar.com teculiar apex active
docker compose exec api node apps/api/dist/tenancy/register-domain.js dezhost.com  dezhost  apex active
```

(`apex` = the host serves storefront + /admin + /client + /api by path. You do **not** register
`<sub>.teculiar.net` — the fallback handles it.)

## 6. Apache — the three vhosts (new model: preserve Host, proxy to LOCAL containers)

The difference from H.4/H.5: **`ProxyPreserveHost On`** (so the API sees the real domain → resolves via
`tenant_domains`) and proxy straight to the **local containers** (no cross-box hop to `*.teculiar.net`).

### 6a. `teculiar.net` vhost — unchanged (keep your H.4 block)

It already preserves Host and proxies `/api`→4001, `/admin`,`/client`→3010, `/_dash/`→3010/. `*.teculiar.net`
tenant subdomains resolve via the fallback. Nothing to change.

### 6b. `teculiar.com` vhost — replace the H.5 white-label block with:

```apache
ProxyPreserveHost On
ProxyPass        /api      http://127.0.0.1:4001/api
ProxyPassReverse /api      http://127.0.0.1:4001/api
ProxyPass        /uploads  http://127.0.0.1:4001/uploads
ProxyPassReverse /uploads  http://127.0.0.1:4001/uploads
ProxyPass        /admin           http://127.0.0.1:3010/admin
ProxyPassReverse /admin           http://127.0.0.1:3010/admin
ProxyPass        /client          http://127.0.0.1:3010/client
ProxyPassReverse /client          http://127.0.0.1:3010/client
ProxyPass        /login           http://127.0.0.1:3010/login
ProxyPassReverse /login           http://127.0.0.1:3010/login
ProxyPass        /reset-password  http://127.0.0.1:3010/reset-password
ProxyPassReverse /reset-password  http://127.0.0.1:3010/reset-password
ProxyPass        /_dash/  http://127.0.0.1:3010/
ProxyPassReverse /_dash/  http://127.0.0.1:3010/
ProxyPass        /  http://127.0.0.1:3011/
ProxyPassReverse /  http://127.0.0.1:3011/
```

(`:3011` = the teculiar.com storefront container. `SSLProxyEngine` not needed now — targets are plain-HTTP
local containers.)

### 6c. `dezhost.com` vhost — the GATED cutover (do LAST)

Same block as 6b but the storefront port is **`:3021`** (the Dezhost storefront container). Use the updated
`apache/dezhost.com.conf` in the **`kgk45tGg45u/Dezhost`** repo (rewritten for this model — see §8). ⚠️ This
REPLACES dezhost.com's live proxy — apply only after `dezhost` is verified (browse dezhost.com/admin →
loads, log in). Keep the old single-tenant instance reachable read-only until satisfied.

## 7. Verify

```bash
curl -sI https://teculiar.com            | head -1     # 200, storefront
curl -sI https://teculiar.com/admin      | head -1     # 200, admin login (URL stays teculiar.com)
curl -sI https://teculiar.net/api/v1/health | head -1  # 200
```
Then in a browser: `teculiar.com/admin` loads the admin login **on teculiar.com** (no teculiar.net in the URL
bar), you can log in, and a client at `teculiar.com/client` works same-origin. Repeat for `dezhost.com` after
6c. **Watch for:** if a dashboard page needs server-rendered tenant data it must carry the tenant Host — the
main flows are client-fetched same-origin (`/api` → Host preserved → resolves), so this is a check, not a
known break; report anything that 500s with "No tenant resolved".

Finally run the production E2E per [CLAUDE.md](../CLAUDE.md) against the new hosts.

---

## 8. GitHub revert — the `Dezhost` repo's Apache file

The only GitHub change to make now: `kgk45tGg45u/Dezhost` → `apache/dezhost.com.conf` was the old
cross-hop white-label block (proxy to `dezhost.teculiar.net`, `ProxyPreserveHost Off`). It's been rewritten
to the new model (preserve Host, local containers) in your local `~/code/Dezhost`. Review and push it:

```bash
cd ~/code/Dezhost
git add apache/dezhost.com.conf README.md
git commit -m "Switch dezhost.com to Phase 4.6 custom-domain model (preserve Host, local containers)"
git push
```

Nothing else in that repo (compose, `.env.example`) needs reverting — the storefront container is unchanged.

---

## What still needs building (not on you — code, later sub-phases)

4.6a (host resolver + `tenant_domains` + `register-domain` CLI) is **done**. Still to build before external
custom-domain customers: **4.6b** per-tenant email/link URLs, **4.6c** CORS allowlist + DNS-TXT ownership,
**4.6d** the Caddy on-demand-TLS edge, **4.6e** SSO handoff, **4.6f** onboarding wizard + install script.
Your three own-domains do **not** need those — they work on this box with the steps above.
