# Teculiar — Phase 4.6 plan: per-subdomain white-label + edge TLS (replaces the Apache-proxy model)

Status: **PLANNED** (not started). Supersedes the H.4/H.5 Apache reverse-proxy onboarding in
[teculiar-operations.md](./teculiar-operations.md) with a per-surface subdomain model, an on-demand-TLS
edge, redirect-based cross-origin SSO, and per-tenant URL emission. Durable design lives in
[teculiar-architecture.md](./teculiar-architecture.md); this file is the executable plan + the box
undo/convert steps.

> ⚠️ Do this **after** the current go-live (Part F) or instead of it — but the `:edge` stack is **not yet
> serving tenants** (H.7 not run), so converting it now is low-risk. Live single-tenant `/opt/dezhost`
> stays untouched throughout, exactly as today.

---

## 1. Why & what changes

Today every white-label tenant must paste a ~20-line Apache `ProxyPass` block on their own box (H.5). That
is high-friction and error-prone for real customers. Phase 4.6 replaces it with **DNS-only onboarding**:
the tenant points **one hostname per surface** at our edge, and we serve everything white-label.

**Target routing (per tenant, e.g. `acmehost.com`):**

```
admin.acmehost.com    → our edge → dashboards container (/admin)      [we terminate TLS]
client.acmehost.com   → our edge → dashboards container (/client)     [we terminate TLS]
api.acmehost.com      → our edge → API container (/api,/uploads)      [we terminate TLS]   (optional, for self-hosted storefront)
acmehost.com (apex)   → EITHER their own site (their TLS)
                        OR our Blue storefront: hosted by us (our TLS) | self-hosted via install script (their TLS)
mail.acmehost.com     → untouched (their mail host)
cpanel.acmehost.com   → untouched (their panel)
```

