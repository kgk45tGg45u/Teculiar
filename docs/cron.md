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
- Mailbox imports: every configured minutes.
- Invoice generation, due-date auto-pay, overdue marking, and hosting suspension: every cron run, idempotent.
- Invoice reminders: once per day for invoices due configured days ahead.
- Answered ticket auto-close: every cron run, idempotent.

Admin/client dashboards now read DB state only. They do not trigger provider refresh or maintenance.
