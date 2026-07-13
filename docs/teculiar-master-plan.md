# Teculiar + Dezhost — one consolidated plan (go-live → stabilize → sell)

## Context

Dezhost has been cut over to the multi-tenant Teculiar stack: DNS for `dezhost.com` now points at
the Caddy floating IP (`195.201.252.12`), the new Caddyfile is on the box, and `dezhost.com` is served
by the `:edge` `/opt/teculiar` stack (storefront `:3021`, dashboards `:3010`, API `:4001`) as an
**apex-path tenant**. The old single-tenant Dezhost (`/opt/dezhost`, containers `:3000`/`:4000`, its own
DB, its Apache vhost) is now bypassed but still running and must be retired.

This file **merges the leftover Teculiar-roadmap work with the new bug/feature backlog into a single,
phase-ordered plan**. The old `docs/teculiar-roadmap.md` is stale (it still labels Phase 4.4/4.6 as
"in progress/planned" though the code is committed) — Phase 0 reconciles it. Priority, per the user:
**server cleanup → customer-facing bugs (with admin new-order recurring-domain ASAP) → multi-tenant
hardening → teculiar.com go-live**, everything aimed at getting Dezhost + Teculiar online and selling
as fast as possible without breaking the freshly-live site. A **Design Track** of guided frontend-design
sessions is folded in to redesign the admin/client dashboards (they currently look poor on desktop +
mobile) and, later, the Blue storefront theme.

**Decisions locked this session:**
- **Per-surface subdomains, for every tenant that wants them, with clean URLs.** If a tenant uses
  `portal.theirsite.com` (client) or `admin.theirsite.com`, the browser path must be
  `portal.theirsite.com/...` — **never** `.../client/...` or `.../portal/...`. dezhost.com itself moves to
  this model too (drops the doubled `/admin`).
- **Product-first provisioning module.** A product's own `provisioningModule` wins; category is a default
  for new products. Migration backfills each product's module from its category so nothing changes silently.
- Every "big change" ships on its own branch and is verified locally then on production per `CLAUDE.md`
  (Playwright Chromium against `https://www.dezhost.com` / the new hosts), with locale packs checked.

---

## Old Teculiar-roadmap status (reconciled — Phase 0 writes this into `docs/teculiar-roadmap.md`)

| Roadmap item | Actual state | Where it lands here |
|---|---|---|
| Phase 1 i18n/locale/currency | Implemented; prod verify pending | Verified as part of Phase 1/7 test passes |
| Phase 1 deferred: admin main-currency guard | Not built | Phase 7 |
| Phase 1 deferred: per-locale email editor | Not built (editor saves main lang only) | Phase 7 |
| Phase 2 theme foundation | Implemented | ✅ mark done |
| Phase 3 Customizer mechanism | Done, merged to `main` | ✅ mark done |
| Phase 3 leftover: author real Blue page content | Not done | Phase 4 (teculiar.com) + ongoing |
| Phase 4.1 multi-tenant API core | Done | ✅ mark done |
| Phase 4.2 web split (storefront/dashboards) | Done | ✅ mark done |
| Phase 4.3 Tecreator module + 4.3b licensing/suspension | Done (backend) | ✅ mark done; suspension **UI** → Phase 3 |
| Phase 4.4 Dezhost cutover | **Done** (user finished; DNS + Caddy live) | ✅ mark done in Phase 0 |
| Phase 4.5 release-sync publish + tenant Updates panel | **Not built** (documented only) | Phase 8 |
| Phase 4.6a–f edge/white-label/SSO/wizard/install | **Code committed** (doc says "planned") | ✅ mark done; finish wiring in Phase 2 |
| `ThemeRepository.mirrorsSeeded` per-tenant fix | Not fixed (process-level) | Phase 3 |
| Storefront "My Account" links via SSO handoff | Mechanism exists, not surfaced | Phase 2 |
| Teculiar-plan seed + marketing + pricing-table element | None exist | Phase 4 |
| Phase 5 custom themes / Phase 6 headless SDK+widgets | Not started | Phase 9 (headless API) + Deferred backlog |
| Secrets-manager indirection, LB, object storage | Not started | Deferred backlog |

---

## Categorized master backlog (every requested item → phase)

- **Ops / server (Phase 0):** retire old `/opt/dezhost` proxy + containers + DB; rename local folder to
  `teculiar`; make ghcr `dezhost-storefront` package public; serve `install.sh` at `get.teculiar.com`;
  final dezhost.com checks; reconcile roadmap doc.
- **Customer-facing bugs (Phase 1):** email currency garble; super-admin lockout; email logo/favicon;
  N- "not a final invoice" note; per-page meta descriptions; footer mobile 2-column; cookie banner;
  popular/"beliebt" badge unification; blog tags = frequently-used only; **admin new-order recurring
  domain (ASAP)**.
- **Per-surface subdomain white-label (Phase 2):** clean-URL admin/client subdomains for all tenants;
  surface-aware links (front + back); SSO handoff for the separate client origin; wizard/verify polish.
- **Multi-tenant hardening (Phase 3):** tenant-aware cron (no data spill); cron server output;
  `mirrorsSeeded` per-tenant; suspension-notice UI; remove leftover `refreshService`; confirm
  duplicate-renewal-invoice guard.
- **Design Track (guided sessions, sequenced around Phases 3–4):** dashboard redesign (admin + client,
  desktop + mobile) via the frontend-design skill (D1); Blue storefront theme redesign with subtle
  animations, customizer elements kept in sync (D2).
- **Teculiar.com go-live (Phase 4):** Teculiar-plan catalog seed; teculiar.com marketing content
  (Blue page authoring); reusable pricing-table element; provision `teculiar` tenant + enable Tecreator +
  verify the self-sell flow.
- **Admin productivity (Phase 5):** column sorting; multi-select bulk actions (delete / mark
  paid-unpaid); inline status-tag dropdown editing.
- **Catalog & commerce (Phase 6):** product addons; per-product modules (product-first); PayPal sandbox
  test process; modular payment gateways.
- **i18n depth (Phase 7):** product title/description translation; per-language email editor +
  per-customer-language dispatch verify; sales/support ticket routing (sales open to non-clients, support
  clients-only, no client-portal link in guest replies); admin main-currency guard.
- **Distribution & SEO (Phase 8):** release-sync theme/locale bundle publisher + tenant Updates panel
  (auto/one-click/revert); installer wizard (tenant DB creation + manual fallback + simple full-hosted
  path); XML sitemap format fix.
- **Rebrand & platform breadth (Phase 9):** hard-coded "Dezhost" → "Teculiar" (software defaults, keep
  tenant brand via settings); headless API + SDK/widgets; document MySQL/MariaDB-only DB support.
- **Deferred backlog:** secrets-manager indirection; load balancer + object storage; Phase 5 custom
  themes (Properties tab / `Theme.styling`).

---

## Phase 0 — Server cleanup, go-live stabilization, doc reconciliation

Goal: retire the old proxy/stack cleanly, unblock external self-hosting, and make the docs truthful.
No app-code risk; mostly operator commands (user runs them on eu01) + a doc edit.

### 0.1 Verify the new dezhost.com tenant is fully live before tearing anything down  ✅ DONE (2026-07-06 — verified, as expected)
- `dig +short dezhost.com` → `195.201.252.12` (floating IP, not the old primary `178.104.82.146`).
- `curl -sIL --resolve dezhost.com:443:195.201.252.12 https://dezhost.com | grep HTTP` → 307→200.
- Browser: `dezhost.com` storefront, `dezhost.com/admin` login, `dezhost.com/client`, blog posts present.
- Confirm imported blog + a test order flow (per `docs/teculiar-phase4.6-server-migration.md` §6c step 5).

