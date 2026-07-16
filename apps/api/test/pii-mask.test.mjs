import assert from "node:assert/strict";
import { test } from "node:test";
import { deepMaskPii, isStaffViewer, maskClient, maskCustomerSnapshot, maskInvoice, maskOrder, maskService, maskUserRef, shouldMask } from "../dist/common/pii-mask.js";

test("shouldMask is true only for agent-only role sets", () => {
  assert.equal(shouldMask(["agent"]), true);
  assert.equal(shouldMask(["agent", "admin"]), false);
  assert.equal(shouldMask(["staff"]), false);
  assert.equal(shouldMask(undefined), false);
  assert.equal(shouldMask([]), false);
});

// super_admin was missing from a hand-rolled ["admin","staff","agent"] check and 404'd on
// invoice/service/order detail — the shared helper must accept EVERY staff-portal role.
test("isStaffViewer accepts every staff-portal role including super_admin", () => {
  for (const role of ["admin", "staff", "super_admin", "support_agent", "sales_agent", "agent"]) {
    assert.equal(isStaffViewer([role]), true, `${role} must be a staff viewer`);
  }
  assert.equal(isStaffViewer(["client"]), false);
  assert.equal(isStaffViewer(undefined), false);
  assert.equal(isStaffViewer([]), false);
});

test("maskUserRef partially masks email/name/vatId, keeps other fields", () => {
  const masked = maskUserRef({ id: "u1", email: "jane.doe@example.com", name: "Jane Doe", vatId: "DE123456789", balanceCents: 500 });
  assert.equal(masked.id, "u1");
  assert.equal(masked.balanceCents, 500);
  assert.equal(masked.email, "j***@example.com");
  assert.equal(masked.name, "J*** D***");
  assert.equal(masked.vatId, "DE***89");
  assert.notEqual(masked.email, "jane.doe@example.com");
});

test("maskUserRef tolerates a null vatId", () => {
  const masked = maskUserRef({ email: "a@b.com", name: "A", vatId: null });
  assert.equal(masked.vatId, null);
});

test("maskClient masks nested contacts (phone/address) alongside top-level fields", () => {
  const masked = maskClient({
    email: "customer@dezhost.com",
    name: "Max Mustermann",
    vatId: null,
    contacts: [{ phone: "+491701234567", address: { line1: "Hauptstr. 1", city: "Berlin", postalCode: "10115", country: "DE" } }]
  });
  assert.equal(masked.email, "c***@dezhost.com");
  assert.equal(masked.contacts[0].phone, "***67");
  assert.equal(masked.contacts[0].address.line1, "***");
  assert.equal(masked.contacts[0].address.city, "***");
  assert.equal(masked.contacts[0].address.country, "DE");
});

test("maskCustomerSnapshot masks known PII keys and leaves the rest untouched", () => {
  const masked = maskCustomerSnapshot({
    email: "snapshot@dezhost.com",
    name: "Snapshot Customer",
    phone: "+491701234567",
    vatId: "DE123456789",
    address: { line1: "Foo 1", city: "Foo City" },
    customerNumber: 42,
    userId: "u1"
  });
  assert.equal(masked.email, "s***@dezhost.com");
  assert.equal(masked.customerNumber, 42);
  assert.equal(masked.userId, "u1");
  assert.equal(masked.address.line1, "***");
});

test("maskCustomerSnapshot passes through non-record values unchanged", () => {
  assert.equal(maskCustomerSnapshot(null), null);
  assert.equal(maskCustomerSnapshot(undefined), undefined);
});

test("deepMaskPii masks PII/secret keys at any depth and leaves other data readable", () => {
  const masked = deepMaskPii({
    action: "invoice.paid",
    metadata: {
      customer_email: "deep@example.com",
      registrant: { name: "Deep Customer", phone: "+491701234567", street: "Hidden 1", country: "DE" },
      productSlug: "hosting-pro"
    },
    smtp: { password: "supersecret", host: "mail.example.com" },
    to: "recipient@example.com",
    adminEmails: ["a@b.com", "c@d.com"],
    eppCode: "TRANSFER-123",
    totalCents: 1999
  });
  assert.equal(masked.action, "invoice.paid");
  assert.equal(masked.totalCents, 1999);
  assert.equal(masked.metadata.customer_email, "d***@example.com");
  assert.equal(masked.metadata.registrant.name, "D*** C***");
  assert.equal(masked.metadata.registrant.street, "***");
  assert.equal(masked.metadata.registrant.country, "DE");
  assert.equal(masked.metadata.productSlug, "hosting-pro");
  assert.equal(masked.smtp.password, "***");
  assert.equal(masked.smtp.host, "mail.example.com");
  assert.equal(masked.to, "r***@example.com");
  assert.deepEqual(masked.adminEmails, ["a***@b.com", "c***@d.com"]);
  assert.equal(masked.eppCode, "***");
});

test("maskOrder masks user, snapshots, item configurations, and the nested invoice snapshot", () => {
  const masked = maskOrder({
    id: "o1",
    user: { email: "buyer@example.com", name: "Buyer One", vatId: null },
    customerSnapshot: { email: "buyer@example.com", name: "Buyer One" },
    invoice: { id: "i1", customerSnapshot: { email: "buyer@example.com" } },
    items: [{ id: "it1", configuration: { registrantEmail: "buyer@example.com" } }]
  });
  assert.equal(masked.user.email, "b***@example.com");
  assert.equal(masked.customerSnapshot.email, "b***@example.com");
  assert.equal(masked.invoice.customerSnapshot.email, "b***@example.com");
  assert.equal(masked.items[0].configuration.registrantEmail, "b***@example.com");
});

test("maskInvoice masks user, snapshots, and the nested order snapshot", () => {
  const masked = maskInvoice({
    id: "i1",
    user: { email: "payer@example.com", name: "Payer", vatId: "DE123456789" },
    customerSnapshot: { name: "Payer Person" },
    order: { id: "o1", customerSnapshot: { phone: "+491701234567" } }
  });
  assert.equal(masked.user.email, "p***@example.com");
  assert.equal(masked.customerSnapshot.name, "P*** P***");
  assert.equal(masked.order.customerSnapshot.phone, "***67");
});

test("maskService masks configuration and domain transfer secrets, keeps product readable", () => {
  const masked = maskService({
    id: "s1",
    configuration: { contactEmail: "owner@example.com" },
    product: { name: "Web Hosting Pro" },
    domainRecords: [{ domain: "example.com", eppCode: "SECRET-EPP", authCodeHash: "hashhash", status: "ACTIVE" }]
  });
  assert.equal(masked.configuration.contactEmail, "o***@example.com");
  assert.equal(masked.product.name, "Web Hosting Pro");
  assert.equal(masked.domainRecords[0].eppCode, "***");
  assert.equal(masked.domainRecords[0].authCodeHash, "***");
  assert.equal(masked.domainRecords[0].domain, "example.com");
});

test("maskClient masks the nested invoices/orders/services rows too", () => {
  const masked = maskClient({
    email: "customer@example.com",
    name: "Customer",
    vatId: null,
    contacts: [],
    invoices: [{ id: "i1", customerSnapshot: { email: "customer@example.com" } }],
    orders: [{ id: "o1", customerSnapshot: { name: "Customer Person" } }],
    services: [{ id: "s1", domainRecords: [{ domain: "x.com", eppCode: "EPP" }] }]
  });
  assert.equal(masked.invoices[0].customerSnapshot.email, "c***@example.com");
  assert.equal(masked.orders[0].customerSnapshot.name, "C*** P***");
  assert.equal(masked.services[0].domainRecords[0].eppCode, "***");
});
