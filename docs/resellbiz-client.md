# Resell.biz Domain Script

## Purpose

`npm --workspace @crimson/api run resellbiz` is a temporary admin script for Resell.biz domain work.

It is not wired into the website or API controllers yet.

## Credentials

OrderBox / LogicBoxes docs use a reseller ID plus API key:

```bash
RESELLBIZ_RESELLER_ID="1325587"
RESELLBIZ_API_KEY="..."
RESELLBIZ_API_BASE_URL="https://test.httpapi.com"
RESELLBIZ_TEST_CUSTOMER_ID="..."
RESELLBIZ_TEST_CONTACT_ID="..."
RESELLBIZ_DEFAULT_NS="ns1.example.com,ns2.example.com"
```

The reseller email is a control-panel login field, not used by the documented domain HTTP API calls.

For short manual testing only, the script also accepts `RESELLBIZ_PASSWORD` if no `RESELLBIZ_API_KEY` is set. If Resell.biz rejects that, generate/use the API key from the Reseller Control Panel.

Do not expose `domsecret` / auth-code values to normal customer UI without strong auth, audit logs, and rate limits.

## Commands

Check status, expiry, nameservers, and auth code:

```bash
npm --workspace @crimson/api run resellbiz -- status example.com
```

Check which `.env` file and non-secret settings the script sees:

```bash
npm --workspace @crimson/api run resellbiz -- env-check
```

Show only the transfer code / domain secret:

```bash
npm --workspace @crimson/api run resellbiz -- auth-code example.com
npm --workspace @crimson/api run resellbiz -- auth-code 123456789
```

Change nameservers:

```bash
npm --workspace @crimson/api run resellbiz -- change-ns example.com ns1.host.test ns2.host.test
```

Check if transfer can be requested:

```bash
npm --workspace @crimson/api run resellbiz -- validate-transfer example.com
```

Start a transfer:

```bash
npm --workspace @crimson/api run resellbiz -- transfer example.com \
  --customer-id 1000 \
  --reg-contact-id 2000 \
  --admin-contact-id 2001 \
  --tech-contact-id 2002 \
  --billing-contact-id 2003 \
  --invoice-option KeepInvoice \
  --auto-renew false \
  --auth-code transfer-secret \
  --ns ns1.host.test \
  --ns ns2.host.test
```

Extra transfer attributes can be repeated:

```bash
--attr tnc=y --attr registrant-org-consent=true
```

## API Mapping

- `GET /api/domains/orderid.json` resolves a domain to an OrderBox order ID.
- `GET /api/domains/details.json` returns status, expiry (`endtime`), nameservers, and `domsecret`.
- `POST /api/domains/modify-ns.json` changes nameservers.
- `GET /api/domains/validate-transfer.json` checks transfer validity.
- `POST /api/domains/transfer.json` starts transfer.

Docs checked:

- https://demo.myorderbox.com/kb/answer/753
- https://apptrum.myorderbox.com/kb/answer/763
- https://apptrum.myorderbox.com/kb/answer/770
- https://milestone.myorderbox.com/kb/answer/776
- https://apptrum.myorderbox.com/kb/answer/1150
- https://freeaccount.myorderbox.com/kb/answer/758

## Later Admin Panel Notes

- Checkout domain registration and transfer use the LogicBoxes/Resell.biz test host by default when `RESELLBIZ_API_BASE_URL` is not set.
- Domain checkout sends `invoice-option=NoInvoice`; Dezhost invoice/payment state is kept in the local billing tables.
- `customer-id` and contact IDs are real LogicBoxes/Resell.biz API fields. The test env names below only mean this repo currently uses pre-created test customer/contact records until customer/contact creation is wired.
- `RESELLBIZ_TEST_CUSTOMER_ID` and `RESELLBIZ_TEST_CONTACT_ID` are required for test registration/transfer. Specific contact overrides are also supported:
  `RESELLBIZ_TEST_REG_CONTACT_ID`, `RESELLBIZ_TEST_ADMIN_CONTACT_ID`, `RESELLBIZ_TEST_TECH_CONTACT_ID`, `RESELLBIZ_TEST_BILLING_CONTACT_ID`.
- For production, checkout provisioning now creates/finds the Resell.biz customer, creates a matching `Contact`, then passes those real IDs to domain registration or transfer.
- Domain pricing sync uses `GET /api/products/customer-price.json` and stores register, transfer, and renew prices per TLD/year in `DomainTldPrice`.
- `.de` is treated as manual pricing. Sync skips `.de` rows, so the admin-entered `.de` prices are not overwritten.
- Suggested TLDs are controlled with the `suggested` flag in `/admin/domain-prices`.
- `.com` pricing comes from the LogicBoxes `domcno` product key.
- Public availability search uses RDAP via the IANA bootstrap list, with a direct DENIC RDAP fallback for `.de`. RDAP is the open WHOIS replacement; ICANN notes it became the definitive gTLD registration data source on 2025-01-28.

## Temporary App Endpoints

- `GET /api/v1/domains/search?domain=example.com` - RDAP availability plus annual register/transfer price.
- `GET /api/v1/orders/admin/domain-prices` - stored TLD pricing rows and last update date.
- `POST /api/v1/orders/admin/domain-prices` - add/update a manual price and suggested TLD flag.
- `POST /api/v1/orders/admin/domain-prices/sync` - fetch Resell.biz customer pricing and replace stored TLD prices.
- `POST /api/v1/orders/checkout` - domain item `configuration.domainAction` may be `register` or `transfer`; transfer also needs `configuration.transferAuthCode`.
- Store credentials in a secret manager.
- Require an admin role for all mutating actions.
- Add audit logs for `transfer`, `change-ns`, and auth-code views.
- Never send reseller credentials to the browser.
- Consider OTP support for nameserver and auth-code changes if Resell.biz enables 2FA for the account.
