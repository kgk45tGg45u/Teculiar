# Project Agent Instructions

- Answer in Caveman 'ultra' skill': short, useful.
- Keep files small so reading and editing stays cheap.
- Write tests first, before implementation.
- Prefer focused tests that cover different code paths.
- Document temporary endpoints and integration notes clearly.
- Storefront payment flow is sacred: after successful payment, send client to dashboard fast; provision domains/hosting in background; mark services active only after module create succeeds.
- Paid invoices must display with final invoice number, not the unpaid N-XXXXXX number, in admin and client dashboards. After successful payment, the corresponding N- invoice should be deleted.
- Test domain registrations with the Resell.biz test API.