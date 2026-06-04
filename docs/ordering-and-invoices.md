# Ordering and Invoice Logic

## Overview

The platform separates **ordering** (placing a purchase request) from **invoicing** (billing a customer). An order drives provisioning; an invoice drives payment. They are linked one-to-one for storefront checkouts, but invoices can also exist independently.

---

## Orders

### What is an Order?

An `Order` represents a customer's intent to purchase one or more products or domains. It is created at checkout and progresses through a lifecycle until all items are either provisioned or failed.

### Order Lifecycle

```
PENDING_PAYMENT → PAID → PROVISIONING → COMPLETE
                                      ↘ FAILED
          ↘ CANCELLED
```

| Status | Meaning |
|--------|---------|
| `PENDING_PAYMENT` | Order created, awaiting invoice payment |
| `PAID` | Invoice paid; provisioning has started |
| `PROVISIONING` | At least one item is being provisioned asynchronously |
| `COMPLETE` | All items provisioned successfully |
| `FAILED` | One or more items failed to provision |
| `CANCELLED` | Order was cancelled before fulfillment |

### Order Items

Each `OrderItem` corresponds to a single product or domain in the cart. Items track:
- The product and pricing snapshot at time of purchase
- The domain name (for domain items)
- The configuration chosen by the customer
- The provisioning status of the item

### Duplicate Prevention

**An order cannot be placed if the same product or domain already exists on the system:**

- **Domain uniqueness**: If a domain name already has an active `DomainRecord` (status not `CANCELLED`), no new order may include that domain. This applies across all customers — domain names are globally unique.
- **Service uniqueness per customer**: If a customer already has an active (non-cancelled, non-terminated) `Service` for a given product, they cannot place a new order for the same product.

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
UNPAID → PAID
       ↘ OVERDUE (via cron after due date)
       ↘ CANCELLED
       ↘ REFUNDED (after refund request)
```

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

## Checkout Flow (Storefront)

1. Customer fills out the cart and submits checkout
2. `POST /orders/checkout` is called
3. The system checks for duplicate services/domains (throws 400 if found)
4. An `Invoice` (status: `UNPAID`) is created with the order snapshot
5. An `Order` (status: `PENDING_PAYMENT`) is linked to the invoice
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

The same duplicate check applies to admin-created orders.

---

## Subscriptions and Renewals

When an order item with a recurring billing cycle is activated, a `Subscription` record is created for that service. The subscription drives automatic invoice generation at each billing period via a cron job.

Subscription renewal invoices are **standalone invoices** (not linked to a new order). If a renewal invoice is paid, the service's `renewsAt` date is extended accordingly.

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
