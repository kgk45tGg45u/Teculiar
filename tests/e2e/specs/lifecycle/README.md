# Customer-Lifecycle E2E Suite

Comprehensive Playwright suite validating the full customer lifecycle on the live
site. Built from reusable factories → flows → fixtures (see `tests/e2e/`).

```bash
npm run e2e:lifecycle            # run everything (prod)
npm run e2e:lifecycle:report     # open HTML report
```

Full docs:
- Architecture & execution → [`docs/E2E-FRAMEWORK.md`](../../../../docs/E2E-FRAMEWORK.md)
- Test matrix → [`docs/E2E-TEST-MATRIX.md`](../../../../docs/E2E-TEST-MATRIX.md)
- Discovered workflows → [`docs/E2E-WORKFLOWS.md`](../../../../docs/E2E-WORKFLOWS.md)

Credentials come from `.env` (`E2E_*`, `VIRTUALMIN_ADMIN_*`). Successful hosting
orders create real Virtualmin accounts that are **deleted automatically** after each
test (per-test fixture + global sweep). Set `E2E_TEARDOWN_HOSTING=0` to keep them.
