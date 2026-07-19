# PayPal sandbox test process (on production)

Repeatable procedure to prove the full purchase pipeline on the LIVE site — order → invoice →
PayPal approval → capture → `payment_successful` email → provisioning — using PayPal's sandbox so
no real money moves. Sandbox vs live is only `PaymentProcessorConfig.config.mode` on the PAYPAL
gateway row (`paypal-provider.service.ts` derives the API host from it), so the switch is an
admin-panel toggle, not a deploy.

## Prerequisites

- PayPal **sandbox REST credentials** (client ID + secret) from a developer.paypal.com app, and a
  **sandbox buyer login** (personal sandbox account email + password). Store them in `.env` as:

  ```bash
  # PayPal sandbox — used only for the scripted prod purchase test (docs/paypal-sandbox-testing.md)
  PAYPAL_SANDBOX_CLIENT_ID=...
  PAYPAL_SANDBOX_SECRET='...'
  PAYPAL_SANDBOX_BUYER_EMAIL=...
  PAYPAL_SANDBOX_BUYER_PASSWORD='...'
  ```

- A **full-admin** login for the target site (the gateway form is `@Roles("admin","super_admin")`
  — the agent credential cannot write payment gateways).
- A throwaway client account for the purchase (or the `E2E_CLIENT_*` account).

## Procedure

1. **Snapshot the live config.** Admin → Settings → Payment Gateways → PayPal: note the current
   client ID and mode (the secret is never echoed back; have the live secret at hand before
   starting so you can restore it).
2. **Switch to sandbox.** Set client ID + secret to the `PAYPAL_SANDBOX_*` values and
   `mode = test` (anything but `live` targets `api-m.sandbox.paypal.com`). Save — the built-in
   validation must report "PayPal connection verified.".
3. **Run the scripted purchase** (Playwright, storefront checkout):
   - order a cheap non-domain product, choose PayPal, submit checkout;
   - the redirect lands on `sandbox.paypal.com` — log in with the sandbox buyer and approve;
   - the return URL confirms the payment (capture), the invoice flips to PAID, the order is
     created and provisioning starts.
4. **Verify the side effects:**
   - invoice status PAID + a `PAYPAL` transaction with the sandbox capture ID;
   - `payment_successful` email in Admin → Emails → Log (to the buyer's address);
   - the service reaches ACTIVE/PROVISIONING per its product's module (or stays pending for
     manual products);
   - order status PROVISIONING/COMPLETE.
5. **Flip back to live.** Restore the live client ID + secret and `mode = live`, save, and
   confirm validation passes. Re-check the storefront checkout still lists PayPal.
6. **Clean up.** Cancel/terminate the test service, mark the test invoice/order as test data per
   ops habits, and (optionally) refund the sandbox capture in the sandbox dashboard — sandbox
   money is fake either way.

## Notes

- The **registry kill switch** (Admin → Modules → PayPal Payments) hides PayPal from checkout
  entirely while off — it is NOT part of this procedure; leave the module active and switch only
  the gateway `mode`.
- If checkout shows the PayPal JS popup instead of a redirect, the flow still targets sandbox —
  the SDK is loaded with the sandbox client ID that the storefront receives from
  `/storefront/payment-gateways`.
- Never leave a production site on sandbox mode: as long as `mode = test`, real customers "pay"
  with fake money. Steps 2–5 should complete in one sitting.
