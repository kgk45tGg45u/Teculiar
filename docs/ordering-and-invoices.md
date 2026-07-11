# Ordering and Invoice Logic

## Overview

The platform separates **ordering** (placing a purchase request) from **invoicing** (billing a customer). An order drives provisioning; an invoice drives payment. They are linked one-to-one for storefront checkouts, but invoices can also exist independently.

---

## Orders

### What is an Order?

An `Order` represents a customer's intent to purchase one or more products or domains. It is created at checkout and progresses through a lifecycle until all items are either provisioned or failed.

### Order Lifecycle

```
PENDING → PROVISIONING → COMPLETE
                       ↘ FAILED
     ↘ CANCELLED
```

| Status | Meaning |
|--------|---------|
| `PENDING` | Order created, awaiting invoice payment |
| `PROVISIONING` | Invoice paid; one or more items are being provisioned asynchronously |
| `COMPLETE` | All items provisioned successfully |
| `FAILED` | One or more items failed to provision |
| `CANCELLED` | Order was cancelled before fulfillment |

> Note: payment moves an order straight into `PROVISIONING` — there is no separate `PAID` order status.

### Order Items

Each `OrderItem` corresponds to a single product or domain in the cart. Items track:
- The product and pricing snapshot at time of purchase
- The domain name (for domain items)
- The configuration chosen by the customer
- The provisioning status of the item

### Duplicate Prevention

**An order cannot be placed if the same product or domain already exists on the system:**

Uniqueness is enforced **per type, by domain name, across the whole system** (any customer):

- **Domain uniqueness**: If a domain name already has an active `DomainRecord` (status not `CANCELLED`, `EXPIRED`, or `FAILED`), no new order may register that domain.
- **Hosting uniqueness**: If a domain name already backs an active hosting `Service` (its `configuration.domainName`, status not `CANCELLED`/`TERMINATED`/`FAILED`/`PROVISIONING_FAILED`), no new order may create another hosting account for that domain.

A customer may still hold **one domain registration and one hosting service for the same name** (the normal "register the domain, then host it" flow), and may hold many hosting services for *different* domain names.

This rule applies to both storefront checkout and admin-created orders.

**Exception — Invoices**: An admin can always create a standalone invoice for a client regardless of existing services or domains. Invoices are billing documents and do not trigger provisioning directly. Use the "Create Invoice" action in the Admin > Clients > Client detail page for this purpose.

---

## Invoices

### What is an Invoice?

An `Invoice` is a billing document that requests payment from a customer. It contains line items with amounts, VAT, and a due date. Invoices can be:

1. **Order-linked**: Automatically created during checkout — one invoice per order.
2. **Standalone**: Manually created by an admin (e.g. for a custom service, consultation, or a product the customer already has but needs to renew).

### Invoice Lifecycle

```
PENDING → PAID
        ↘ OVERDUE (via cron after due date)
        ↘ CANCELLED
        ↘ REFUNDED (after refund request)
```

Invoices only ever surface two statuses to customers: **Pending** (awaiting payment, temporary "N-" invoice number) and **Overdue**. Once paid, the invoice gets a final sequential invoice number and shows **no status badge** (paid is the normal, terminal state). `FAILED`, `CANCELLED`, and `REFUNDED` exist for the rare cases they occur. The older `DRAFT`, `UNSENT`, and `UNPAID` statuses were consolidated into `PENDING`.

### Invoice Document (HTML / PDF)

Invoices render from `apps/api/src/modules/billing/invoice-document.ts`:
`renderInvoiceDocument()` builds the HTML, and `renderInvoicePdfFromHtml()` re-draws
that HTML into a pixel-tuned A4 PDF with pdfkit.

For **paid** invoices the document shows both the payment date (*Bezahlt am*) and the
payment method (*Zahlungsart*). The payment-method label is resolved at render time by
`getInvoice()` and attached as `invoice.paymentMethodLabel`:

- It reads the method of the most recent `SUCCEEDED` transaction on the invoice.
- The human-readable name comes from **Admin > Payment Gateways**, where each gateway
  has a *"Name on invoice"* field. These names are persisted in the database:
  - CREDIT_CARD / PAYPAL / SEPA → `PaymentProcessorConfig.config.displayName`
  - BANK_TRANSFER → `SystemSetting` key `bankTransfer.displayName`
- When no name is configured it falls back to a German default
  (`Kreditkarte`, `PayPal`, `SEPA-Lastschrift`, `Banküberweisung`, `Guthaben`).

The label is resolved live (not snapshotted onto the invoice), so renaming a gateway
also updates how the method reads on previously paid invoices. The underlying
`Transaction.method` enum is immutable.

For **pending** invoices (those still carrying a temporary `N-` number, i.e. no
`finalInvoiceNumber` yet) the document renders a note near the totals: *"This is not a
final invoice. A final invoice will be issued after successful payment."* The text is
localized via the `invoice.pendingNotice` key (`packages/locales/{de,en}/invoice.json`)
and disappears once the invoice is paid and gets its final sequential number.