### 0.2 End the old proxy / stack (only after 0.1 passes)  ✅ DONE (2026-07-07 — old `:3000`/`:4000` containers confirmed gone via `docker ps`)
```bash
# a) Stop + remove the OLD single-tenant containers (keeps volumes/DB for now).
#    ⚠️ SEEN 2026-07-06: `docker compose down` → "no configuration file provided: not found".
#    Cause: no default docker-compose.yml in /opt/dezhost — the old prod uses a NON-default filename
#    (most likely docker-compose.prod.yml, like /opt/teculiar) or a different working dir. Diagnose:
ls -la /opt/dezhost                                # find the actual compose file name
docker compose ls                                  # running compose projects + their config file paths
docker ps                                          # confirm which containers are the OLD stack (:3000/:4000)
# Then bring it down with the real filename:
cd /opt/dezhost && docker compose -f docker-compose.prod.yml down    # frees :3000 / :4000
# If /opt/dezhost has NO compose file, stop by project or by container id instead:
#   docker compose -p <project-from-docker-compose-ls> down
#   OR   docker stop <old-container-ids> && docker rm <old-container-ids>

# b) Remove ONLY the old reverse-proxy block from the dezhost.com vhost (Virtualmin → dezhost.com
#    virtual server → Edit Directives): delete the `Alias /uploads/` + its <Directory>, and the
#    `ProxyPass`/`ProxyPassReverse` for /uploads/, /api/, and / (they point at the now-removed
#    :3000/:4000 containers); optionally drop the orphaned `ProxyPreserveHost On`/`ProxyRequests Off`.
#    ⚠️ KEEP everything else — this is a Virtualmin vhost that ALSO serves mail: ServerName/Alias,
#    DocumentRoot, PHP-FPM/fcgiwrap SetHandlers, the webmail.→:20000 / admin.→:10000 (Webmin, NOT the
#    app admin) RewriteRules, autoconfig/autodiscover ScriptAliases, all SSL* directives, apex→www redirect.
#    ⚠️ DO NOT disable Let's Encrypt renewal here — the same cert covers mail./webmail./autoconfig./
#    autodiscover.dezhost.com, which mail clients + webmail still need. Caddy only owns the public
#    dezhost.com/www web cert on the floating IP; Apache keeps mail on the primary IP with this cert.
httpd -t && sudo systemctl reload httpd            # RHEL-family box (httpd, not apache2)
# verify Caddy still serves public: curl -sI --resolve dezhost.com:443:195.201.252.12 https://dezhost.com | head -1

# c) Back up the OLD DB, keep read-only for the retention window (do NOT drop yet)
mysqldump --single-transaction <old_db_name> | gzip > ~/dezhost-old-$(date +%F).sql.gz
```
- **Do NOT drop the old DB or delete `/opt/dezhost` yet** — keep read-only for records until you're
  satisfied (roadmap "start fresh" decision). Teardown checklist for later (0.5).

### 0.3 Rename the local dev folder → `teculiar`  ✅ DONE (2026-07-07 — CWD is `~/code/Teculiar`; optional ghcr-image rename deferred to Phase 9)
- The GitHub repo is already `kgk45tGg45u/Teculiar`; only the working dir is still `New Dezhost`.
- Do this **between sessions** (renaming the CWD mid-session breaks tool paths): close the editor, then
  `mv "~/code/New Dezhost" ~/code/Teculiar`, reopen. `.git`/remotes are unaffected.
- Optional (bigger, defer to Phase 9): rename the ghcr images `dezhost-{api,web,storefront}` →
  `teculiar-*` (touches `.github/workflows/deploy.yml`, `docker-compose.prod.yml`, `install.sh`).

### 0.4 Unblock external self-hosting
- **Make ghcr `dezhost-storefront` public:** ✅ DONE (2026-07-07). GitHub → org → Packages →
  `dezhost-storefront` → Package settings → Change visibility → **Public**. (API + web stay private — they
  are hosted, never downloaded.) `deploy/storefront-install/install.sh` pulls only the storefront image.
- **Serve `install.sh` at `get.teculiar.com` + the end-to-end wizard check → DEFERRED to Phase 8**
  (step-by-step lives in **8.0**; its `curl` check moves to the Phase 8 Verify). Not needed for the
  dezhost.com go-live — the storefront image is already public, which unblocks a manual install; the
  hosted `get.teculiar.com` convenience URL and the throwaway-VM wizard run belong with the Phase 8
  distribution/installer work.

### 0.5 Reconcile the roadmap doc (only doc edit this phase)  ✅ DONE (2026-07-07)
- Update `docs/teculiar-roadmap.md`: mark Phase 4.4 **done** (cutover complete), Phase 4.6a–f **done**
  (committed `7d01c77`/`ac511a5`), and add a "carried forward" note pointing at this plan for 4.5 +
  the follow-ups. Also refresh `docs/teculiar-phase4.6-plan.md` header ("planned" → "implemented").

### 0.5-later — Old-stack teardown checklist (run when satisfied, e.g. 2–4 weeks post-cutover)
`DROP DATABASE <old_db_name>;` (after the backup in 0.2c), `sudo rm -rf /opt/dezhost`, remove old ghcr
`:latest` deploy hooks if the box no longer runs the single-tenant path.

