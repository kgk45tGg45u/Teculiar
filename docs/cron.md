# Dezhost Cron

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

## Server Cron

Open crontab:

```sh
crontab -e
```

Add:

```cron
*/5 * * * * curl -fsS -H "x-cron-secret: YOUR_CRON_SECRET" https://YOUR_API_HOST/api/v1/cron >/dev/null 2>&1
```

## Secret

Set secret in one place:

- Admin -> Settings -> Cron secret
- or `CRON_SECRET` env var on API server

`CRON_SECRET` env var wins if both exist.

## What Runs

Cron runs every 5 minutes, but each timed job runs only when due:

- Domain prices: every configured hours.
- Domain expirations: every configured hours.
- Domain statuses: every configured minutes.
- Hosting statuses: every configured minutes.
- Mailbox imports: every configured minutes. Every fetched email is logged (with subject and matched client) and turned into a ticket; mail from an unknown sender creates a guest contact so nothing is lost. IMAP connection/login errors are recorded instead of being swallowed.
- Invoice generation, due-date auto-pay, overdue marking, and hosting suspension: every cron run, idempotent.
- Invoice reminders: once per day for invoices due configured days ahead.
- Answered ticket auto-close: every cron run, idempotent.
- Sitemap generation: once per day.
- AI blog post: every configured hours, when AI blogging is enabled and a Deepseek key is set.

Admin/client dashboards now read DB state only. They do not trigger provider refresh or maintenance.

## Logging & verification

Every trigger is auditable in **Admin > Settings > Logs** (subject `cron`):

- `cron.started` — a heartbeat written on every trigger, even when all timed jobs are still within their interval (proves the server reached the endpoint).
- `cron.<job>` — one entry per job that ran, with `startedAt`, `finishedAt`, `durationMs`, the job result, and `status` (`ran`/`failed`).
- `cron.completed` — a per-run summary with `durationMs`, `ranCount`, `failedCount`, `skippedCount`, and per-job results.
- `cron.unauthorized` — recorded when a request hits the endpoint with a missing/invalid secret (a common reason cron "silently does nothing").
