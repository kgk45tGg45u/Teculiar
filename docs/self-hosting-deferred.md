# Self-hosted storefront — DEFERRED (paused 2026-07-22)

> **Status: PAUSED, not deleted.** The tenant-facing option to run the Blue storefront on the customer's own
> server (`apexMode: "blue_selfhosted"`) is being hidden from the admin UI. All backend/API/edge code that
> implements it **stays in the tree** so the feature can be revived. This document is the single source of
> truth for what was built, what it touches on the server, exactly why and when we stopped, how to turn it
> off/on on the box, and the checklist to resume.
>
> **Owner decision:** the maintenance surface (per-web-server reverse-proxy wiring, theme/locale update
> distribution, ghcr image visibility, cross-host support) is too large for the number of buyers who need it.
> The **headless API + SDK/widgets** ([master plan 9.2](./teculiar-master-plan.md)) becomes the supported way
> for customers who want ordering on *their own* site.

---

## 1. What "self-hosting" means here (and the two options that remain)

Teculiar has **three** ways a tenant's public website can run — the `apexMode` field, chosen in the domain
wizard. Self-hosting is **only the middle one**. After this pause, tenants get the first and third:

| `apexMode` | Wizard label | Storefront served by | API + dashboards | What the tenant does | Status |
|---|---|---|---|---|---|
| `external` | "I keep my own website on my domain" | **Their own existing site** (we don't touch the apex) | Hosted by us on subdomains | Add 2 CNAMEs (`admin.`, `client.`) | ✅ **kept** |
| `blue_selfhosted` | "I host the Teculiar storefront theme on my own server" | **Our Blue storefront container, on their box** (`install.sh`) | Hosted by us | Run install.sh + wire their reverse proxy | ⏸ **PAUSED (this doc)** |
| `blue_hosted` | "Point my whole domain to Teculiar" | **Our stack, on our edge** | Hosted by us | DNS only | ✅ **kept** |

Key point that makes the pause safe: **every tenant always has a hosted database and hosted dashboards/API
regardless of `apexMode`.** Self-hosting only ever changed *who serves the public HTML*. See
[teculiar-architecture.md](./teculiar-architecture.md) for the DB-per-tenant model. Because the database, the
admin/client dashboards, and all business logic are hosted by us in every mode, pausing `blue_selfhosted`
removes an *option*, not a *capability* — no tenant loses data, dashboards, billing, or languages.

### The difference between `external` and `blue_selfhosted` (the two the owner asked about)

- **`external`** = *"I don't want your storefront, just your admin/billing engine."* The tenant keeps their
  existing website (WordPress, Wix, bespoke). We provide only `admin.theirsite.com` + `client.theirsite.com`.
  Our storefront/theme is not used at all. Ordering on their own site is wired later via the headless API
  (9.2). Zero server work — two CNAMEs.
- **`blue_selfhosted`** = *"I want your storefront, but hosted by me."* The tenant runs **our** Blue storefront
  Docker image on **their** box. The storefront is deliberately dumb (no secrets, no pricing math, no
  provisioning) — it renders data and posts orders to our hosted API via `api.theirsite.com`. Requires Docker
  + a reverse proxy they configure. Motivations: data residency, existing CDN/WAF, corporate policy, soft IP
  separation. **This is the one being paused.**

---

## 2. Language packs are NOT a reason to self-host (clears a common misconception)

Multi-language and self-hosting are **independent**. A tenant with one language — or five — needs no image and
no self-hosting.

- **Chrome/UI strings** (nav, dashboards, storefront theme text, email/invoice templates) live in
  `@teculiar/locales` as **static imports compiled into every image** (`packages/locales/index.ts` imports
  `de/*.json` + `en/*.json`; consumed via `transpilePackages`). They are **part of the software**, present
  wherever Teculiar runs.
- **Tenant content** (product titles, page/blog content, per-language emails) is **data in the tenant's own
  DB** (`Translation` model).
- A tenant's **main language is a DB setting** (Admin > Settings), the authority for server components — see
  `packages/web-core/src/lib/supported-locales.ts`.

So for `external` and `blue_hosted` tenants (the ones we keep), the storefront + dashboards run on **our**
servers, which already carry all packs. The tenant just picks languages in settings. Language packs are
"installed on the tenant's box" **only** in the `blue_selfhosted` case, and even there they come **bundled in
the image** — never installed separately. Consequence: pausing self-hosting **removes** the only reason locale
packs ever needed versioned distribution (that was Phase 8.1 `release-sync`, now dropped — see §6). Hosted
tenants get updated translations automatically on every redeploy.

---

## 3. What was built (complete inventory — all of this stays in the tree)

### 3.1 Tenant admin UI
- **Domain wizard** — `apps/web/components/admin/domain-wizard.tsx`. Picks `apexMode` (incl. the
  `blue_selfhosted` radio), where dashboards live (`subdomains` vs `apex_paths`), and the client-area label.
  Registers hosts (always `pending` + DNS-TXT ownership), prints exact DNS records, verifies per host. For
  `blue_selfhosted` it also renders the **install command** block:
  `TENANT=<sub> DOMAIN=<domain> bash <(curl -fsSL https://get.teculiar.com/install.sh)`.
- **Locale strings** — `packages/locales/{en,de}/admin.json` under `admin.domains.*`:
  `apexSelfhosted`, `apexSelfhostedHelp`, `installTitle`, `installHelp`.

### 3.2 API / backend
- **`apps/api/src/tenancy/tenant-domains.controller.ts`** — `WhitelabelConfigDto` validates
  `apexMode ∈ {external, blue_selfhosted, blue_hosted}`; stores the choice in the tenant DB `SystemSetting`
  key `whitelabel.config`. Registers/verifies hosts against the control-plane; rejects `external + apex_paths`.
- **Control-plane** `prisma/control-plane/schema.prisma`:
  - `TenantDomain.surface ∈ {admin, client, api, apex}`, `status ∈ {pending, verified, active, disabled}`,
    `tlsMode ∈ {edge, external}`, `verifyToken` (DNS-TXT ownership proof).
  - `Tenant.autoUpdate`, `themeVersion`, `localeVersion`, `prevThemeVersion`, `prevLocaleVersion` — **reserved
    fields for the never-built Updates panel** (§6). Harmless while unused.
- **Provisioning is shared, not self-host-specific** — `apps/api/src/tenancy/tenant-provisioning.service.ts`
  (`createTenant`) and `apps/api/src/modules/external/tecreator-provider.service.ts` (the buy flow) create a
  hosted DB + dashboards for **every** tenant. Self-hosting is a *post-purchase domain choice*, so these are
  untouched by the pause.

### 3.3 Distributable storefront
- **`deploy/storefront-install/install.sh`** — the customer-side installer. Installs Docker if missing, writes
  a `docker-compose.yml` pulling `ghcr.io/kgk45tgg45u/teculiar-storefront`, runs it on `127.0.0.1:PORT`, and
  **prints** (does not apply) the reverse-proxy wiring for the customer's web server (a ready Caddy block only;
  nginx/Apache get instructions).