### 0.6 Make `main` the production deploy channel (post-cutover)  ✅ DONE (2026-07-08 — `28b6256` repointed deploy.yml at `/opt/teculiar` + `/opt/dezhost-storefront`; main deploys green since (scp works ⇒ dir ownership fixed); Phase 1+2 prod-verified on www.dezhost.com off main-built images ⇒ box follows `:latest`. Step 3 landed via direct main merges instead of the old phase4-separation branch. Leftover: workflow still builds `:edge` on pushes to the dormant `feat/teculiar-phase4-separation` branch — retire or repoint when convenient.)
The cutover left the deploy pipeline pointing at the retired stack. `.github/workflows/deploy.yml` today:
`main` → build `:latest` → SSH-deploy into **`/opt/dezhost`** (the OLD single-tenant stack, now torn down).
But the live site is `:edge` in **`/opt/teculiar`** (api/web/teculiar.com-storefront) + **`/opt/dezhost-storefront`**
(dezhost.com storefront). So merging to `main` today would deploy `:latest` to the wrong (retired) dir and
never touch the live stacks. To get "merge to `main` → update everything" (the user's goal):
1. **Repoint the deploy job** off `/opt/dezhost`: scp `docker-compose.prod.yml` → `/opt/teculiar/`, then
   `cd /opt/teculiar && docker compose pull && up -d --remove-orphans`; then
   `cd /opt/dezhost-storefront && docker compose pull && up -d` (its compose comes from the `Dezhost` repo —
   no scp). One main-merge then updates API + dashboards + both storefronts. **The `deploy` user must own
   both dirs** — `sudo chown -R deploy:deploy /opt/teculiar /opt/dezhost-storefront` — or the scp fails
   `Permission denied` (`/opt/teculiar` is `sudo mkdir`'d root-owned by default).
2. **Flip the release channel** `:edge` → `:latest` (one-time, on the box, since a workflow can't edit server
   `.env`): `sed -i 's/^IMAGE_TAG=edge/IMAGE_TAG=latest/' /opt/teculiar/.env /opt/dezhost-storefront/.env`.
   Both composes already use `${IMAGE_TAG:-latest}`. (`:latest` currently holds the OLD single-tenant build;
   the first `main` merge overwrites it with the multi-tenant build — intended, we're retiring single-tenant.)
3. **Merge** `feat/teculiar-phase4-separation` (+ Phase 1) → `main`. Actions runs the workflow **at the merged
   ref**, so land the fixed `deploy.yml` on the branch *first*, then merge — the main-push runs the corrected job.
4. Optionally keep `:edge` (feature-branch build, no deploy) as a pre-prod channel, or drop the branch trigger.
5. Retire the `/opt/dezhost` deploy target (dovetails with the 0.5-later teardown).
**Independent of the dezhost→teculiar rename (9.1)** — the rename is a separate deliberate change; this is
just repointing the existing pipeline. `:edge`/`:latest` are version **tags**, not names — nothing is renamed here.

### Verify (Phase 0)
`dig`/`curl` checks in 0.1 (✅); `docker ps` shows only the `/opt/teculiar` (`teculiar-{web,storefront,api}`)
+ `/opt/dezhost-storefront` (`dezhost-storefront`) containers, the old single-tenant `:3000`/`:4000` stack
gone (✅ confirmed 2026-07-07); roadmap doc renders with the corrected status (✅). **Note:** all four
containers currently report `(unhealthy)` while serving fine (site verified live in 0.1) — a cosmetic
healthcheck-probe issue, tracked as **Phase 3.6**. The `get.teculiar.com/install.sh` 200 check moved to
**Phase 8 (Verify)**.

---

## Phase 1 — Customer-facing bug fixes (fast, high-impact, low-risk)  ✅ PHASE DONE (2026-07-12 — all 11 items done; prod verify spec 4/4 green against www.dezhost.com)

Each is small and independent; batch on one branch but commit per fix. Prod-test after each.

### 1.1 Email currency garble `3,99� AC` → `3,99 €`  *(HIGH — every invoice/order email)*  ✅ DONE (2026-07-08 — QP now encodes UTF-8 bytes; verified in prod)
- Root cause: `toQuotedPrintable` in `apps/api/src/modules/email/email.service.ts:886-925` encodes
  **UTF-16 code units** (`line.charCodeAt(i)` → `=20AC`, `=A0`) under a `charset="UTF-8"` part.
- Fix: encode **UTF-8 bytes** — iterate `Buffer.from(char, "utf8")` for any code point > 126 (or the
  whole line via `Buffer.from(line, "utf8")`), emitting each byte as `=XX`; keep the tab/space and
  soft-wrap logic. Add a unit test asserting `€`/NBSP round-trip through a QP decoder.

### 1.2 Super-admin lockout  *(HIGH — the new super_admin can't log in)*  ✅ DONE (2026-07-08 — super_admin login + admin actions verified in prod)
- Root cause: front-end gates + login accept only `admin`/`staff`; several APIs `@Roles("admin","staff")`.
- Front-end: widen the role check to include `super_admin` in `apps/web/components/auth/login-form.tsx:42`,
  `apps/web/components/admin/admin-dashboard.tsx:77`, and the SSR gates in
  `apps/web/app/admin/{clients/[clientId],products/modules,invoices/[invoiceId],theme,theme/customizer/[pageKey],orders/[orderId],services/[serviceId]}/page.tsx`.
  Factor a shared `isAdminRole(roles)` helper (accepts `admin|staff|super_admin`) so this never drifts again.
- Back-end: add `super_admin` to the `@Roles(...)` lists that currently omit it —
  `apps/api/src/modules/products/products.controller.ts` (incl. service-status PATCH),
  `apps/api/src/modules/billing/billing.controller.ts` (mark-paid/unpaid/refund),
  `apps/api/src/modules/email/email.controller.ts`, `apps/api/src/modules/cron/cron.controller.ts`.
- Verify: create a `super_admin` via `POST /admin/dev/admins`, log in, hit products/invoices/services.

### 1.3 Admin new-order recurring domain  *(user wants ASAP)*  ✅ DONE (2026-07-09 — local verify green: typecheck + `next build` + unit tests; deployed via GitHub Actions)
- Today (`NewOrderForm` in `apps/web/components/admin/admin-forms.tsx` ~1700-1940 → `POST /orders/admin`):
  the domain line uses `defaultDomainProduct.prices[0]?.id` — a single price whose cycle is independent of
  the hosting item; backend `orders.service.ts` already gives domains an annual cadence
  (`requestedDomainCycle`→`YEAR_1`, `quantity = years`, `nextInvoiceAt = nextBillingDate(...)`).
- Make it correct + explicit when the **order is recurring**:
  - The domain register/transfer line must be **recurring on a domain-appropriate cycle** (never MONTHLY):
    map the hosting cycle → the domain's yearly cycle (monthly/quarterly hosting → `YEAR_1` domain; annual
    hosting → matching multi-year only if chosen). Add a small `domainCycleFor(hostingCycle)` helper reused
    by the form preview and `orders.service.ts` so UI and backend agree.
  - Surface the domain's recurring price + cycle in the pricing preview (currently one-time-ish), and pass
    the resolved `billingCycle` on the domain item so `previewItem`/activation bill it recurringly.
  - Guard: reject a MONTHLY domain cycle server-side (`orders.service.ts`) with a clear 400.
- Verify: place a recurring hosting+domain order in admin; confirm the domain gets a yearly `Subscription`
  + renews on its own annual cadence; confirm the storefront checkout path is unaffected.
- **Follow-up (custom price + discount now reflected on the created artifacts):** the admin form computed
  custom pricing and discounts in the preview only — the discount was never sent to the backend and the
  custom price fields were ignored by `priceItem`. Fixed so:
  - **Custom price** overrides the order item's `unitAmountCents`/`billingCycle` (`priceItem`), flowing to
    the order item, first invoice, and `Service.recurringAmountCents` → Cron renewals. `applyCustomToRenewals`
    off keeps renewals at the list price (via `configuration.renewalAmountCents`).
  - **Discount** (flat) → billed as its **own invoice line** with **no VAT** (`vatRate: 0`): a €1 discount
    takes exactly €1 off the total; VAT stays computed on the full product/domain lines, which are **never
    reduced/distributed into**. Applies to the **whole order**. One-time = first invoice only; recurring =
    the amount is stored on the primary product `Subscription` (as an internal coupon) and `renewSubscription`
    re-adds an equivalent discount line to every renewal invoice. Shows as a *Discount* line on the order,
    both invoice sheets, and the PDF. (Superseded two earlier approaches: coupon distribution across lines,
    then a VAT-carrying discount line.)
  - **Invoice VAT rule**: all entered/looked-up prices are net; VAT is **added** on top of every product
    line (hosting + domain), never extracted. The admin preview mirrors the engine so preview = invoice = order.
  - **"Apply custom price to renewals" fix**: `activateItem` (Run-modules / legacy-payment path) used to
    create a *duplicate* service (recurringAmountCents 0) + subscription, so renewals silently billed the
    list price. It now reuses the pending-entities service; `createServiceForItem` captures the renewal
    amount + billing cycle for any legacy path; the renewals opt-out falls back to the **cycle-matched**
    list price; `createDomainRecord` upserts (no unique-domain crash on activation). Orders created with
    *Run modules* **before** this fix may carry orphaned duplicate services/subscriptions — check and
    cancel manually.
  - See `docs/ordering-and-invoices.md` → *Admin Order Creation* + *Reverse charge & 0% VAT*. Storefront
    checkout still sends neither custom price nor discount.
  - **Preview/renewal-invoice sync fix**: the *"Apply custom price to renewals"* checkbox was uncontrolled
    (`defaultChecked`, no state), so toggling it never updated the preview, and the *Next renewal* row
    always showed the custom price regardless of the toggle. Made the checkbox controlled state and had
    the preview's renewal line mirror `priceItem`'s own fallback exactly (custom price when applied;
    otherwise the list price matching the custom cycle) — verified numerically against the compiled
    backend for both toggle states.

### 1.4 N- invoice "not a final invoice" note  ✅ DONE (2026-07-11 — pending `N-` invoices render the localized note; unit test added; local verify green)
- Pending invoices carry a temporary `N-` number; final sequential number on payment
  (`docs/ordering-and-invoices.md`). In `apps/api/src/modules/billing/invoice-document.ts`
  `renderInvoiceDocument()`, when the number starts `N-` (pending), render a note: "This is not a final
  invoice. A final invoice will be issued after successful payment." Localize via the `invoice` pack
  (`packages/locales/{de,en}/invoice.json`).

### 1.5 Emails get a logo/favicon icon  ✅ DONE (2026-07-11 — `{{brand_logo}}` header <img> from `siteLogoUrl`→`faviconUrl`, absolute URL; editor preview + tests; caveat: SVG logos may not render in Gmail/Outlook)
- Default shell `DEFAULT_EMAIL_TEMPLATE_HTML` (`apps/api/src/modules/email/email-events.ts:112-140`) is
  text-only. Add an `<img>` header using the tenant's brand logo/favicon (reuse the storefront `brandLogo`
  source / a `SystemSetting`), embedded as an absolute `https://<tenant>/...` URL (emails can't use
  relative/`cid` easily here). Keep it overridable via the `emailTemplateHtml` setting.

### 1.6 Per-page meta descriptions actually emitted  ✅ DONE (2026-07-11 — shared `pageMetadata(pageKey, locale)` helper + `generateMetadata` on all 14 CustomPageGate theme routes; test added; typecheck green)
- `Page.seoTitle`/`seoDescription` (per-locale JSON) are stored + admin-editable
  (`apps/web/components/admin/theme/pages-tab.tsx`) but theme routes render only `<CustomPageGate>` with
  **no `generateMetadata`**, so they inherit the site-wide default (`apps/storefront/app/[locale]/layout.tsx`).
- Add a shared `pageMetadata(pageKey, locale)` helper in `packages/web-core/src/lib/storefront-theme.ts`
  and export `generateMetadata` from each theme route (`webhosting`, `vps`, `reseller`, `domains`,
  `it-losungen`, home, about, contact, legal) reading the Page SEO (fallback → site default). Test one page.

### 1.7 Footer mobile → two columns  ✅ DONE (2026-07-11 — ≤600px keeps the two menu columns side by side; the CTA block spans the full row below)
- One CSS rule: `packages/web-core/src/components/layout/site-footer.module.css:145-148` — change the
  `max-width: 600px` `grid-template-columns: 1fr` → `1fr 1fr`. Check the CTA column wraps acceptably.

### 1.8 Cookie banner (small, bottom, buttons that just dismiss)  ✅ DONE (2026-07-11 — `CookieBanner` in web-core layout, rendered in storefront + dashboards root layouts; Accept/Settings/Deny all set `cookie_ack`; strings in the common pack de/en)
- No banner exists (a `CookieConsent` DB model does, unused). Add a small horizontal bottom banner in
  `packages/web-core/src/components/layout/` (so both storefront + dashboards get it), rendered in the
  storefront root layout. Buttons **Accept / Settings / Deny** all just set a `cookie_ack` localStorage
  flag and dismiss (no real consent logic yet). Locale packs (`common`/`storefront`) get the strings.
  Must work regardless of the tenant's apex/subdomain setup (pure client component, no host assumptions).

### 1.9 Unify the "popular"/"beliebt" badge → reseller style, everywhere in the customizer  ✅ DONE (2026-07-11 — `Product.featured` column + migration drives one shared `PopularBadge` (reseller style) on webhosting grid, reseller page, customizer productGrid; admin product form checkbox. NEW: `TenantMigrationsService` runs `migrate deploy` against every registered tenant DB at API boot so schema changes reach existing tenants. Post-deploy: flag the desired products in admin — until then no card shows the badge.)
- Two implementations today: reseller `styles.popular` (`apps/storefront/app/[locale]/reseller/page.tsx:142`)
  vs home `styles.packageBadge` (`.../webhosting/hosting-packages.tsx:46`). The customizer `productGrid`
  element (`packages/web-core/src/lib/customizer/registry/product.tsx`) has **no** badge.
- Adopt the reseller badge style as the single shared badge; add a data-driven "popular/featured" flag to
  the `productGrid` `ProductCard` and to the home grid, dropping the old `packageBadge`. Drive it off a
  product/price flag so admins control which card is highlighted.

### 1.10 Blog front-end: only frequently-used tags  ✅ DONE (2026-07-11 — `/cms/post-tags` returns top-N by published-post usage count, default 12, optional `?limit` ≤50; per-post tag rows unchanged; unit test added)
- `apps/storefront/app/[locale]/blog/page.tsx:33` fetches **all** tags via `/cms/post-tags`. Add a
  usage-count threshold/limit at the source (`apps/api/src/modules/cms` `post-tags` → return top-N by post
  count) so the chip cloud shows only popular tags; per-post tag rows stay full.

### 1.11 Local dev: storefront not reachable  ✅ DONE (2026-07-12 — `dev:storefront` + `dev:all` root scripts; README documents port 3001, `<tenant>.localhost` host-based tenant resolution, and the dev rewrites to :3000/:4000; boot smoke-tested — HTTP 200 on `/de`)
- On local dev only `admin` and `client` open — those are the `apps/web` app on **`localhost:3000`**. The
  **storefront** is a *separate* app (`apps/storefront`) on **`localhost:3001`**, and the root dev scripts
  (`dev`, `dev:web`, `dev:full`) only start `apps/web` + API — none starts `apps/storefront`. Storefront
  routing is also host/tenant-based, so a bare `localhost:3001` may not resolve to a tenant. Add a
  `dev:storefront` (and a `dev:all` that runs web + storefront + API) script and document the local
  host/tenant setup so the storefront is openable locally. Until then, verify storefront changes on prod
  (`https://www.dezhost.com`) per `CLAUDE.md`.

### Verify (Phase 1)
**2026-07-12: phase-end prod run green** — `tests/e2e/specs/phase1-bugfix-verify.spec.ts` 4/4 on
www.dezhost.com (1.7 footer, 1.8 cookie banner, 1.9 featured badge, 1.10 tag cloud); 1.1–1.6 were
prod-verified individually at their DONE dates. Note: E2E passwords in `.env` must be single-quoted —
a `$` inside double quotes gets expanded by `source .env` and the login 401s.
Local: `node --test` for the QP encoder + any new units; `next build`; `i18n-sync --check`. Prod
(Playwright Chromium, `E2E_BASE_URL=https://www.dezhost.com`): send a test order/invoice email and eyeball
the `€`; super_admin login + a products/invoice action; place an admin recurring hosting+domain order and
inspect the domain subscription; view a pending invoice PDF for the N- note; mobile-viewport footer;
cookie banner dismiss; a page's `<meta name="description">`.

---

## Phase 2 — Per-surface subdomain white-label (clean URLs, all tenants)

Goal: `admin.<domain>` and `<clientLabel>.<domain>` serve dashboards **at the host root** — no `/admin`
or `/client` segment in the URL — for any tenant that opts in, while apex-path tenants (dezhost.com's
current model can stay, or move) keep working. This is the proper fix for both subdomain bugs and folds in
the SSO handoff + "My Account" links.

The config already exists (`whitelabel.config` = `{ apexMode, dashboards, clientLabel }` via
`apps/api/src/tenancy/tenant-domains.controller.ts`) and `TenantDomain.surface` (control-plane) resolves
`admin|client|api|apex`. What's missing is **consuming** it: the edge doubles the segment and links are
host-relative.

### 2.1 Edge: strip the surface segment for per-surface hosts  ✅ DONE (2026-07-12 — approach evolved during 2.2: the edge does NOT path-rewrite (an external rewrite desyncs `usePathname()`/hydration — server would render `/admin/x` while the browser shows `/x`). Instead the Caddyfile catch-all only CLASSIFIES the host via the `X-Teculiar-Surface` request header (`admin.*`→admin, other label→client, `api.*`→delete; apex snippet deletes it, so it can't be spoofed; the three matchers are disjoint because Caddy reorders same-directive ops) and the dashboards middleware does the mapping (2.2). `caddy validate` green locally. Deploy: copy to eu01 `/etc/caddy/Caddyfile` → `caddy validate` → reload; live verify at phase end.)
- In `deploy/caddy/Caddyfile` catch-all (`https://`), replace the root `redir @adminRoot /admin` /
  `redir @clientRoot /client` (which cause `admin.<d>/admin`) with **internal rewrites** that map the
  host's surface to the app's route prefix without changing the browser URL:
  `admin.<d>/<path>` → dashboards `/admin/<path>`; `<clientLabel>.<d>/<path>` → `/client/<path>`; assets +
  `/api` + `/uploads` unchanged. Caddy `rewrite`/`handle` keeps the URL bar on `admin.<d>/...`.
- Keep the apex-path block for named apex hosts as-is (dezhost.com today).

### 2.2 App: serve dashboards at the subdomain root via surface-aware base paths  ✅ DONE (2026-07-12 — `apps/web/middleware.ts` maps clean surface-host paths to the internal `/admin`|`/client` routes with a Next rewrite (URL bar untouched; guards run on the internal path; login redirects + `next` stay surface-relative). Pure helpers in `packages/web-core/src/lib/surface.ts` (`internalPath`/`surfaceHref`/`hrefForSurface`) + `useSurfaceHref` hook (client components, derives shape from `usePathname`) + `surfaceHrefMapper`/`requestSurface` in `server-api.ts` (server components, reads the edge header). All `/admin`+`/client` link/redirect emitters in `apps/web` routed through them (~85 sites: sidebar, breadcrumbs, both dashboards, admin-forms/blog/support/departments/pages-tab/builder, server detail pages, payment pages, login/logout, `redirectToAdminLogin`). Apex-path hosts and local dev: no header → byte-identical behaviour. Local verify green: tsc (web/web-core/storefront), `next build`, `node --test` 90/90 (2 stale assertions updated), `i18n-sync --check`. Known 2.3 leftover: admin "view site" `/${locale}` link 404s on a surface host — needs the tenant apex URL from settings.)
- The dashboards Next app (`apps/web`) serves `/admin` + `/client` from one app; a static `basePath`
  can't be per-host. Approach: keep the app routes at `/admin`/`/client`, let the edge rewrite handle
  the incoming URL (2.1), and make **all emitted links + redirects surface-relative** so the browser never
  shows the segment. Add a `surfaceBase()` helper (reads the resolved surface from the request host /
  a header the edge sets) returning `""` for a surface-subdomain host and `/admin`|`/client` for apex-path
  hosts. Route all internal `href`/`redirect`/middleware guards through it:
  `apps/web/middleware.ts` (guards `/admin`,`/client`), `admin-sidebar.tsx`, `admin-dashboard.tsx`,
  and the `apps/web/app/admin/layout.tsx` `brandHref`.

### 2.3 Surface-aware links (front + back)  ✅ DONE (2026-07-12 — API: `ControlPlaneService.surfaceHosts(tenantId)` (cached, supersedes `primaryApexHost` internals) → `TenantContext.surfaceBaseUrls` → `tenant-urls.ts` `tenantSurfaceOrigin`/`tenantSurfaceUrl`/`tenantClientUrl`; the `publicWebUrl()`/`appBaseUrl()` duplicates are gone and every generated link goes through the helpers: reset-password (scope's origin), invoice/service/domain emails, payment return/cancel urls, ticket urls. `/storefront/settings` now returns `clientBaseUrl`; `/admin/dev/billing/settings` returns `storefrontBaseUrl`. Front: `AccountMenu` links `clientBaseUrl` (threaded through `SiteHeader` from storefront + admin/client layouts); admin "view site" button uses `storefrontBaseUrl` (fixes the 2.2 leftover). Apex-path/single-tenant links byte-identical (unit-tested). Verify: API 223/223 incl. new `tenant-surface-urls.test.mjs`, web 92/92, builds + tsc + i18n green.)
- **Client login/account link:** `packages/web-core/src/components/layout/account-menu.tsx` hardcodes
  `href="/client"`. Make it resolve the tenant's **client base URL** (apex `/client` vs
  `https://<clientLabel>.<domain>`) from a value surfaced by `/storefront/settings` (add `clientBaseUrl`
  to the storefront settings payload, derived from `whitelabel.config` + `TenantDomain`). Same for the
  admin panel's account menu (`apps/web/app/admin/layout.tsx`).
