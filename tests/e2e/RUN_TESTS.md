# Run Playwright E2E Tests

## One-Time Setup

```bash
npm install
npx playwright install chromium
```

## Dev Server

Option A: start app yourself in another terminal:

```bash
npm run dev:full
```

Then run tests:

```bash
npm run e2e
```

Option B: let Playwright start web and API:

```bash
PLAYWRIGHT_START_SERVERS=1 npm run e2e
```

Public-only smoke tests can start only Next.js:

```bash
PLAYWRIGHT_START_SERVERS=web E2E_TAGS=smoke,storefront,auth,hosting npm run e2e
```

## Useful Commands

```bash
npm run e2e:headed
npm run e2e:ui
npm run e2e:report
E2E_TAGS=smoke npm run e2e
E2E_BASE_URL=http://127.0.0.1:3000 npm run e2e
```

## Auth Scenarios

Set creds to run login/dashboard/invoice/admin scenarios:

```bash
E2E_CLIENT_EMAIL=client@example.test E2E_CLIENT_PASSWORD='secret' npm run e2e
E2E_ADMIN_EMAIL=admin@example.test E2E_ADMIN_PASSWORD='secret' npm run e2e
```

Ticket creation mutates data, so it also needs:

```bash
E2E_RUN_MUTATING=1
```

## Outputs

- Markdown summary: `tests/e2e/results/latest-report.md`
- JSON results: `tests/e2e/results/results.json`
- HTML report: `tests/e2e/results/html`
- Failed screenshots/videos/traces: `tests/e2e/artifacts/test-output`

On failure, Playwright keeps screenshot, video, trace, and step timing attachment. Open HTML report for replay.