- **Storefront image** — `ghcr.io/kgk45tgg45u/teculiar-storefront` (built by `deploy.yml`). **Also serves our
  hosted tenants** (teculiar.com, dezhost.com) — so it is NOT purely a self-host artifact (see §5).
- **`deploy/caddy/README.md`** references the `get.teculiar.com` install URL.

### 3.4 Edge routing
- **`deploy/caddy/Caddyfile`** — the `(tenant_apex_routes)` snippet routes an apex host's `/api`,`/uploads` →
  API, `/admin`,`/client`,`/login`,`/reset-password` → dashboards, everything else → that tenant's storefront
  container. On-demand TLS gated by the API's `tls-allowed` endpoint. This is generic tenant routing; a
  `blue_selfhosted` apex simply points its DNS at the customer's own box instead of our edge.

### 3.5 What was designed but NEVER built
- **Phase 8.0** — serve `install.sh` at `get.teculiar.com` (Caddy block or Virtualmin vhost). **Never done** —
  the endpoint does not exist on the box.
- **Phase 8.1** — `release-sync` versioned theme/locale bundle publisher + tenant **Updates** panel
  (auto-update/one-click apply/one-step revert). **Never built** — only the control-plane fields (§3.2) exist.
- **Phase 8.2** — installer wizard depth (auto/manual tenant-DB creation, simpler full-hosted path). **Never
  built.**