- **Backend links:** `apps/api/src/tenancy/tenant-urls.ts` `tenantWebBaseUrl()` returns the apex host;
  add a `tenantClientUrl(path)` / `tenantSurfaceUrl(surface, path)` that consults the client subdomain
  when configured. Route the reset-password link (`auth.service.ts:376`), invoice/service/domain links
  (`billing.service.ts:2289/2339/2365`), payment returns (`:145/:381`), and ticket links
  (`tickets.service.ts:487`) through it. Reconcile the `publicWebUrl()` vs `tenantWebBaseUrl()`
  inconsistency (flagged) onto one helper.

### 2.4 SSO handoff for the separate client origin + "My Account" links  ✅ DONE (2026-07-12 — the 4.6e handoff page moved into shared web-core (`SsoHandoffScreen`), mounted at `/sso/handoff` on BOTH apps (storefront + dashboards, so admin→client-origin also works; the route is in the middleware ROOT_PAGES so it is never surface-prefixed). `AccountMenu`'s logged-in Dashboard link engages `/sso/handoff?to=<clientBaseUrl>` only when the client origin differs from the current one (checked after mount — hydration-safe); same-origin stays a plain link, logged-out always links straight to the client base (login there). In-memory SSO store still single-instance — fine on the one box, LB revisit stays in the Deferred backlog.)
- When the client area is a **different origin** than the storefront (`<clientLabel>.<domain>` vs apex),
  a same-origin cookie won't carry over. Wire the existing SSO handoff
  (`apps/api/src/modules/auth/sso-handoff.ts` + `auth.controller` `sso/exchange`/`sso/redeem`) into the
  storefront "My Account"/login link so a logged-in storefront visitor lands authenticated on the client
  subdomain. Only engage the handoff when origins differ; same-origin stays a plain link.