### Invoice vs. Order: Key Differences

| Aspect | Order | Invoice |
|--------|-------|---------|
| Triggers provisioning | Yes (on payment) | No (directly) |
| Requires new product | Yes | No — can bill for anything |
| Blocked by duplicates | Yes | No |
| Created automatically | On checkout | On checkout + manually |
| Linked to subscription | Via Service | Via InvoiceItem |

### Standalone Invoice Creation

Admins create standalone invoices in **Admin > Clients > [Client] > Create Invoice**. These are useful when:
- A customer needs a renewal invoice for an existing service
- You want to charge for a custom service or consulting fee
- The customer already has a service but needs to be billed again for it

Standalone invoices do **not** create services or domains when paid — they are pure billing documents.

---

## Product Domain Requirement

Every non-domain product carries a **domain requirement** set in **Admin > Products** (the
`Product.domainRequirement` column). It decides whether and how the storefront order form offers a
domain alongside the service:

| Value | Admin control | Order form behaviour |
|-------|---------------|----------------------|
| `NECESSARY` | "Can be ordered with a domain" ticked, requirement = *Necessary* | Domain field is **required** — register, transfer, or keep an external domain (the long-standing web-hosting flow). |
| `OPTIONAL` | ticked, requirement = *Optional* | Domain field is shown but **skippable**; a note tells the customer it is optional. Leave it blank to order without a domain. |
| `NOT_NEEDED` | "Can be ordered with a domain" unticked | **No domain step** — no whois search, no register/transfer. |

`DOMAIN`-type products (and products in a *domain* category) are the domain itself, so the controls
are hidden for them and the value is forced to `NOT_NEEDED`.

The type-based migration seeds existing products: shared hosting → `NECESSARY`, virtual servers →
`OPTIONAL`, reseller packages → `NECESSARY`, everything else → `NOT_NEEDED`. Admins can override any
product afterwards.

### Free domain included

When a product can be ordered with a domain, the admin may also set **Free domain included** to a
billing cycle (`Product.freeDomainBillingCycle`). A domain ordered together with that service is then
free once the chosen billing cycle is at least that long (e.g. `YEAR_1` → every annual cycle). The
discount still respects the **€15 price cap** — domains above €15 are never given away for free. The
backend applies this in `applyFreeDomainDiscount` (`orders.service.ts`); the storefront mirrors it via
`freeDomainApplies` in `checkout-form.tsx`. Shared hosting keeps its previous "free domain on annual
plans" behaviour because the migration backfills `freeDomainBillingCycle = YEAR_1` for it.

---

## Checkout Flow (Storefront)

1. Customer fills out the cart and submits checkout
2. `POST /orders/checkout` is called
3. The system checks for duplicate services/domains (throws 400 if found)
4. An `Invoice` (status: `PENDING`) is created with the order snapshot
5. An `Order` (status: `PENDING`) is linked to the invoice
6. Pending service/domain placeholder records are created
7. The customer is redirected to the payment page
8. On payment, `onInvoicePaid()` activates the order:
   - Services are provisioned via the assigned module (Virtualmin, Resell.biz, Hetzner)
   - For manual-module products, the order stays in `PROVISIONING` until staff activates it
9. On successful provisioning, the order becomes `COMPLETE`

### Auto-Login After Checkout

New customers who register during checkout are automatically logged in after successful payment. Their account is activated from the `pendingCheckout` state embedded in the invoice snapshot.

---

## Admin Order Creation

Admins can create orders on behalf of clients via **Admin > Orders > New Order** or the API:
`POST /orders/admin`

Admin-created orders support:
- Immediate module activation (`runModules: true`)
- Backdating (`placedAt`)
- Custom due dates
- Optional email dispatch
- **Custom pricing** (per item) — override the product list price
- **Discounts** (per order) — one-time or recurring

The same duplicate check applies to admin-created orders.

### Prices are net; VAT is added on top

Every entered or looked-up price in the system is **net (VAT-excluded)** — product list prices, admin
custom prices, and domain prices alike. The invoice engine (`BillingEngineService.createDraft`)
**adds** VAT on top of each product line at the buyer's resolved rate (`resolveVat`), including the domain
line; it never extracts VAT from a price. The one exception is the **discount line**, which is a flat
amount carrying **no VAT** (see *Discounts*).

The admin new-order **pricing preview** mirrors this exactly — net lines, per-line VAT (hosting *and*
domain), and a flat discount as its own line — so the preview total equals the created invoice and order
total. The storefront checkout estimate follows the same rule (`previewOrder` taxes the full net subtotal,
domain included). Buyers who resolve to 0% VAT (EU reverse charge, non-EU export, VAT disabled) simply see
the net price as the total, with nothing added — see **Reverse charge & 0% VAT** below.

### Custom pricing