---

## 4. How self-hosters would have gotten theme/locale updates (parked)

Today (had anyone self-hosted): **manually**, via `docker compose pull && docker compose up -d` on `:latest`
(printed by install.sh). No in-product notification, no version pin, no revert. The intended system was Phase
8.1 (`release-sync` + Updates panel) — now dropped. This matters only for self-hosters, because they hold a
frozen copy of the storefront image; **hosted tenants are always current on redeploy.** If self-hosting is
revived, 8.1 must be built for it to be maintainable, and a **`/storefront/*` + `/api/v1` contract-stability
smoke test** added (an old downloaded theme must keep working against the current API — there is no such test
today).

---

## 5. Server footprint & how to turn it OFF / ON on the box

### What is actually running on eu01 for self-hosting? **Essentially nothing.**
Self-hosting was **never deployed** (Phase 8.0 skipped). Grep of `deploy/caddy/Caddyfile` and the box config
shows **no `get.teculiar.com` block or vhost**. So there is almost nothing to stop — and two things you must
**NOT** stop, because they serve your **hosted** tenants:

| Component | Stop it? | Why |
|---|---|---|
| **Caddy edge** | ❌ **NEVER** | It is the edge for *every* tenant — all `admin./client./api./apex` routing **and** on-demand TLS. Stopping it takes down dezhost.com, teculiar.com, and every subdomain. |
| **`storefront` container** | ❌ **NO** | Serves the **hosted** public sites (teculiar.com :3011, dezhost.com :3021). Not a self-host artifact. |
| **`get.teculiar.com` endpoint** | (nothing to stop) | Never created. Just **don't create it.** |

### To turn self-hosting OFF (what you should actually do)
1. **UI:** ship master-plan **Phase 8.1** — remove the `blue_selfhosted` radio + install-command block from the
   domain wizard. This is the real off switch: no tenant is ever told to self-host.
2. **Do not create** the `get.teculiar.com` install endpoint (Phase 8.0). Leave it absent.
3. **Optional — block anonymous external pulls:** make the ghcr package
   `ghcr.io/kgk45tgg45u/teculiar-storefront` **private** (GitHub → Packages → Package settings → visibility).
   - ⚠️ The box + the Dezhost thin-storefront compose must then pull it **authenticated** (they run as the org,
     via the deploy pipeline / a PAT), so **hosted serving is unaffected**. Verify a `docker compose pull` on
     the box still succeeds before relying on this.
   - If you would rather not risk the pull path, **leave it public** — it is inert: nobody can provision a
     tenant without buying, and the UI no longer hands out the install command.
4. **Do not remove** `deploy/storefront-install/install.sh`, `WhitelabelConfigDto`'s `blue_selfhosted` value,
   or the Caddy `(tenant_apex_routes)` snippet — they are shared/backend and needed to revive.

### To turn self-hosting back ON (reactivation)
1. **UI:** re-add the `blue_selfhosted` radio + install block to the domain wizard; restore the locale strings.
2. **Endpoint:** do master-plan Phase 8.0 — serve `install.sh` at `get.teculiar.com` (Option A: a named
   `get.teculiar.com { root * /var/www/get; file_server; header Content-Type "text/x-shellscript" }` block in
   `deploy/caddy/Caddyfile` + DNS A → floating IP `195.201.252.12`; `caddy validate` + reload). Option B: a
   Virtualmin vhost. **Recommended: Option A** (one edit to a file you already own; keeps the mail-serving
   primary IP / Apache untouched).