- Note the in-memory SSO store (`sso-handoff.ts`) is single-instance — fine on the one box; the shared
  store is a Deferred-backlog (LB) item.

### 2.5 dezhost.com model choice  ✅ READY (2026-07-12 — decision was locked at plan time: dezhost.com moves to per-surface subdomains. No code: the move is `register-domain.js admin.dezhost.com dezhost admin active` + `client.dezhost.com dezhost client active` on eu01 plus DNS A records to the floating IP — steps 2+5 of the Verify runbook below. Apex-path URLs keep working in parallel (2.2 passthrough), and 2.3's `clientBaseUrl` flips to the client origin automatically once the host is registered.)
- Per the decision, per-surface subdomains are available; dezhost.com can either stay apex-path (works
  today once the doubled-admin bug is gone) or move to `admin.dezhost.com`/`client.dezhost.com`. If moving,
  register the hosts (`register-domain.js admin.dezhost.com dezhost admin active`, `client.dezhost.com …
  client active`), point DNS at the floating IP, and rely on 2.1–2.4. Either way, the "doubled `/admin`"
  disappears.

### Verify (Phase 2) — deploy runbook (all code landed 2026-07-12; local verify green; prod checked and good. Test 7 fails because of wrong client route (dezhost.com admin defined another client address label.))
Order matters: **app before Caddyfile** (new Caddyfile + old app = 404 on surface hosts).
1. **Deploy the app:** merge `feat/teculiar-phase2-whitelabel` → `main`, let GitHub Actions deploy;
   confirm containers restarted (`docker ps` on eu01).
2. **Register the surface hosts** (2.5; enables on-demand TLS for them):
   `cd /opt/teculiar && docker compose exec api node apps/api/dist/tenancy/register-domain.js admin.dezhost.com dezhost admin active`
   (and the same with `portal.dezhost.com dezhost client active` — "portal" is dezhost's chosen
   client label). Only ONE client-surface row may be ACTIVE per tenant (`clientBaseUrl` picks the
   first): if `client.dezhost.com` was registered earlier, disable it —
   `register-domain.js client.dezhost.com dezhost client disabled`.
3. **Install the Caddyfile:** `scp deploy/caddy/Caddyfile eu01:/tmp/` →
   `sudo caddy validate --config /tmp/Caddyfile` → backup `/etc/caddy/Caddyfile` → copy → `sudo systemctl reload caddy`.
4. **Curl matrix** (works pre-DNS via `--resolve <host>:443:195.201.252.12` ONLY after DNS exists —
   Let's Encrypt needs public DNS to issue; so run after step 5, or accept cert errors): apex
   `/de` 200 + `/admin` → `/admin/login` unchanged; `https://admin.dezhost.com/` (and portal.) → 307
   `/login?next=%2F`; legacy `admin.dezhost.com/admin/login` 200; spoofed `X-Teculiar-Surface`
   header on apex changes nothing.
5. **DNS (2.5):** `admin.dezhost.com` + `portal.dezhost.com` → CNAME `edge.teculiar.net` (or A
   `195.201.252.12`); verify `dig +short edge.teculiar.net` → the floating IP. ✅ user set the
   CNAMEs 2026-07-12.
6. **Prod Playwright:** `tests/e2e/specs/phase2-whitelabel-verify.spec.ts` (7 tests: settings
   clientBaseUrl, apex unchanged, header spoof stripped, clean-URL admin + client login/nav,
   legacy passthrough, storefront→client SSO handoff). `set -a && source .env && set +a`, then
   `E2E_BASE_URL=https://www.dezhost.com E2E_API_URL=https://www.dezhost.com/api/v1 npx playwright
   test tests/e2e/specs/phase2-whitelabel-verify.spec.ts --project=chromium --workers=1`
   (optional `E2E_EDGE_IP=195.201.252.12` pins the new hosts while local DNS caches catch up).
7. **Email spot-check:** trigger a password reset from the client login → link points at
   `https://client.dezhost.com/reset-password?...`; an invoice email links `client.dezhost.com/invoices/…`.
Rollback: restore `/etc/caddy/Caddyfile.bak-<date>` + reload; app rolls back by redeploying the
previous image tag. Registering/DNS-ing the hosts is additive — apex-path keeps working throughout.

---

## Phase 3 — Multi-tenant hardening (no data spill)

Goal: make the background/scheduled paths tenant-safe now that multi-tenancy is live.

### 3.1 Tenant-aware cron  *(the key gap)*
- `apps/api/src/modules/cron/cron.service.ts` runs with **no ALS tenant context**, so `this.prisma`
  falls back to the single default DB — in multi-tenant mode it only ever touches one tenant. Wrap the run
  loop to **iterate all active tenants** from the control-plane and execute each tenant's jobs inside
  `runWithTenant(ctx)` (reuse `ControlPlaneService` to list tenants + `ConnectionRegistry.clientFor` +
  `runWithTenant` from `apps/api/src/tenancy/`). In single-tenant fallback (`controlPlane.enabled` false),
  keep today's single pass. **No cross-tenant reads** — each tenant's jobs see only its own client.
- Per-tenant timing: keep the per-job "due" cadence per tenant (store last-run in each tenant DB, as today).

### 3.2 Cron server output
- Cron already logs to DB (`Admin → Settings → Cron`/`Logs`) + `Logger("Cron")` stdout. Add a **server-side
  success/failure signal** the operator can see without the dashboard: change the crontab line in
  `docs/cron.md` to append to a logfile + record HTTP status (`curl -w`), and have the endpoint return a
  compact JSON summary (`{ran, failed, skipped, perTenant}`) so `curl` output is meaningful. Document a
  one-line "did cron run in the last N minutes?" check.

### 3.3 `ThemeRepository.mirrorsSeeded` per-tenant
- `apps/api/src/modules/theme/theme.repository.ts:15` `mirrorsSeeded` is a **process-level** boolean, so in
  multi-tenant only the first tenant's lazy path seeds Customizer mirror drafts. Make it per-tenant (keyed
  by tenant/db in a `Set`/`Map`, or a `SystemSetting` flag written per tenant). `createTenant` already
  sidesteps this by calling `ensureContentSeeded`/`ensureStylingSeeded` directly.