When the admin ticks *Use custom pricing*, the order item carries `customAmountCents`,
`customBillingCycle`, and `applyCustomToRenewals` (default on). `OrdersService.priceItem` overrides the
priced item's `unitAmountCents` and `billingCycle` with these values (never for `DOMAIN` items — those
are always priced live from resell.biz), anchoring the item to the product list price **matching the
custom cycle** when one exists. The custom amount therefore flows to the created order item, the first
invoice line, and — because renewals bill `Service.recurringAmountCents` — to every Cron renewal invoice.
When *apply to renewals* is unticked, the first invoice uses the custom price while the service keeps the
cycle-matched product list price for renewals (the divergent amount rides on the order item's
`configuration.renewalAmountCents`, which `createPendingEntitiesForOrder` reads).

Every activation path preserves the captured price: `createPendingEntitiesForOrder` writes it to
`Service.recurringAmountCents` up front, and `activateItem` (the *Run modules on create* / legacy payment
path) **reuses** that service instead of creating a second one — previously it created a duplicate
service with `recurringAmountCents` 0 plus a duplicate subscription, so renewals silently billed the list
price and the *apply to renewals* toggle appeared to do nothing.

### Discounts

The admin sets a **flat** discount amount and a type (*one-time* or *recurring*). The discount applies to
the **whole order**, never to a specific product/domain line, and is **never distributed** into the item
lines (which keep their full net + VAT). It is billed as its **own invoice line** with **no VAT**
(`vatRate: 0`): a €1 discount reduces the invoice total by exactly €1, while VAT stays computed on the
full product/domain lines. Because it is a real line, it renders automatically wherever invoice items
render (PDF + on-screen admin/client sheets); the admin **order detail** surfaces it by reading the
`DISCOUNT` line from the linked invoice. It is capped at the order net so the total never goes negative.

- **One-time** — the discount line is added to the first invoice only; renewals are unaffected.
- **Recurring** — the discount line is added to the first invoice, and its amount is stored on the
  **primary (first non-domain) product** `Subscription` as an internal `FIXED` `Coupon`
  (`createAdHocDiscountCoupon`). `renewSubscription` reads that coupon and re-adds an equivalent discount
  line to every future renewal invoice (`couponDiscountCents`). Domains renew at full price.

> The coupon here is used only as **storage** of the recurring amount; renewals do **not** go through the
> engine's coupon-distribution path (`couponCode`). That distribution path still exists for legacy/manual
> coupon invoices but is no longer used by admin orders or renewals.

The storefront checkout path passes neither custom pricing nor discounts, so it is unchanged.

### Reverse charge & 0% VAT

VAT is resolved per buyer by `resolveVat` (`packages/shared/src/tax.ts`), the single source of truth for
both the API (invoice/order creation) and the web checkout estimate:

- **EU B2B cross-border with a valid VAT ID** → **reverse charge**: 0% VAT here, the buyer self-accounts
  (`taxReason` = "EU reverse charge").
- **Non-EU buyer** → **export**: 0% German VAT ("Non-EU export").
- **VAT globally disabled** in admin tax settings → 0% everywhere ("VAT disabled").
- Otherwise the buyer country's rate applies (its own rate, else the configured default country's rate,
  else the German standard 19%).

At 0%, no VAT line is added and the net price is the total. This behaviour is intentional and kept as-is;
the invoice records the `taxReason` so the 0% is explained on the document. Note the admin new-order
**preview** uses the tenant's global VAT rate (a single number), so for a buyer who resolves to a
different rate (e.g. reverse charge) the preview VAT can differ from the created invoice, which always
uses the buyer-specific resolution.

---

## Subscriptions and Renewals

When an order item with a recurring billing cycle is activated, a `Subscription` record is created for that service. The subscription drives automatic invoice generation at each billing period via a cron job.

Subscription renewal invoices are **standalone invoices** (not linked to a new order). If a renewal invoice is paid, the service's `renewsAt` date is extended accordingly.

### Renewal pricing — the order price is the source of truth

Renewals bill the **captured order price** (`Service.recurringAmountCents`), not the product's list price (`ProductPrice.amountCents`). This matters for domains: the generic `DOMAIN` product carries a `0` list price because every TLD/term is priced live from resell.biz at checkout, so the real price is captured per order onto the `Service` and `DomainRecord` (`recurringAmountCents` / `firstPaymentAmountCents`). `renewSubscription` falls back to the list price only for legacy services created before the order price was captured.

The dashboards follow the same rule. Both the client and admin views show `recurringAmountCents` (via the `serviceUnitPriceCents` / `domainUnitPriceCents` helpers in `apps/web/lib/api.ts`), not `productPrice.amountCents` — otherwise every domain would display €0.

---

## Email Notifications

The following emails are dispatched automatically during the order/invoice lifecycle:

| Event | Trigger |
|-------|---------|
| `order_confirmation` | Order placed (checkout) |
| `new_invoice` | Invoice created |
| `payment_successful` | Invoice marked as paid |
| `domain_information` | Domain successfully provisioned |
| `hosting_account_information` | Hosting account successfully provisioned |
| `invoice_reminder` | Invoice overdue (cron) |
| `refund_request_sent` | Invoice refunded |

Email delivery requires SMTP to be configured in **Admin > Emails > Settings**.
