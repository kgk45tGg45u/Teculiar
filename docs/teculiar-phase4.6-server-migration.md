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

## 6. Routing the three domains — Caddy for the white-label apexes; Apache only for teculiar.net

> **⚠️ MODEL CHANGE (2026-07-04): the Apache white-label blocks are RETIRED.** The original §6 had you paste
> `ProxyPreserveHost`/`ProxyPass` blocks into the teculiar.com/dezhost.com vhosts. The **Caddy edge is now
> stood up and smoke-tested** ([deploy/caddy/README.md](../deploy/caddy/README.md), Part 1 ✅ incl. the
> `edge-test.teculiar.net` end-to-end test), so white-label domains route through **Caddy via DNS only** —
> no Apache directives, exactly like a future external customer. The interim §6b block you applied to
> teculiar.com gets **removed again** in step 6b below.

### 6a. `teculiar.net` — stays on Apache (keep the H.4 block, unchanged)

The platform host: API + dashboards for every `<sub>.teculiar.net` + `/releases` update bundles, covered by
the existing wildcard LE cert. Tenant subdomains resolve via the first-label fallback. Moving this to Caddy
is optional later (it needs per-subdomain on-demand certs gated by a tenant lookup, or a DNS-01 wildcard) —
deliberately **not** part of this change.

### 6b. `teculiar.com` — flip to Caddy (DNS-only)

1. **Register the `www` host** (the apex is already registered; the TLS gate approves only registered hosts):
   ```bash
   cd /opt/teculiar
   docker compose exec api node apps/api/dist/tenancy/register-domain.js www.teculiar.com teculiar apex active
   ```
