# Teculiar Cron

Run the API cron endpoint every 5 minutes. The endpoint is public and does not use admin/client JWT auth, but it requires a shared cron secret.

## Endpoint

`GET https://YOUR_API_HOST/api/v1/cron`

Recommended auth:

```sh
curl -fsS -H "x-cron-secret: YOUR_CRON_SECRET" https://YOUR_API_HOST/api/v1/cron
```

Bearer also works:

```sh
curl -fsS -H "Authorization: Bearer YOUR_CRON_SECRET" https://YOUR_API_HOST/api/v1/cron
```

`?token=YOUR_CRON_SECRET` works too, but headers are better because URLs often appear in logs.

> **Use the canonical (www) host.** If your site redirects the bare domain to `www` (e.g. `dezhost.com` → `www.dezhost.com`), point the cron at the **www** host. A 301/302 redirect is not followed by a plain `curl`, so the request is dropped and the cron silently does nothing. Either use `https://www.dezhost.com/api/v1/cron` directly, or add `-L` to follow redirects.

The endpoint returns a **compact JSON summary** (Phase 3.2) so plain `curl` output — and the logfile
below — stays readable:

```json
{ "ok": true, "tenants": 2, "ran": 5, "failed": 0, "skipped": 13,
  "perTenant": [ { "tenant": "dezhost", "ok": true, "ran": 3, "failed": 0, "skipped": 6 },
                 { "tenant": "acmehost", "ok": true, "ran": 2, "failed": 0, "skipped": 7 } ] }
```

Failed jobs are listed per tenant (`failedJobs: ["mailboxes"]`); the full per-job results stay in
each tenant's **Admin → Settings → Logs**. (The admin dashboard's *Run cron now* button —
`POST /api/v1/cron/admin/run` — still returns the detailed per-job arrays it renders.)

## Multi-tenant (Phase 3.1)

Which tenants run depends on how the trigger arrives:

- **Fleet trigger (recommended for the platform operator):** hit the API **without a tenant host**
  — e.g. `http://127.0.0.1:4000/api/v1/cron` from the API box's own crontab. The run iterates
  **every ACTIVE control-plane tenant** and executes each tenant's jobs inside that tenant's
  context: its own database, its own due-clocks, its own logs, its own white-label email links.
  Suspended tenants are skipped. Only the **`CRON_SECRET` env var** authorizes a fleet trigger
  (there is no single tenant DB to read an admin-configured secret from).
- **Tenant-host trigger:** hitting `https://<tenant-host>/api/v1/cron` runs **only that tenant**
  (env secret *or* that tenant's admin-configured secret authorizes). No cross-tenant reads, ever.
- **Single-tenant fallback** (no control-plane configured): exactly the old behaviour.

## Server Cron

Open crontab on the API box:

```sh
crontab -e
```

Add (one line — appends every run's timestamp, HTTP status and JSON summary to a logfile so the
operator can see success/failure **without the dashboard**, per Phase 3.2):

```cron
*/5 * * * * curl -sS -m 240 -w " http=\%{http_code}" -H "x-cron-secret: YOUR_CRON_SECRET" http://127.0.0.1:4000/api/v1/cron 2>&1 | sed "s/^/$(date -u +\%FT\%TZ) /" >> /var/log/teculiar-cron.log
```

(`%` must be escaped as `\%` inside crontab. Single-tenant deploys keep pointing at
`https://YOUR_API_HOST/api/v1/cron` instead of `127.0.0.1`.)

**Did cron run in the last N minutes?** One line:

```sh
tail -n 1 /var/log/teculiar-cron.log   # last line: timestamp + JSON summary + http=200
find /var/log/teculiar-cron.log -mmin -6 | grep -q . && echo OK || echo "cron stale"
```

Add basic rotation so the logfile never grows unbounded (`/etc/logrotate.d/teculiar-cron`):

```
/var/log/teculiar-cron.log { weekly rotate 8 compress missingok notifempty }
```

## Secret

Set secret in one place:

- Admin -> Settings -> Cron secret
- or `CRON_SECRET` env var on API server

**Either secret is accepted** for a tenant-host or single-tenant trigger. A request authorizes if
its token matches the admin-set Cron secret *or* the `CRON_SECRET` env var. (Previously the env var
silently overrode the admin-set value, so a token set in the admin UI appeared "not to work"
whenever `CRON_SECRET` was also configured.) A multi-tenant **fleet** trigger accepts the env
secret only — see above.

## What Runs

Cron runs every 5 minutes, but each timed job runs only when due:

- Domain prices: every configured hours.
- Domain expirations: every configured hours. **Only runs when a domain registrar module is active**, and only for domains registered through an active registrar — manual (admin-registered) domains are skipped. See [modules.md](modules.md).
- Domain statuses: every configured minutes. Same registrar gating as domain expirations.
- Hosting statuses: every configured minutes.
- Mailbox imports: every configured minutes. Every fetched email is logged (with subject and matched client) and turned into a ticket; mail from an unknown sender creates a guest contact so nothing is lost. IMAP connection/login errors are recorded instead of being swallowed.
- Invoice generation, due-date auto-pay, overdue marking, and hosting suspension: every cron run, idempotent.
- Invoice reminders: once per day for invoices due configured days ahead.
- Answered ticket auto-close: every cron run, idempotent.
- Sitemap report: once per day. `/sitemap.xml` is served **live** by the website from the **Site URL** in Settings and the current published posts (see `apps/web/app/sitemap.xml/route.ts`), so this job only records the current URL counts to the log — it does **not** write a file.
- AI blog post: every configured hours, when AI blogging is enabled and a Deepseek key is set. Each run generates posts up to the configured **articles per day** (catch-up); skip reasons (disabled, no key, empty topics, target reached) are recorded in the log.

Admin/client dashboards now read DB state only. They do not trigger provider refresh or maintenance.

## Logging & verification

Every trigger is auditable in **Admin > Settings > Logs** (subject `cron`):

- `cron.started` — a heartbeat written on every trigger, even when all timed jobs are still within their interval (proves the server reached the endpoint).
- `cron.<job>` — one entry per job that ran, with `startedAt`, `finishedAt`, `durationMs`, the job result, and `status` (`ran`/`failed`). Results carry detail used by the admin view: invoices generated/auto-paid (with numbers), reminders sent, tickets closed, emails imported **by department**, hosting **status changes** (`domain from→to`), sitemap URL counts, and AI articles created (or the skip reason).
- `cron.completed` — a per-run summary with `durationMs`, `ranCount`, `failedCount`, `skippedCount`, and per-job results.
- `cron.unauthorized` — recorded when a request hits the endpoint with a missing/invalid secret (a common reason cron "silently does nothing").

**Admin → Settings → Cron** renders these rows as a readable "Recent Cron Activity" table (one line per job with a status pill and a plain-language summary), in addition to the raw entries under **Settings → Logs**.