The browser URL bar always stays on the tenant's domain; `*.teculiar.net` never appears. Auth stays
**host-only Bearer tokens** (no shared cookie); cross-origin session continuity uses a **one-time-code SSO
handoff**. Certs follow **who terminates the hostname** — mixed (tenant's apex cert + our subdomain certs)
is the normal case.

**Net simplification (per-surface subdomains only):** when a host uses **per-surface subdomains**
(`admin.acmehost.com`), the `DASHBOARD_ASSET_PREFIX=/_dash` hack is unnecessary — admin/client live on their
**own** hosts at path root, so there's no `/_next` collision with a storefront. **It stays for apex hosts
that serve admin/client by _path_** (`dezhost.com/admin`), where storefront + dashboards still share an
origin — which is how the three own-domains run initially (see the server-migration doc). So `/_dash` is
dropped **per host**, when that host adopts per-surface subdomains — not globally in 4.6a.

---

## 2. Data model — `TenantDomain` + tenant/surface resolution

Today the control-plane assumes **one host per tenant** (`Tenant.subdomain @unique`) and the middleware
[`subdomainFromHost`](../apps/api/src/tenancy/tenant.middleware.ts#L21-L43) just slices the **first label**
(`dezhost.teculiar.net` → `dezhost`). That cannot express "3 custom hostnames → 1 tenant, each a different
surface." Add a mapping table and resolve by **full host**.

**Control-plane schema (`prisma/control-plane/schema.prisma`):**

```prisma
model TenantDomain {
  id          String   @id @default(cuid())
  host        String   @unique              // full hostname, e.g. "admin.acmehost.com"
  tenantId    String
  tenant      Tenant   @relation(fields: [tenantId], references: [id], onDelete: Cascade)
  surface     Surface                        // ADMIN | CLIENT | API | APEX
  status      DomainStatus @default(PENDING) // PENDING → VERIFIED → ACTIVE | DISABLED
  verifyToken String                          // random; tenant proves ownership via DNS TXT
  tlsMode     TlsMode  @default(EDGE)         // EDGE (we issue) | EXTERNAL (they terminate)
  createdAt   DateTime @default(now())
}
enum Surface     { ADMIN CLIENT API APEX }
enum DomainStatus{ PENDING VERIFIED ACTIVE DISABLED }
enum TlsMode     { EDGE EXTERNAL }
```

Keep `Tenant.subdomain` for the always-present default host `<subdomain>.teculiar.net` (fallback + admin
access before a custom domain is wired).

**Middleware change (`tenant.middleware.ts`):** resolve tenant + surface by full-host lookup, falling back
to the old heuristic for `*.teculiar.net`:

```
resolve(host):
  d = controlPlane.findDomainByHost(host)         // TenantDomain, cached
  if d && d.status == ACTIVE: return { tenant: d.tenant, surface: d.surface }
  sub = subdomainFromHost(host)                    // legacy path: <sub>.teculiar.net
  if sub: return { tenant: findBySubdomain(sub), surface: fromPath(req) }   // /admin,/client
  return unresolved
```

`surface` is stashed in the `TenantContext` so URL emission (§6) and guards can read it. The
cross-tenant leak test (`apps/api/test/tenancy.test.mjs`) is extended: requests to tenant A's hosts must
never resolve to tenant B; an unverified/DISABLED host must never resolve.

---

## 3. Edge & TLS — staged, free, non-disruptive

The edge is the front door that terminates TLS and routes host → container. **Caddy v2** (Apache-2.0,
**free at any scale**, on-demand TLS built in). Introduce it in two stages so nothing on the live
Virtualmin box breaks and you need no new spend until real external customers arrive.

### Stage A — your own domains (no new edge needed) — **SUPERSEDED 2026-07-04**

> The edge went live ahead of schedule (Stage B below), so the white-label own-domains (teculiar.com,
> dezhost.com) route through **Caddy via DNS** instead of Apache blocks — see the server-migration doc §6.
> Only **teculiar.net** (platform host + `*.teculiar.net` wildcard cert) still runs the Stage-A Apache
> pattern described here.

`teculiar.net`, `*.teculiar.net`, `teculiar.com`, and `dezhost.com` + `admin.dezhost.com` /
`client.dezhost.com` / `api.dezhost.com` are **your** domains. Keep Virtualmin/Apache terminating them with
**pre-issued** Let's Encrypt certs (you already have the `*.teculiar.net` wildcard; add a `*.dezhost.com`
wildcard or SAN for the dezhost subdomains). Apache proxies each host to the right container port. This is
just the H.4/H.5 blocks **re-pointed at per-surface hosts** — no on-demand TLS, no Caddy yet.

### Stage B — external tenants' custom domains (add Caddy, on-demand TLS)

Only needed when an outside customer brings `acmehost.com`. Their `admin.`/`client.`/`api.` (and optionally
apex) resolve to our edge, whose cert we can't pre-issue → **on-demand ACME**. Add **Caddy** as the edge for
these. Two topologies (pick per your box; **decision O-1** below):

| Topology | 443 conflict with Virtualmin/Apache? | Cost | Risk to live hosting customers |
|---|---|---|---|
| **B1 — second IP** (Caddy on IP2, Apache stays on IP1) | none (different IPs) | a second IPv4 (or use IPv6) | **none** — Apache untouched |
| **B2 — Caddy front, Apache behind** (Caddy on 80/443, Apache moved to 8080/8443, Caddy proxies unknown hosts → Apache) | resolved by demoting Apache | €0 | medium — all customer sites now transit Caddy |
| **B3 — separate small edge box** | none | a small VPS | none |

**Recommendation:** **B1 (second IP)** — zero risk to the live hosting customers on Apache, €0 software,
minimal change. Fall back to **B2** only if no second IP is available. B3 is the clean scale-out for later.

**Caddy on-demand config (gist):**

```
{ on_demand_tls { ask http://127.0.0.1:4001/api/v1/tenancy/tls-allowed } }

https:// {
  tls { on_demand }
  @tenant { header_regexp host Host (.+) }
  reverse_proxy /api/*     127.0.0.1:4001
  reverse_proxy /uploads/* 127.0.0.1:4001
  reverse_proxy /admin*    127.0.0.1:3010
  reverse_proxy /client*   127.0.0.1:3010
  reverse_proxy            127.0.0.1:3011   # apex storefront (if we host it)
}
```

Caddy asks our `tls-allowed` endpoint before issuing — see §9 (allowlist gating). Caddy sends the real
`Host` upstream, so the API resolves the tenant by host exactly as §2; `ProxyPreserveHost`/`X-Forwarded-Host`
concerns disappear (Caddy preserves Host by default).

### Certs follow termination (answer to "can tenants keep their own SSL?")

`TenantDomain.tlsMode`:
- **EDGE** (host points at our edge): **we** issue via Caddy on-demand. Used for `admin.`/`client.`/`api.`
  and for an apex we host.
- **EXTERNAL** (host served by the tenant's own server): **they** keep their cert; we never issue. Used for
  a self-hosted apex storefront or a tenant's own website.

Mixed is expected and needs no coordination — each hostname has exactly one terminator.

---

## 4. Apex modes (the "their site OR our Blue theme" toggle)

Per-tenant setting `apexMode`:

- **`external`** — apex is the tenant's own site (`TenantDomain{host: acmehost.com, surface: APEX, tlsMode: EXTERNAL}` is informational only; we serve nothing there). Their site links to `client.acmehost.com`.
- **`blue_hosted`** — apex CNAME/ALIAS → our edge; we serve the Blue storefront (our cert). Simplest.
- **`blue_selfhosted`** — apex A-record → their box; they run the storefront via the **install script**
  (§7 of operations). Their cert. Its browser API base points at `api.acmehost.com` (EDGE) so calls are
  same-registrable-domain + CORS-allowlisted.

**Client-area placement rule (avoids cross-origin SSO by default):**
`external` → client on `client.acmehost.com` (self-contained). `blue_*` → client on the apex path
(`acmehost.com/client`, same origin as store) unless the tenant explicitly wants a separate `client.` host
— which is the only case that needs the §5 handoff.

---

## 5. Redirect-based SSO handoff (only for separate-origin client + storefront)

Move a **one-time code**, never the token. New endpoints on the API + two thin pages on the surfaces.

```
POST /api/v1/auth/sso/exchange   (Bearer)  → { code, expiresIn:30 }   // mints single-use code
POST /api/v1/auth/sso/redeem     { code, verifier } → { accessToken, refreshToken, user }  // burns code
```

Flow: origin-with-session `/sso/handoff?returnTo=…` reads its token → `exchange` → 302 to destination
`/sso/callback?code=…` → destination calls same-origin `redeem` → `storeAuth()` (host-only) → strip `code`
→ go to `returnTo`. After bootstrap, the existing [refresh-on-401](../packages/web-core/src/lib/api.ts#L761-L772)
keeps the session alive; the handoff fires once.

**Hardening (all in the plan, see §10):** single-use + 30s TTL; bind the code to `{userId, tenantId,
targetOrigin}` and reject redemption from any other origin; **PKCE-style** verifier (initiator sends a
`code_challenge` to `exchange`, the `code_verifier` to `redeem`) so an intercepted code is useless without
the verifier; `returnTo` validated against the tenant's **own** `TenantDomain` hosts (no open redirect);
never log the code; rate-limit both endpoints.

---

## 6. Per-tenant URL emission (replace the single global base URL)

Today the API builds links from one global env var in several places — all must become tenant+surface
aware:

- password reset — [auth.service.ts:289](../apps/api/src/modules/auth/auth.service.ts#L289-L290)
- email base + reset — [email.service.ts:628](../apps/api/src/modules/email/email.service.ts#L628)
- invoice link — [billing.service.ts:2288](../apps/api/src/modules/billing/billing.service.ts#L2288)
- payment return — [abstract-payment.service.ts:728](../apps/api/src/modules/billing/processors/abstract-payment.service.ts#L728)
- ticket link — [tickets.service.ts:547](../apps/api/src/modules/tickets/tickets.service.ts#L547)

Add `TenantUrlService.forSurface(ctx, surface)` reading the tenant's `TenantDomain` hosts (fallback:
`<subdomain>.teculiar.net`). Map event → surface: client reset/invoice/ticket → **CLIENT** host; admin
invite → **ADMIN** host; marketing → **APEX**. Replace every `process.env.*_URL` link builder with it. A
test asserts every generated link uses the request tenant's host and **never** leaks `*.teculiar.net` when a
custom domain exists. Locale packages: no new strings (URLs are data), but verify no template hardcodes a
domain.

---

## 7. CORS — per-tenant origin allowlist

Same-origin surfaces need no CORS. Cross-origin cases (self-hosted storefront → `api.`, future Phase-6
widgets) are allowed via a **per-tenant** origin allowlist derived from `TenantDomain` (plus the existing
`CORS_TENANT_SUFFIXES` env for coarse cases). Extend [`corsOrigin`](../apps/api/src/main.ts#L67-L88) to
consult the control-plane: reflect the specific origin (never `*`) when it's a known, ACTIVE tenant host;
keep `credentials: true`. This is also the exact hook Phase 6 needs.

---

## 8. Domain-ownership verification (anti-hijack)

Before a host becomes `ACTIVE` (and thus TLS-issuable + tenant-resolvable), the tenant must **prove they own
it**, so tenant A can't claim `admin.victimbank.com`:

1. Tenant adds `admin.acmehost.com` in the wizard → row `PENDING` with random `verifyToken`.
2. Wizard shows `_teculiar-verify.acmehost.com TXT = <verifyToken>` **once per registrable domain**.
3. Backend job resolves the TXT → `VERIFIED`; then, once the host's CNAME/A points at the edge → `ACTIVE`.
4. Only `ACTIVE` hosts pass the §9 `tls-allowed` check and the §2 resolver.

---

## 9. Security hardening (limit hacker attacks)

| Vector | Mitigation |
|---|---|
| On-demand TLS abuse (spray hostnames → burn LE quota) | `tls-allowed` endpoint returns 200 **only** for `ACTIVE` `TenantDomain` hosts; cache negative answers; per-IP issuance rate-limit |
| Domain hijack (claim someone else's host) | DNS-TXT ownership proof (§8) before ACTIVE |
| SSO code theft (URL/referer/logs) | single-use, 30s TTL, `{user,tenant,targetOrigin}`-bound, PKCE verifier, not logged |
| Open redirect via `returnTo` | validate against the tenant's own `TenantDomain` hosts only |
| Cross-tenant data leak | full-host resolver + extended leak test; unverified host never resolves |
| Session token exfiltration by sibling subdomain (`cpanel.`) | **host-only** tokens only — never a `domain=.tenant.com` cookie |
| Host-header spoofing | trust `Host` only from the edge (bound upstream); reject tenant-scoped queries when unresolved |
| CORS over-permission | reflect specific ACTIVE origins, never `*`; keep the allowlist tight |
| LE rate limits at scale | per-host HTTP-01, dedupe issuance, exponential backoff, monitor account new-order rate |
| Brute force on auth/sso | rate-limit `/auth/*` and `/sso/*` |

---

## 10. Undo / convert the current `:edge` box setup (Part U)

You've done H.0–H.5 (images built; `/opt/teculiar/.env`; three containers up on 4001/3010/3011; Apache
proxy for `teculiar.net` + `teculiar.com`). No tenants provisioned (H.7 not run), so this is a clean
convert, not a data teardown. **Live `/opt/dezhost` (single-tenant prod) is not touched.**

**U.1 — Stop the current edge stack (keep images/volumes):**
```bash
cd /opt/teculiar
docker compose -f docker-compose.prod.yml down          # stops api/web/storefront; named volume 'uploads' persists
```

**U.2 — Remove the old Apache proxy directives** (they're replaced by per-surface routing / the Caddy edge):
- Virtualmin → **teculiar.net** vhost → Edit Directives → delete the H.4 block (`ProxyPass /api,/admin,
  /client,/_dash …`) and the `/_dash` rewrite. Keep the vhost + its wildcard cert.
- Virtualmin → **teculiar.com** vhost → delete the H.5 white-label block. Keep the vhost + cert.
- If you cloned the Dezhost storefront (`/opt/dezhost-storefront`) and/or applied `apache/dezhost.com.conf`
  from the `Dezhost` repo: **do not apply that block** — it's the old path-proxy model. dezhost.com will be
  re-pointed per-surface instead (§ new bring-up). If already applied to a non-live vhost, revert it.

**U.3 — `/opt/teculiar/.env`:** **keep `DASHBOARD_ASSET_PREFIX=/_dash`** — the three own-domains serve
admin/client on the apex *path*, so storefront + dashboards share an origin and `/_dash` still prevents the
`/_next` collision. Keep DB/JWT/control-plane vars, `IMAGE_TAG=edge`, ports 4001/3010/3011. (Only drop
`/_dash` for a specific host once it moves to per-surface subdomains.)

**U.4 — `docker-compose.prod.yml`:** no change needed for the own-domains rollout — the `web` container keeps
`DASHBOARD_ASSET_PREFIX=/_dash` (path-based apex). The storefront no longer needs to reverse-proxy
`/admin,/client` (Apache on each apex vhost does it now), but leaving those baked dev rewrites in place is
harmless. Revisit both only when adopting per-surface subdomains.

**U.5 — Re-provision cleanly:** since nothing was provisioned, no tenant DBs to drop. If you *did* run any
`bootstrap-tenant.js`, drop those tenant DBs + control-plane rows before re-seeding under the new model.

**Dezhost container change:** Dezhost becomes `apexMode=blue_selfhosted` (or `blue_hosted`) with
`admin.dezhost.com`/`client.dezhost.com`/`api.dezhost.com` as EDGE `TenantDomain`s. Its storefront container
keeps running the Blue image, but its old white-label Apache block is gone; the dashboards are reached via
the new subdomains, not `dezhost.com/admin`.

---

## 11. New bring-up (operator, after 4.6 lands)

1. **Stage A** (own domains): re-point Apache per-surface — `admin.teculiar.net`? No — teculiar.net is the
   platform; tenants get `<sub>.teculiar.net` for admin/client at path root. For **dezhost.com**: add
   `admin.dezhost.com`,`client.dezhost.com`,`api.dezhost.com` DNS → box; issue `*.dezhost.com` cert; Apache
   proxies each to 3010/3010/4001.
2. **Control-plane**: `db:cp:push` (adds `TenantDomain`). Register each tenant's hosts + `apexMode`.
3. **Provision** `teculiar` + `dezhost` (bootstrap CLI, unchanged). Enable modules, seed catalog.
4. **Stage B** (only for external custom-domain customers): stand up Caddy per **O-1**; wire the
   `tls-allowed` allowlist; onboard via the wizard (DNS + TXT verify + optional install script).
5. Verify: `admin.dezhost.com` / `client.dezhost.com` load white-label; a password-reset email links to
   `client.dezhost.com/...` (not teculiar.net); a test order + SSO handoff (if separate client host) work.

Run the full production E2E per [CLAUDE.md](../CLAUDE.md) against the new hosts.

---

## 12. Phase 5 / Phase 6 consistency — invariants to preserve

Building 4.6 must keep these true (they are what 5 & 6 depend on):
- **Runtime API-base resolution, never baked** — themes (Phase 5) and self-hosted storefronts resolve the
  API host at runtime ([api.ts:473](../packages/web-core/src/lib/api.ts#L473-L482)); 4.6 adds `api.<domain>`
  as a valid EDGE target, not a build-time constant.
- **Per-tenant origin allowlist** — §7 is exactly the CORS surface Phase 6 widgets need on arbitrary sites.
- **Host-only tokens + one-time-code handoff** — §5 is the auth primitive widgets/SDK reuse for user
  actions; no shared-cookie assumption is introduced.
- **Tenant resolution by full host** — §2 lets any custom host (theme host, widget origin, subdomain) map
  to the right tenant; Phase 5 custom themes are just another APEX/storefront host under the same map.
- **Storefront stays logic/secret-free** — Phase 5 themes and Phase 6 widgets inherit the same IP posture.

Result: Phase 5 = another storefront variant on the same hosting mechanism; Phase 6 = the SDK/widgets built
on 4.6's origin-allowlist + verification + handoff. No rework.

---

## 13. Sub-phases (suggested order, each on its own branch, tested local→prod)

- **4.6a — Data + resolution ✅ DONE:** `TenantDomain` model + relation (control-plane); `findDomainByHost`/
  `registerDomain`/`listDomains` on `ControlPlaneService`; full-host resolver in `tenant.middleware.ts`
  (custom-host first, `<sub>.teculiar.net` heuristic fallback) + `surface` in `TenantContext`;
  `register-domain` CLI; extended `tenancy.test.mjs`. Build clean, 6/6 tests pass. *(No behavior change for
  existing `*.teculiar.net` hosts; `DASHBOARD_ASSET_PREFIX` kept for path-based apex hosts.)*
- **4.6b — Per-tenant URLs ✅ DONE:** `tenant-urls.ts` (`tenantWebBaseUrl()` reads the tenant's white-label
  root from the request context, resolved once in the middleware via cached `primaryApexHost`, env fallback);
  migrated all base-url call-sites (auth reset, email, billing invoice/service/domain/payment-method/return,
  tickets). No-op in single-tenant fallback → live prod byte-for-byte unchanged. Build clean; 7/7 tenancy +
  baseline (46/6 on the email/billing/auth files, identical pre/post) confirmed. *(Dedicated surface
  subdomains — no `/client` path prefix — deferred with 4.6d.)*
- **4.6c — CORS allowlist ✅ DONE:** extracted `cors-origin.ts` (`corsStaticDecision` + `makeCorsOrigin`);
  unknown origins are allowed only when a registered ACTIVE tenant host (`ControlPlaneService.isActiveTenantHost`,
  cached, deny-on-error). 6 new tests. **DNS-TXT ownership verification moved to 4.6d** (it's the TLS-issuance
  gate — only meaningful with the edge).
- **4.6d — Edge (Stage B) ✅ STOOD UP + SMOKE-TESTED (2026-07-04):** `tls-allowed` endpoint (2xx only for
  ACTIVE tenant hosts; `TenancyController`, 3 tests); **O-1 = B1** via Hetzner **floating IP
  `195.201.252.12`** (Apache pinned to primary `178.104.82.146`, Virtualmin primary set explicit); Caddy
  2.11 (COPR) running with on-demand-only TLS; **`edge-test.teculiar.net` proved the full pipeline
  end-to-end** (ask gate → LE issuance → tenant resolution → container routing). **The edge is now the
  standard path for white-label domains — the Apache proxy blocks (H.5 / old server-migration §6b,c) are
  RETIRED**; own-domain flips are DNS-only (server-migration §6; teculiar.net stays on Apache H.4).
  Runbook incl. change ledger/revert/migration/B3 exit: `deploy/caddy/README.md`. ⛔ Still to build before
  the FIRST external customer: the Caddyfile catch-all (needs **O-2**: self-hosted vs hosted external
  storefront) + DNS-TXT ownership verify (pairs with 4.6f).
- **4.6e — SSO handoff — 💤 DEFERRED BY DECISION (O-2):** default client-area placement is the apex path
  (same-origin, no SSO needed); the `client.` subdomain is a per-tenant opt-in. Build 4.6e when the first
  tenant actually opts in — not before.
- **4.6f — External onboarding ✅ BACKEND + SCRIPT DONE (2026-07-04); wizard UI deferred:** Caddyfile
  **catch-all enabled** (self-hosted shape per O-3: `api.*` → API host-whole; `admin.*`/`client.*` →
  dashboards with root-redirect + `/_dash` strip + same-origin `/api`; unknown surfaces 404);
  **DNS-TXT ownership verification** (`domain-verification.ts` walk-up candidates + injected-resolver
  matching; `GET /tenancy/verify-domain?host=` flips pending→active only on proof; `register-domain` CLI
  generates + prints the TXT record for `pending`); **install script**
  `deploy/storefront-install/install.sh` (Docker + compose + runtime `TECULIAR_UPSTREAM=https://api.<domain>`
  + web-server instructions). ⚠️ OP ITEM before first customer: make the ghcr storefront image PUBLIC (it's
  private; customers can't pull). The **admin Setup Wizard UI** is deferred until Tecreator sales open —
  onboarding v1 is the manual runbook (deploy/caddy/README.md Part 6) + these CLIs.
- **4.6g — Convert the box + prod verification ✅ DONE (2026-07-04):** the box converted organically during
  4.6d (Part U superseded — nothing left to undo; ledger in deploy/caddy/README.md Part 2). Production
  state verified: **teculiar.com fully on the edge** (Caddy TLS + white-label routing), **dezhost.com
  untouched on the old single-tenant stack** pending its gated cutover (server-migration §6c), teculiar.net
  on Apache H.4. Full dezhost prod E2E runs at the §6c cutover per CLAUDE.md (new-tenant creds).

Each sub-phase updates [teculiar-architecture.md](./teculiar-architecture.md) +
[teculiar-operations.md](./teculiar-operations.md) as it lands, per CLAUDE.md.

---

## 14. Open decisions

All three resolved 2026-07-04:
- **O-1 ✅ = B1 via Hetzner floating IP** (`195.201.252.12`; Apache pinned to the primary IP). Stood up +
  smoke-tested (see 4.6d).
- **O-2 ✅ = per-tenant choice, apex path is the default.** `theirdomain.com/client` (same-origin, no SSO)
  unless a tenant opts into a `client.` subdomain in the onboarding wizard — 4.6e (SSO handoff) is built
  only when the first tenant picks that option.
- **O-3 ✅ = self-hosted storefronts first** (Model B as designed): external customers run the storefront
  via the install script; their `admin.`/`client.`/`api.` subdomains CNAME to the edge. Unblocks the
  Caddyfile catch-all + 4.6f. Hosted/multiplexed storefronts revisit later if demanded.
- **Dezhost cutover data ✅ = start fresh, blog posts only** (re-confirmed by the user 2026-07-04 with the
  customer-loss consequence stated explicitly). `import-blog` CLI ships in the API image.