### 3.4 Suspension-notice UI
- Backend already blocks suspended tenants (`jwt-auth.guard.ts` → 403 "suspended for non-payment"); only a
  status pill exists. Add a client/admin **banner/interstitial** that catches that 403 and renders a
  clear "account suspended — pay to reactivate" message with a link to the outstanding invoice. Localize.

### 3.5 Remove leftover on-view refresh + confirm dup-invoice guard
- Confirm the dashboards no longer trigger provider refresh (docs say removed); drop the residual
  `GET /services/:id?refresh=1` hint in `apps/web/components/portal/client-dashboard.tsx:395` and any dead
  `refresh*` provider paths. Confirm/annotate the duplicate-renewal-invoice guard in
  `billing.service.ts runAdminMaintenance()` (already present: skips when `latest.dueAt >=
  subscription.nextInvoiceAt`) with a test.

### 3.6 Container healthchecks report unhealthy while serving
- All four `:edge` containers (`teculiar-{web,storefront,api}`, `dezhost-storefront`) show `(unhealthy)` in
  `docker ps` though the site serves fine (verified live in 0.1) — the `HEALTHCHECK` probe is wrong (likely
  the storefront probing `/`, which 307-redirects to `/de` per commit `e650fd6`; or the API probe hitting a
  tenant-resolved path). Diagnose: `docker inspect --format '{{json .State.Health}}' <id>`. Fix the
  `HEALTHCHECK`/compose probe to hit a 200 path (storefront: a locale path, or add `-L`; API:
  `/api/v1/health`) so `docker ps`/monitoring isn't permanently red. Pure ops — no app-code risk.

### Verify (Phase 3)
Local 2-DB proof (reuse the tenancy test harness): run cron with two tenants seeded, assert each tenant's
invoices/tickets/sitemap counts come only from its own DB (no bleed); suspend a tenant → dashboard shows
the banner; cron logfile shows a per-tenant summary; a due subscription doesn't double-invoice.

---

## Design Track — dashboard + Blue theme redesign (guided design sessions)

Added at the user's request: the admin + client dashboards look poor on desktop **and** mobile. These are
**led, interactive design sessions** using a Claude Code **frontend-design skill/plugin** (to be installed —
the user hasn't used it before), producing a cohesive, modern design system **in sync with the Blue theme**
before any code is written. Two sessions; each ships on its own branch and is verified visually + functionally.

> **Skill setup (do at the start of D1):** install the frontend-design skill/plugin, then confirm we're
> driving the design from it. Note the built-in `artifact-design` skill targets standalone Artifacts, **not**
> the running app, so it is *not* the one — the dashboard redesign needs an app-focused frontend-design
> skill installed via the Claude Code plugin/marketplace (or dropped into `.claude/skills/`). I'll confirm
> the exact skill name + install command when we open D1.

### D1 — Dashboard design session + redesign (admin + client; desktop + mobile)
*Recommended slot: after Phase 3, before Phase 4 — the dashboard **is** the Teculiar product you'll sell, so
it should look great before teculiar.com opens. Can move earlier if you'd rather fix the live look first.*
- **Session (led):** with the skill, establish a dashboard design system — spacing + type scale, color
  tokens derived from the Blue theme, component styles (tables/cards/forms/nav/sidebar/status pills/modals),
  responsive layout rules, empty/loading/error states — reviewing mockups together **before** coding.
- **Implement:** apply across `apps/web` admin (`components/admin/*`, `app/admin/*`) + client
  (`components/portal/*`, `app/client/*`), sharing primitives from `packages/web-core/src/components/ui`
  and `.../layout`. Fully responsive (desktop + mobile). **Coordinate with** Phase 5 (build the new
  `AdminTable` to this design, not twice) and Phase 2 (surface-aware chrome must match).
- **Verify:** Playwright screenshots at desktop + mobile viewports across the main admin/client pages;
  side-by-side review against the agreed mockups; no functional regressions; locale packs unaffected.

### D2 — Blue storefront theme redesign (modern + subtle animations)
*Recommended slot: after Phase 4 go-live — bigger and less blocking; also lands the Blue "styling
bundle / design-token" work deferred from Phase 2.*
- Redesign the Blue storefront styling (`packages/web-core/src/components/marketing/*`, `layout/*`,
  `globals.css`, the marketing CSS modules) to look more modern, with **small, tasteful animations**
  (hover / entrance / scroll), respecting `prefers-reduced-motion`.
- **Keep the Customizer in sync:** every restyled section/card/atom must stay faithful in the element
  registry (`packages/web-core/src/lib/customizer/registry/*`) so builder **preview == live**. New design
  tokens flow through the anticipated `Theme.styling` payload where possible.
- **Verify:** the Customizer Playwright suite (`tests/e2e/specs/customizer.spec.ts`) still passes
  (preview == live); published pages render the new look; motion is subtle + reduced-motion-safe.

---

## Phase 4 — Teculiar.com go-live (start selling Teculiar)

Goal: bring `teculiar.com` fully live as tenant #0 selling the Teculiar plan (safe — new site, can't
affect dezhost.com).

### 4.1 Teculiar-plan catalog seed
- Add a Teculiar-plan product (monthly recurring, `provisioningModule = "tecreator"`) — a seed/bootstrap
  step for the `teculiar` tenant (the `tecreator` module + provider already exist:
  `module-catalog.ts`, `apps/api/src/modules/external/tecreator-provider.service.ts`). Buying it runs the
  unchanged order→invoice→provision pipeline → `createTenant` → emails credentials.

### 4.2 Reusable pricing-table element
- The customizer registry has a `priceToken` atom but no `pricingTable`. Add a `pricingTable` element to
  `packages/web-core/src/lib/customizer/registry/` (theme-neutral, reuses marketing CSS + `Price`), so the
  Teculiar plans render as a proper pricing table authorable in the builder.

### 4.3 teculiar.com marketing content (Blue page authoring)
- Author teculiar.com's home + product/marketing pages in the Customizer (the deferred end-of-Phase-3
  content authoring) using the populated element registry + the new pricing-table. Publish per page.
  Locale packs for any new chrome.

### 4.4 Provision + verify
- Follow `docs/teculiar-operations.md` H.7/H.8 for `teculiar`: bootstrap tenant → enable Tecreator → seed
  plan → author pages → verify `teculiar.com` storefront + `/admin` + `/client` same-origin. Buying the
  plan provisions a fresh `userNNNN.teculiar.net` and emails creds.

### Verify (Phase 4)
Production Playwright against teculiar.com: browse marketing pages + pricing table; complete a Teculiar-plan
purchase in PayPal sandbox; confirm a new tenant DB + subdomain provisions and the credential email arrives
(and renders `€` correctly — depends on Phase 1.1).

---

## Phase 5 — Admin productivity (lists)

Goal: make the admin lists sortable, bulk-actionable, and inline-editable. No feature-rich table exists
today (plain `<table class="table">` in `admin-dashboard.tsx`/`admin-forms.tsx`; full arrays fetched, no
sort/filter params except Logs).

### 5.1 Shared sortable/selectable table component
- Build one `AdminTable` in `apps/web/components/admin/` (columns config, `aria-sort` headers, client-side
  sort to start; optional server `?sort=&dir=` later), reused by Clients/Services/Invoices/Orders/Products.