3. **Image:** ensure `teculiar-storefront` is **public** again (so customers can `docker compose pull`).
4. **Build 8.1** (`release-sync` + Updates panel) + the contract-stability smoke test (§4) before onboarding
   real self-hosters — otherwise they have no safe update path.
5. **Improve install.sh's reverse-proxy step** — generate snippets for nginx/Apache too, not just Caddy — or
   keep `blue_selfhosted` an advanced/"you know what you're doing" tier and push most self-host demand to
   `blue_hosted`.

---

## 6. Tenant-owned files — future design (parked; recorded here per owner request)

The owner's idea: let tenants keep their files (logos, uploads, ticket attachments) on their **own** storage.
This is related-but-distinct from storefront self-hosting; captured here so it isn't lost.

### Current state (the bug Phase 8.2 fixes now)
- Uploads are written to a **single shared** directory `apps/web/public/uploads/<subdir>/`
  (`apps/api/src/common/uploads.ts`, `apps/api/src/modules/tickets/ticket-files.ts`) and served with **no
  auth** (`apps/api/src/main.ts`). On the multi-tenant box, **all tenants share one uploads namespace** —
  contradicting the "DB is the isolation boundary" design. Random-UUID filenames make guessing hard, but that
  is **not isolation**. For `blue_selfhosted`/`external`, `/uploads` is proxied to the **hosted** API, so files
  live on *our* box even when the storefront runs elsewhere.
- **Phase 8.2 (now, in the master plan)** fixes only the local-disk part: tenant-scope the path to
  `uploads/<tenant>/<subdir>/...` and authorize serving by the request's tenant. Includes a migration plan for
  existing `storageKey`s.

### Recommended future design (deferred — pairs with "object storage" in the Deferred backlog)
Do **not** write to a customer's server over SSH/FTP (fragile, a security liability, and the owner's hard rule
is *never SSH the box*). Instead make storage a **per-tenant pluggable driver** where "their storage" means
**S3-compatible object storage they own**:

1. **Fix tenant scoping first** (Phase 8.2 — already planned above).
2. **`StorageDriver` interface** — `put(key, buffer, mime) → url`, `delete(key)`, `signedUrl(key)`. Two
   built-in drivers:
   - `local` (today's disk, tenant-scoped) — the default.
   - `s3` — any S3-compatible endpoint (AWS, Cloudflare R2, MinIO on their own box, Backblaze, Wasabi). The
     realistic "on their own hardware" answer: a self-hoster runs MinIO → files literally on their disk.
3. **Per-tenant config** in the tenant DB `SystemSetting` (`storage.driver`, `storage.s3.*`), exactly like
   payment-gateway creds today.
4. **Signed URLs are mandatory for ticket attachments** (PII) — bake signed-URL support into the interface
   from day one; do not rely on unguessable public paths. The storefront proxy needs no change: `storageKey`
   already holds a full URL/path.
5. **Do not** build per-tenant SFTP/WebDAV drivers — too many failure modes for too little demand.

Scope: driver interface + tenant scoping (8.2) + S3 driver + settings UI + locale strings ≈ one focused
sub-phase, and it is the natural first step off the single-box filesystem (the "object storage" Deferred item).

---

## 7. References
- [teculiar-master-plan.md](./teculiar-master-plan.md) — Phase 8 (wind-down + 8.2 upload isolation), 9.2
  (headless API, the new "own site" path), Deferred backlog (object storage, custom themes).
- [teculiar-architecture.md](./teculiar-architecture.md) — the hosted-vs-downloaded model, DB-per-tenant,
  edge routing (describes the self-hosted "Model B"; **read alongside this deferral note**).
- `apps/web/components/admin/domain-wizard.tsx`, `apps/api/src/tenancy/tenant-domains.controller.ts` — the
  wizard + config API.
- `deploy/storefront-install/install.sh`, `deploy/caddy/Caddyfile`, `deploy/caddy/README.md` — the installer +
  edge routing.
- `prisma/control-plane/schema.prisma` — `TenantDomain`, the reserved `*Version`/`autoUpdate` fields.
