# Project Agent Instructions

## Code style
- Keep files small so reading and editing stays cheap.
- Prefer focused tests that cover different code paths.
- Document temporary endpoints and integration notes clearly.


## Testing — always test on production
After making a change, verify it on the live site **https://www.dezhost.com** using Playwright Chromium.

Set `E2E_BASE_URL=https://www.dezhost.com` and `E2E_API_URL=https://www.dezhost.com/api/v1`.
Credentials are stored in `.env` (see `E2E_*` vars):

| Role  | Env var (email)       | Env var (password)       |
|-------|-----------------------|--------------------------|
| Admin | `E2E_ADMIN_EMAIL`     | `E2E_ADMIN_PASSWORD`     |
| Client| `E2E_CLIENT_EMAIL`    | `E2E_CLIENT_PASSWORD`    |

Run production tests like:
```
E2E_BASE_URL=https://www.dezhost.com \
E2E_API_URL=https://www.dezhost.com/api/v1 \
npx playwright test <spec> --project=chromium
```

## Documentation
- Keep tests and documentation up-to-date after every change.
- README and docs/ files must reflect the current state of the codebase.