### 5.2 Multi-select + bulk actions
- Row checkboxes + "select all" + a bulk action bar. Bulk **delete** (where safe) and invoice bulk
  **mark paid/unpaid**. Add batch endpoints (or loop existing `mark-paid`/`mark-unpaid`/delete) with a
  single confirm. Respect roles (`admin|staff|super_admin`).

### 5.3 Inline status-tag dropdown
- Turn the read-only `StatusPill` into a clickable dropdown in lists for admin-changeable statuses
  (order status, invoice paid/unpaid, service status, ticket status). Reuse the existing mutation
  endpoints (`PATCH /orders/:id/status`, `/billing/invoices/:id/mark-paid|unpaid`,
  `/admin/dev/services/:id/status`) + optimistic update. Only offer valid transitions per enum
  (`packages/web-core/src/lib/status-labels.ts`).

### Verify (Phase 5)
Playwright: sort clients by a column; select several invoices → bulk mark paid; change an order's status
from its list-row tag → confirm persisted + email side-effects behave.

---

## Phase 6 — Catalog & commerce

### 6.1 Product addons
- Models exist (`AddOn`, `ProductAddOn`, `ServiceAddOn` in `prisma/schema.prisma`) but no admin CRUD and
  no checkout wiring. Build: admin CRUD for AddOns (name + **translation modal**, description, price,
  billing cycle) in `apps/web/components/admin/`; assign addons to products (`ProductAddOn`); render
  choosable addons in **storefront checkout** (`checkout-form.tsx`) and the **admin new-order form**; carry
  chosen addons onto the order/invoice/service (`ServiceAddOn`) so they bill + renew. Examples: "Monthly
  maintenance", "Nextcloud Server Setup".

### 6.2 Per-product modules (product-first)
- Flip `effectiveModule(product)` precedence in all four copies
  (`products.service.ts:451`, `orders.repository.ts:480`, `orders.service.ts:926`,
  `billing.service.ts:2751`) to **product-first**: `normalizeModule(product.provisioningModule) ??
  category.provisioningModule ?? type-default`. **Factor into one shared helper** to kill the duplication.
  Migration: backfill each product's `provisioningModule` from its category where null, so existing
  category-driven products keep their module. Admin product form: stop letting the category override the
  product's module (`admin-product-manager.tsx:284,326`); category becomes the default for new products.

### 6.3 PayPal sandbox test process (on production)
- Sandbox vs live = `PaymentProcessorConfig.config.mode` (`abstract-payment.service.ts`). Write a repeatable
  process doc: set the gateway to sandbox with test creds, run a scripted Playwright purchase (order →
  invoice → PayPal sandbox approve → capture → `payment_successful` email → provisioning), then flip back.
  **I'll need your PayPal sandbox client ID + secret (and a sandbox buyer login) to run it** — I'll ask when
  we reach this step.

### 6.4 Modular payment gateways
- Payments are hardcoded (PayPal + Mollie) in `apps/api/src/modules/billing/processors/abstract-payment.service.ts`.
  Refactor to mirror the provider module pattern (`apps/api/src/modules/module-registry/` +
  `provider.types.ts`): a `payment` module kind + catalog entries, a `PaymentProvider` interface, per-gateway
  services resolved by a registry, config in `SystemSetting`/`PaymentProcessorConfig`. Adding/removing a
  gateway becomes a catalog entry, not an edit to one 800-line file. Keep the existing DB configs working.

### Verify (Phase 6)
Playwright: order a product with an addon (storefront + admin) → addon bills + renews; set two products to
different modules and confirm each provisions via its own module; PayPal sandbox purchase; enable/disable a
gateway via the registry and confirm checkout reflects it.

---

## Phase 7 — i18n depth (everything the customer sees, translated)

### 7.1 Product title/description translation
- `Product.name`/`description` (and category names) are single-value. Add **per-locale fields** (JSON map
  like Theme `Page`, or side rows) with the shared translate modal + DeepSeek auto-translate
  (reuse `customizer.service.ts` translate path / `AiBlogService.callDeepseek`). Storefront + customizer
  `ProductCard`/`product-grid` render `localized(product.name, locale)`. Emails/invoices use the buyer's
  locale. Well-tested (this is customer-facing across catalog + checkout + emails).

### 7.2 Per-language email editor + per-customer dispatch
- Dispatch already resolves `recipientLocale` from `User.locale` and looks up `EmailTemplate` by
  `key_locale` — **the gap is the editor**: `apps/web/components/admin/email-admin-editor.tsx` has no locale
  selector and saves overrides on the main language only. Add a **language switcher** so admins author each
  event's content per configured language (`updateSettings` upserts `EmailTemplate` per locale). Confirm a
  customer with `locale = en` receives English emails end-to-end. (This is the Phase-1-deferred per-locale
  email editor.)

### 7.3 Sales vs support ticket routing
- Formalize the convention: admin-defined per department whether it's **open to non-clients** (sales) or
  **registered-clients-only** (support). Add a `Department` flag (`prisma/schema.prisma:797`) +
  admin toggle. Cron import (`tickets.service.ts importMailboxTickets`) routes by mailbox → department and
  **rejects** support mail from unknown senders (no ticket, optional bounce/notice) while sales auto-creates
  a guest contact. **Guest/sales replies must NOT include the client-portal link**: make `dispatchTicketEmail`
  (`tickets.service.ts:487`) omit `ticket_url` for guest recipients (they see the reply in their email
  instead of a portal button).

### 7.4 Admin main-currency guard
- The Phase-1-deferred guard: warn in admin when changing the main currency on a store with priced data
  (stored amounts are not re-converted). Small confirm dialog in the currency settings.

### Verify (Phase 7)
Set a client to `en`; place an order → order/invoice/activation emails arrive in English with correct
currency; edit the German + English body of one event and confirm both render; send sales mail from an
unknown address → ticket created, reply has no portal link; send support mail from an unknown address →
rejected; translate a product and confirm the storefront + checkout show the localized name.

---

## Phase 8 — Distribution, updates & SEO

### 8.0 Serve `install.sh` at `get.teculiar.com` (deferred from Phase 0.4)
Goal: `curl -fsSL https://get.teculiar.com/install.sh | bash` works. Simplest = a one-file static host.
The `dezhost-storefront` ghcr image is already public (0.4), so this is purely a convenience URL for the
script that pulls it. Two options — **A (Caddy edge, recommended, same box)** or **B (Virtualmin vhost)**.

**Option A — Caddy edge:**
1. **Docroot + script:** on eu01,
   `sudo mkdir -p /var/www/get && sudo cp /opt/teculiar/deploy/storefront-install/install.sh /var/www/get/install.sh`
   (copy from wherever the repo/`install.sh` lives on the box). Keep it world-readable: `sudo chmod 644 /var/www/get/install.sh`.
2. **Caddy site block** — add a **named** block to `deploy/caddy/Caddyfile`, *outside* the white-label
   `https://` catch-all (a named address is more specific than the catch-all, so it wins and no tenant
   lookup runs — no `register-domain.js` needed):
   ```
   get.teculiar.com {
       root * /var/www/get
       file_server
       # serve as a script so `curl | bash` streams it and browsers don't force a download:
       header Content-Type "text/x-shellscript; charset=utf-8"
   }
   ```
3. **DNS:** point `get.teculiar.com` A (+ AAAA if used) → the Caddy floating IP `195.201.252.12`. Caddy
   auto-issues the Let's Encrypt cert on first request.
4. **Reload + verify:**
   `caddy validate --config /etc/caddy/Caddyfile && caddy reload --config /etc/caddy/Caddyfile`
   (or restart the caddy container), then
   `curl -fsSL https://get.teculiar.com/install.sh | head` → the script's shebang + first lines.

**Option B — Virtualmin vhost:** create a `get.teculiar.com` virtual server, drop `install.sh` into its
`public_html`, let Let's Encrypt issue the cert. No Caddy/app wiring; DNS points at the primary IP.

**Then run the end-to-end wizard check (also deferred from 0.4):** run `install.sh` in a throwaway VM,
confirm it writes the compose + prints the Caddy vhost wiring and the storefront boots against
`TECULIAR_UPSTREAM=https://api.<domain>`. (Deeper wizard work is 8.2.)

