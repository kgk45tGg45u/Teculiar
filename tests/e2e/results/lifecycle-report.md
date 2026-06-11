# Playwright E2E Report

Generated: 2026-06-11T17:15:37.918Z
Status: passed
Duration: 247837 ms

## Summary

| Status | Count |
| --- | ---: |
| passed | 29 |
| failed | 0 |
| timedOut | 0 |
| skipped | 0 |
| interrupted | 0 |

## Tests

| Test | Status | Duration |
| --- | --- | ---: |
| chromium >02-vps-orders.spec.ts >Category 1 — VPS orders >VPS only, new customer → invoice PAID, VPS service present | passed | 1435 ms |
| chromium >02-vps-orders.spec.ts >Category 1 — VPS orders >VPS only, existing customer → service appears in dashboard | passed | 2111 ms |
| chromium >02-vps-orders.spec.ts >Category 1 — VPS orders >VPS + register domain, existing customer → both items ordered | passed | 2109 ms |
| chromium >02-vps-orders.spec.ts >Category 1 — VPS orders >VPS + transfer domain, existing customer → both items ordered | passed | 1634 ms |
| chromium >04-domain-only.spec.ts >Category 3 — Domain-only orders >register domain (new customer): order + invoice PAID, domain visible with a valid status | passed | 1868 ms |
| chromium >03-existing-customer.spec.ts >Category 2 — Existing customer orders >existing client buys VPS → service appears in dashboard list | passed | 1888 ms |
| chromium >04-domain-only.spec.ts >Category 3 — Domain-only orders >duplicate domain registration is rejected system-wide | passed | 221 ms |
| chromium >04-domain-only.spec.ts >Category 3 — Domain-only orders >transfer domain (existing customer): order + invoice PAID, domain record present | passed | 2234 ms |
| chromium >07-wallet-and-automation.spec.ts >Category 6 — Wallet / Add Funds >adding funds credits the wallet and creates a PAID deposit invoice (ledger entry) | passed | 604 ms |
| chromium >07-wallet-and-automation.spec.ts >Category 6 — Wallet / Add Funds >wallet balance is reflected by the profile endpoint after a deposit | passed | 147 ms |
| chromium >07-wallet-and-automation.spec.ts >Category 6 — Wallet / Add Funds >multiple deposits accumulate in the wallet | passed | 236 ms |
| chromium >07-wallet-and-automation.spec.ts >Category 7 — Invoice Automation (cron pays from wallet) >cron auto-pays a due invoice from wallet balance: invoice PAID, balance reduced, transaction recorded | passed | 1045 ms |
| chromium >07-wallet-and-automation.spec.ts >Category 7 — Invoice Automation (cron pays from wallet) >cron reports the automatic payment attempt in billingMaintenance result | passed | 322 ms |
| chromium >08-cron-validation.spec.ts >Category 8 — Cron validation >cron executes successfully and returns valid ran/skipped arrays | passed | 74 ms |
| chromium >08-cron-validation.spec.ts >Category 8 — Cron validation >every expected job appears in ran or skipped | passed | 74 ms |
| chromium >08-cron-validation.spec.ts >Category 8 — Cron validation >no cron job reports a failed status | passed | 80 ms |
| chromium >08-cron-validation.spec.ts >Category 8 — Cron validation >billingMaintenance and ticketsClose always run (not throttled) | passed | 134 ms |
| chromium >08-cron-validation.spec.ts >Category 8 — Cron validation >billingMaintenance result exposes the automation summary keys | passed | 95 ms |
| chromium >08-cron-validation.spec.ts >Category 8 — Cron validation >public cron endpoint rejects a missing/invalid secret | passed | 121 ms |
| chromium >09-checkout-ui.spec.ts >UI checkout — storefront rendering >hosting order page renders the checkout form and real payment gateways | passed | 3245 ms |
| chromium >09-checkout-ui.spec.ts >UI checkout — storefront rendering >order pages load without server errors for hosting, VPS and domain products | passed | 4670 ms |
| chromium >10-payment-gateways.spec.ts >Payment gateways — discovery >storefront exposes the configured live gateways | passed | 110 ms |
| chromium >10-payment-gateways.spec.ts >Payment gateways — discovery >admin gateway settings list every method with an enabled flag | passed | 69 ms |
| chromium >10-payment-gateways.spec.ts >Payment gateways — per gateway >SANDBOX → invoice PAID | passed | 578 ms |
| chromium >10-payment-gateways.spec.ts >Payment gateways — per gateway >CREDIT_CARD (Mollie) → invoice PENDING with a hosted-checkout redirect | passed | 808 ms |
| chromium >10-payment-gateways.spec.ts >Payment gateways — per gateway >PAYPAL → invoice PENDING with a PayPal approval redirect | passed | 1761 ms |
| chromium >10-payment-gateways.spec.ts >Payment gateways — per gateway >SEPA (Mollie direct debit) → payment initiated with a transaction | passed | 1005 ms |
| chromium >10-payment-gateways.spec.ts >Payment gateways — per gateway >BANK_TRANSFER → invoice stays PENDING with a manual transaction | passed | 595 ms |
| chromium >05-service-provisioning.spec.ts >Category 4 — Service provisioning >VPS does not auto-activate (Hetzner module is a stub) — stays PROVISIONING | passed | 240401 ms |

## Failures

None.
