# The `agent` role — read-only, PII-masked admin access for AI testing agents

## Why this exists

Automated testing agents (Claude and similar) need to drive the admin dashboard on production
without seeing real customer data or being able to take real customer-facing actions. The `agent`
role gives them full **visibility** of every admin page — so UI structure, styling, and flows can
be tested — while masking customer PII on every response and hard-blocking every customer-linked
write server-side.

**If you are a testing agent reading this: masked values and 403s are the system working as
designed, not bugs.** Do not file findings about them, and do not try to work around them.

## What a testing agent will observe (all expected)

- Customer emails render as `j***@example.com`, names as `J*** D***`, phones as `***67`,
  VAT IDs as `DE***89`, street/city/postal-code as `***` (country stays visible).
- Domain transfer secrets (`eppCode`, `authCodeHash`) and any key matching
  password/secret/apiKey/token render as `***`.
- Invoice HTML/PDF documents render with the same masked customer data.
- Log metadata, email payloads, and order/service configuration blobs are deep-masked by key
  name — over-masking is deliberate (an occasionally masked product name in a log is harmless).
- Any `POST`/`PATCH`/`PUT`/`DELETE` under a customer-linked route returns
  **403 "The agent role is read-only for customer-linked resources"**.
- The admin sidebar shows a "Read-only agent view — customer data is masked" badge.
- The Settings section is absent from the nav (super_admin only, same as support/sales agents).

## Access matrix

| Area | Read | Write |
|---|---|---|
| Clients, orders, invoices (incl. HTML/PDF), services, tickets, logs, email settings/logs | ✓ masked | ✗ 403 |
| CMS/blog, products catalog, knowledgebase, redirects (list), theme (view), departments (list), announcements | ✓ | ✓ (unchanged staff-level rules) |
| Hosting control panel (auto-login into customer hosting) | ✗ 403 | ✗ 403 |
| Real email sends (test/send-event/send-custom), cron sweep trigger, provisioning/refresh | — | ✗ 403 |
| Settings pages, admin-account management, payment-gateway/SEO/tenant-domain config | ✗ (super_admin only) | ✗ |

## How it is enforced (server-side, not UI)

Three layers in `apps/api`:

1. **`AgentWriteBlockGuard`** (`src/common/guards/agent-write-block.guard.ts`), registered as a
   global `APP_GUARD` in `src/app.module.ts`. Decodes the bearer token itself and 403s any
   non-GET request from a token carrying the `agent` role under the customer-linked path
   prefixes (`/users`, `/orders`, `/billing`, `/tickets`, `/services`, `/cron`,
   `/admin/dev/{billing,services,module-logs,tickets,admins,emails}`). This is a structural
   invariant: even a future `@Roles(...)` mistake cannot give the agent a customer-linked write.
2. **`@Roles(...)` allow-lists** on controllers grant `agent` explicitly — GET-only in the
   PII-bearing modules, class-level where safe. The self-service ownership checks
   (`orders.service.getOrder`, `billing.service.getInvoice`, `products.service.getService`,
   tickets' `FULL_ACCESS_ROLES`) treat `agent` like staff **for viewing only**.
3. **Masking** (`src/common/pii-mask.ts`): `shouldMask(roles)` is true only when `agent` is the
   sole role. Targeted maskers (`maskUserRef`, `maskClient`, `maskOrder`, `maskInvoice`,
   `maskService`) handle structured records; `deepMaskPii` recursively masks freeform JSON blobs
   (snapshots, configurations, log metadata, email payloads) by key name. Detail-endpoint masking
   lives in the service layer so invoice HTML/PDF renders inherit it.

Every masked read is recorded in `AuditLog` as `action: "agent.read"`
(`src/common/agent-audit.service.ts`) — the trail of what the agent looked at.

Known gap: free-text bodies (ticket replies, notes) are not scanned — only structured fields and
key-matched JSON values are masked.

## Provisioning an agent account

Admin > Settings > Admins ("Agent (Read-Only)" in the role dropdown), or via API:
`POST /admin/dev/admins` with `roleSlug: "agent"` (super_admin token required). Accounts live in
the STAFF scope and log in on `/admin/login`. Masking applies only when `agent` is the account's
**only** role — a human who also holds a full-trust role sees the normal dashboard.

## E2E testing

Credentials come from `.env` (`E2E_AGENT_EMAIL` / `E2E_AGENT_PASSWORD`); the spec is
`tests/e2e/specs/agent-scope-pii-masking.spec.ts`. Per `CLAUDE.md`, testing agents should default
to the Agent credential for routine admin-dashboard checks and use the full Admin credential only
when a test genuinely needs real PII or a customer-record write.

Guard/masking regression tests: `apps/api/test/agent-write-block-guard.test.mjs`,
`apps/api/test/agent-role-write-safety.test.mjs`, `apps/api/test/pii-mask.test.mjs`.
