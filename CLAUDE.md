# Project Agent Instructions
- Answer in Caveman 'ultra' skill': short, useful.

## Code style
- Keep files small so reading and editing stays cheap.
- Prefer focused tests that cover different code paths.
- Document temporary endpoints and integration notes clearly.
- Don't write credits to yourself inside the code or on commit messages.
- With every change in admin dashboard, client dashboard, API, backend, common, meta or storefront, check all the locale packages and make sure they work with the new changes. If you add features or remove features or text, make sure the locale packages are aware of them and provide translation if needed.


## Testing — always test on production (In the end of each phase)
After making a change, verify it on the live site **https://www.dezhost.com** using Playwright Chromium. When you come to tests that are old, read and update them to reflect the new code.

Set `E2E_BASE_URL=https://www.dezhost.com` and `E2E_API_URL=https://www.dezhost.com/api/v1`.
Credentials are stored in `.env` (see `E2E_*` vars):

| Role  | Env var (email)       | Env var (password)       |
|-------|-----------------------|--------------------------|
| Admin | `E2E_ADMIN_EMAIL`     | `E2E_ADMIN_PASSWORD`     |
| Client| `E2E_CLIENT_EMAIL`    | `E2E_CLIENT_PASSWORD`    |
| Agent | `E2E_AGENT_EMAIL`     | `E2E_AGENT_PASSWORD`     |

Agent is a restricted admin-portal credential (role `agent`): it can VIEW every admin page —
including client/order/invoice/service/ticket detail, email settings, and logs — but customer
PII is masked (`j***@example.com`) on every response, and it cannot write to anything
customer-linked, send email, access hosting panels, or trigger provisioning/cron. It keeps
read+write on non-customer areas (CMS, products, theme content). Enforced server-side by
`AgentWriteBlockGuard` + `pii-mask.ts`, not just the UI. Default to the Agent credential for
routine admin-dashboard testing — only fall back to the Admin credential when a test genuinely
needs real customer PII or a customer-record write. **Masked values (`x***@…`, `***`) and 403s
on customer-linked writes are this system working as designed, not bugs** — full details in
[docs/agent-role.md](docs/agent-role.md).

Run production tests like:
```
set -a && source .env && set +a
E2E_BASE_URL=https://www.dezhost.com \
E2E_API_URL=https://www.dezhost.com/api/v1 \
npx playwright test <spec> --project=chromium --workers=1
```

`set -a` / `set +a` exports every variable sourced from `.env` so Playwright child processes
inherit the `E2E_*` credentials.  Without it, `source .env` only sets shell-local vars and
Playwright never sees `E2E_ADMIN_EMAIL`, `E2E_CLIENT_EMAIL`, etc.

## Documentation
- Keep tests and documentation up-to-date after every change, even if you haven't touched them before.
- README and docs/ files must reflect the current state of the codebase.