2. **DNS:** `teculiar.com` A → `195.201.252.12`; `www` → same (CNAME to the apex or A record).
3. **Wait for propagation** (the record's old TTL). During propagation both paths work — clients on the old
   IP hit the Apache block (still in place), clients on the new IP hit Caddy.
4. **Verify via Caddy explicitly** (before propagation finishes):
   ```bash
   curl -sIL --resolve teculiar.com:443:195.201.252.12 https://teculiar.com | grep HTTP
   # first line 307 (the storefront's locale redirect, / → /de) then 200 — both expected
   journalctl -u caddy -e     # shows the Let's Encrypt issuance for teculiar.com on first hit
   ```
   Browser: storefront + `/admin` + `/client` load with a valid padlock, URL stays teculiar.com.
   ⚠️ Do the DNS change (step 2) BEFORE this curl: `--resolve` only redirects *your* curl — Let's Encrypt
   validates against real public DNS, so issuance fails (curl hangs) until the A record points at the edge,
   and failed validations are rate-limited (5/hostname/hour).
5. **Remove the interim Apache block:** Virtualmin → teculiar.com vhost → Edit Directives → delete the §6b
   `ProxyPreserveHost`/`ProxyPass` lines → reload Apache. (Only after propagation — removing early breaks
   clients still resolving the old IP.)
6. **Disable Let's Encrypt auto-renewal for the teculiar.com virtual server** (Virtualmin → that server →
   SSL Certificate → Let's Encrypt → renewal off). Validation traffic now lands on Caddy, so Virtualmin's
   renewals would fail and nag; **Caddy owns this domain's cert now.**

### 6c. `dezhost.com` — the GATED cutover is now DNS-only (do LAST)

**No Apache swap anymore** — `apache/dezhost.com.conf` in the Dezhost repo is deprecated (§8). Data decision
re-confirmed 2026-07-04: **start fresh, blog posts only** — live customers/orders/invoices/services do NOT
carry over; the old prod stays read-only for records.

**Pre-cutover checklist (all before any DNS change):**
1. **Author the tenant.** Log into `https://dezhost.teculiar.net/admin` (bootstrap one-time password →
   change it). Enable + configure **Virtualmin/ResellBiz** modules (re-enter creds from the old admin),
   recreate the **catalog** (hosting/VPS/domain products + prices), payment **gateways**, **SMTP/email**
   settings, languages/currencies, branding. None of this carries over — it's the start-fresh cost.
2. **Import the blog** (ships in the `:edge` API image — pull first if the box predates it). Source URL =
   the old prod `DATABASE_URL` from `/opt/dezhost/.env`, host rewritten for the container network:
   ```bash
   cd /opt/teculiar
   docker compose exec api node apps/api/dist/tenancy/import-blog.js \
     "mysql://<olduser>:<oldpw>@host.docker.internal:3306/<old_db_name>" dezhost
   ```
   Posts land authored by the dezhost tenant admin; re-runs are idempotent.
3. **Copy the blog image files** (post bodies reference `/uploads/...`):
   ```bash
   docker volume ls | grep uploads          # find the old (dezhost_*) and new (teculiar_*) volume names
   docker run --rm -v <old_uploads>:/from -v <new_uploads>:/to alpine sh -c 'cp -an /from/. /to/'
   ```
   (`-n` = never overwrite files the new stack already has.)
4. **Deploy the Dezhost storefront container** (H.6): clone `kgk45tGg45u/Dezhost` →
   `/opt/dezhost-storefront`, `cp .env.example .env`, `docker compose pull && up -d` → `:3021`.
5. **Verify.** Note `dezhost.teculiar.net` serves ONLY the API + dashboards (H.4) — **storefront routes
   (blog, impressum, marketing pages) 404 there by design**; they live in the `:3021` container and go
   live on dezhost.com at the flip. So: admin login at `dezhost.teculiar.net/admin` (use `/admin`, not the
   client `/login`); imported posts visible in admin → Blog; public rendering via the container directly:
   `curl -s http://127.0.0.1:3021/de/blog | grep -o "<title>[^<]*"` (and an `/de/impressum` spot-check);
   a test order through the storefront container.
6. **Update the E2E credentials:** the repo `.env`'s `E2E_ADMIN_*`/`E2E_CLIENT_*` are OLD-system accounts;
   start-fresh means they don't exist in the tenant. Set the new admin creds + register a test client
   before running the post-cutover E2E.

Then the cutover itself:
1. Register the www host: `register-domain.js www.dezhost.com dezhost apex active`.
2. **DNS:** `dezhost.com` + `www` → `195.201.252.12`.
3. The old single-tenant prod **stays reachable on `178.104.82.146` the whole time** — clients migrate as
   DNS propagates, and **rollback = revert the DNS record**, nothing else. (Cleaner than the old
   Apache-swap cutover, which was all-or-nothing.)
4. After propagation: verify like 6b step 4, disable LE renewal for the dezhost.com vhost, keep the old
   instance read-only until satisfied, then run the full production E2E per [CLAUDE.md](../CLAUDE.md).

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

`kgk45tGg45u/Dezhost` → `apache/dezhost.com.conf` is **DEPRECATED** (2026-07-04): the dezhost.com cutover is
now a DNS flip to the Caddy edge (§6c) — **no Apache block is ever applied**. The file in `~/code/Dezhost`
has been replaced with a deprecation note; commit + push it:

```bash
cd ~/code/Dezhost
git add apache/dezhost.com.conf
git commit -m "Deprecate the Apache white-label block — dezhost.com routes via the Caddy edge (DNS-only)"
git push
```

The rest of that repo stays as-is — the storefront container (`:3021`) + `.env.example` are still exactly
what the cutover uses.

---

## 🔔 Part L — ✅ ACTIVE (2026-07-04): the CNAME/edge model IS the plan now

**Status:** the edge is up and smoke-tested; this section stopped being a "later reminder" and became the
standard path — **teculiar.com's flip = §6b, dezhost.com's = §6c (at the gated cutover)**. The steps below
are kept as the generic per-domain reference (rollback copy, revert-to-plain-vhost, DNS repoint, edge TLS).

Per domain (teculiar.com first, **dezhost.com last** — it's the live site):

1. **Save the rollback.** Copy the current §6 `<VirtualHost *:443>` proxy block somewhere safe (or export the
   Virtualmin vhost). This is your one-click way back if the edge test misbehaves.
2. **Revert to the old SSL directive.** In the domain's Virtualmin vhost → Edit Directives, **remove the
   ProxyPreserveHost + ProxyPass block** you added in §6, leaving the plain SSL vhost Virtualmin originally
   created. The domain is now no longer routed by Apache.
3. **Point DNS at the edge (the "change CNAME" step).** Repoint the domain to the Caddy edge:
   - O-1 = **B1 (second IP):** set the domain's `A`/`ALIAS` (apex) or `CNAME` (a `www`/subdomain) to the
     **edge IP**. `mail.`/`cpanel.` records stay as-is.
   - O-1 = **B2 (Caddy in front of Apache):** DNS already resolves to the box; just step 2 is enough — Caddy's
     host-routing now wins once the Apache proxy block is gone.
4. **TLS moves to the edge.** Caddy issues the cert on-demand via ACME (gated by the `tls-allowed` allowlist),
   so the domain's hosts must be **`status=active`, `tlsMode=edge`** in `tenant_domains` (they already are
   from step 5 of the main flow; if you added `admin.`/`client.` subdomains, register those too). Your old
   Apache Let's Encrypt cert for the domain is simply no longer used — leave it or let it lapse.
5. **Test the full white-label flow:** browse the domain → storefront; `/admin`, `/client` load same-origin
   (URL never shows `*.teculiar.net`); a password-reset email links to the domain; on-demand TLS shows a
   valid cert; (if you split a `client.` subdomain) the SSO handoff works. Buying the Teculiar plan on
   teculiar.com provisions a fresh `userNNNN` tenant and its cert issues automatically.
6. **Rollback if needed:** restore the saved Apache block (step 1) and revert DNS. Because dezhost.com is
   live, keep it on the §6 Apache path until teculiar.com has passed the edge test.

> This is the moment the "customers only change DNS, never Apache" promise becomes literally true for your
> own domains too — they stop being a special Apache-bootstrap case and route exactly like a paying tenant.

---

## What still needs building (not on you — code, later sub-phases)

4.6a–**4.6c are done** (host resolver + `tenant_domains` + `register-domain` CLI; per-tenant white-label link
URLs; per-tenant CORS allowlist). Still to build before external custom-domain customers — and before Part L
above: **4.6d** the Caddy on-demand-TLS edge (+ DNS-TXT ownership verify; needs the O-1 decision + a server
action), **4.6e** SSO handoff, **4.6f** onboarding wizard + install script. Your three own-domains work on
this box **today** with the §1–§7 steps; Part L is the later upgrade to the edge model.