### 8.1 release-sync (theme + locale bundle publisher) + tenant Updates panel
- Build the Phase-4.5 piece: generalize `scripts/i18n-sync.ts` into a `release-sync` command that publishes
  **versioned theme + locale bundles** to `teculiar.net/releases/...` with a manifest. Add a tenant admin
  **Updates** panel: auto-update on/off, "update available" one-click apply, and **one-step revert** to the
  previous version (control-plane already reserves `theme`/`locale` + `prev*` version fields). This is how
  self-hosting tenants get theme/locale updates. (API + dashboards stay hosted/single-version — updated by
  deploying new images; the Dezhost storefront updates by image pull.)

### 8.2 Installer wizard depth
- Extend `deploy/storefront-install/install.sh` + the admin domain wizard into a fuller **installation
  wizard**: for tenants who need their own DB, offer **automatic tenant DB creation** and, when that fails,
  a **manual path** (create the DB yourself, paste connection info). Provide a **simpler wizard** for
  customers who host everything on our server (subdomain-only, no DB step). Keep it MySQL/MariaDB-only.

### 8.3 XML sitemap format
- The sitemap is served **live** by `apps/storefront/app/sitemap.xml/route.ts` (not cron). Clean up the
  output to Google's liking: valid, de-duplicated `<url>` entries, sane `<priority>`/`<changefreq>`,
  correct `<lastmod>`, and add an **XSL stylesheet** so it renders nicely in a browser (the "looks awful"
  complaint). Fix the parallel `apps/web/app/sitemap.xml/route.ts` too.

### Verify (Phase 8)
`curl -fsSL https://get.teculiar.com/install.sh` → 200 with the script body (8.0, carried from Phase 0.4).
Publish a locale bundle bump via release-sync → a self-host tenant's Updates panel shows it → apply →
revert. Run `install.sh` against a fresh box with the DB-manual path. Validate `sitemap.xml` in Google
Search Console / a validator and view it in a browser.

---

## Phase 9 — Rebrand & platform breadth

### 9.1 Naming convention: "Teculiar" (the software) vs "Dezhost" (one tenant/website)  ✅ DONE (2026-07-13 — all four renames landed in one pass on `feat/teculiar-rebrand-9.1`: brand defaults → "Teculiar" (incl. `--dezhost`→`--teculiar` CSS var, locale packs, email `fromName`, invoice seller, PDF Creator); cookies `dezhost_*`→`teculiar_*` with dual-read (old names read + cleared, never written — drop the dual-read one release later); `@dezhost/*`→`@teculiar/*` (package.json names, imports, tsconfig, Dockerfiles, lockfile regenerated); ghcr images → `teculiar-{api,web,storefront}` in deploy.yml + compose + install.sh. Deliberate deviations: `DEFAULT_NAME_SERVERS` stays `ns5/ns6.dezhost.com` (real DNS infra, not brand); Mollie payment descriptions went brand-NEUTRAL ("Payment <id>") since they're customer-facing per-tenant; shared marketing "Why Dezhost" went neutral ("Why us"/"Warum wir") rather than "Why Teculiar" so no tenant storefront wears the wrong brand; built-in dezhost.com content pages (legal/über-uns/FAQ) keep "Dezhost" — tenant content, not software defaults. Transition: the storefront image is DUAL-PUBLISHED as `dezhost-storefront` (alias tags in deploy.yml) until the `Dezhost` repo compose on the box + old self-host installs are repointed at `teculiar-storefront` — then drop the alias. New ghcr packages `teculiar-*` may need one-time visibility fixes (make `teculiar-storefront` public for install.sh, like `dezhost-storefront` was).)

**The rule (single source of truth for all naming):** anything that is *the software/platform* is named
**`teculiar`**; anything that is *the specific Dezhost website* (a tenant that happens to be us) keeps
**`dezhost`**, and its identity lives in **tenant settings + DNS + its own deploy repo — never in platform
code**. The repo grew out of Dezhost, so today the software still wears the `dezhost` name in many places;
this phase fixes that **without** touching Dezhost-the-tenant's legitimate names.

| Thing | Today | Correct | Rename? |
|---|---|---|---|
| Monorepo repo | `Teculiar` | `Teculiar` | ✅ already correct |
| ghcr images | `dezhost-{api,web,storefront}` | `teculiar-{api,web,storefront}` | **rename** (software artifacts; the storefront image is the platform's Blue theme, used by *every* tenant incl. teculiar.com) |
| Package scope | `@dezhost/*` (381 refs) | `@teculiar/*` | **rename** (internal; big mechanical, self-contained) |
| Cookie names | `dezhost_*` | `teculiar_*` | **rename via dual-read** (accept old+new, write new) — a bare rename logs everyone out |
| Code brand defaults | `"Dezhost"` fallbacks (~162 literals) + default domains/emails (~34): `siteName`/`fromName`/`companyName`, meta-title suffix, no-reply addr, footer `brandLabel`, invoice-seller fallback, CSS `--dezhost` var | `"Teculiar"` | **rename** (defaults only; a tenant's real brand still comes from admin settings) |
| The dezhost.com website's brand | "Dezhost" (from settings) | "Dezhost" | ✅ stays — tenant setting, not code |
| Control-plane tenant | `dezhost` (subdomain/id) | `dezhost` | ✅ stays — names the tenant, not the software |
| Thin storefront deploy repo | `Dezhost` | `Dezhost` | ✅ stays — that tenant's own deploy glue (referencing the platform image) |
| Domain / DNS | `dezhost.com` | `dezhost.com` | ✅ stays |

**Implications (why this is deliberate, not a find-replace):**
- **ghcr image rename** touches `deploy.yml` (0.6), **both** compose files (`docker-compose.prod.yml` +
  the `Dezhost` repo's compose), and `deploy/storefront-install/install.sh`; the public `dezhost-storefront`
  package must be **re-published as `teculiar-storefront` + re-made-public**, and the box updated in lockstep
  (old image names stop being pulled). Any existing self-host `install.sh` breaks until it points at the new
  image. **Sequence it after 0.6** so the pipeline is already the thing being edited.
- **Cookie rename** without dual-read logs every admin/client out — implement accept-old-write-new, keep the
  old names readable for one release, then drop.
- **Brand-default rename** is low-risk (defaults only apply when a tenant has *not* set a brand; dezhost.com
  has, so it is unaffected) but must be verified by grep: no user-facing "Dezhost" fallback left in code, and
  a fresh tenant brands as "Teculiar" by default.
- **Scope rename** (`@dezhost/*`→`@teculiar/*`) is caught wholesale by `typecheck`/`next build`; do it in one
  pass across imports + `package.json` names + tsconfig paths + `transpilePackages` + the Dockerfiles.

Do this as **its own branch**, in the order: brand defaults → cookies (dual-read) → package scope → ghcr
images (+ compose/install.sh/box). None of it blocks the 0.6 deploy work — that repoints the *existing*
`dezhost-*` pipeline; the rename swaps the names later.

### 9.2 Headless API + SDK/widgets (old Phase 6)
- Expose the documented `/api/v1` + webhooks for people running their own sites, plus a hosted JS SDK +
  embeddable widgets (domain search, product cards, cart, checkout, login). Assessment stands: **no installed
  agent** — stateless SDK/widgets + webhooks. Scope a first cut (public read endpoints + a domain-search +
  product-grid widget) and grow.

### 9.3 Document DB support
- State MySQL/MariaDB-only for now (migrations are MariaDB-idempotent; `createTenant` DDL assumes MariaDB).
  Add a short `docs/` note + a startup guard that warns on an unsupported engine.

### Verify (Phase 9)
Grep shows no user-facing "Dezhost" fallback in code; a fresh tenant brands as "Teculiar" by default;
existing sessions survive the cookie change; a sample site embeds the product-grid widget + receives a
webhook.

---

## Deferred backlog (explicitly later)
- **Secrets-manager indirection** for per-tenant DB URLs / JWT secrets (`dbUserRef`/`jwtSecretRef`).
- **Load balancer + object storage** (uploads off the filesystem; shared SSO store for multi-instance).
- **Phase 5 custom themes** — Customizer Properties tab + `Theme.styling` payload; buyer builds/downloads a
  theme and self-runs it against the hosted API.

---

## Global testing rule (per `CLAUDE.md`)
Each big change: branch → local verify (`node --test`, `next build`, `i18n-sync --check`) → **production
Playwright Chromium** against the live host with `E2E_*` creds (note: post-cutover creds are the new
tenant's, not the old system's — update `.env` `E2E_ADMIN_*`/`E2E_CLIENT_*`). Update the relevant `docs/`
and locale packs with every change. Do **not** merge to `main` in a way that disrupts the live stack —
the go-live runs on `:edge` in `/opt/teculiar`; only merge/deploy deliberately.
