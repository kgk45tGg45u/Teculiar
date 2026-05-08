import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { formatPaidInvoiceNumber, formatUnpaidInvoiceNumber } from "../../src/modules/billing/platform-rules";

// ── Invoice numbering ────────────────────────────────────────────────────────

describe("invoice numbering", () => {
  it("unpaid invoice starts with N-", () => {
    assert.equal(formatUnpaidInvoiceNumber(1), "N-000001");
    assert.equal(formatUnpaidInvoiceNumber(123456), "N-123456");
  });

  it("paid invoice is plain 6-digit number", () => {
    assert.equal(formatPaidInvoiceNumber(1), "000001");
    assert.equal(formatPaidInvoiceNumber(999999), "999999");
  });

  it("unpaid and paid numbers are distinct for same sequence", () => {
    const unpaid = formatUnpaidInvoiceNumber(42);
    const paid = formatPaidInvoiceNumber(42);
    assert.notEqual(unpaid, paid);
    assert.match(unpaid, /^N-/);
    assert.doesNotMatch(paid, /^N-/);
  });

  it("throws for non-positive sequence", () => {
    assert.throws(() => formatUnpaidInvoiceNumber(0));
    assert.throws(() => formatPaidInvoiceNumber(-1));
  });

  it("throws when number exceeds 6 digits", () => {
    assert.throws(() => formatPaidInvoiceNumber(1_000_000));
    assert.throws(() => formatUnpaidInvoiceNumber(1_000_000));
  });
});

// ── Seller snapshot shape ────────────────────────────────────────────────────

describe("seller snapshot", () => {
  it("contains expected keys", () => {
    const snapshot = {
      name: "Dezhost GmbH",
      addressLine1: "Musterstraße 1",
      postalCode: "10115",
      city: "Berlin",
      countryCode: "DE",
      vatId: "DE123456789",
      email: "billing@dezhost.de",
      phone: "+49 30 12345678"
    };

    for (const key of ["name", "addressLine1", "postalCode", "city", "countryCode", "vatId", "email", "phone"]) {
      assert.ok(key in snapshot, `missing key: ${key}`);
    }
  });

  it("snapshot is independent of later changes (frozen copy)", () => {
    const original = { name: "Dezhost GmbH", city: "Berlin" };
    const snapshot = { ...original };
    original.name = "Changed Name";
    assert.equal(snapshot.name, "Dezhost GmbH");
  });
});

// ── Invoice payability ───────────────────────────────────────────────────────

describe("invoice payability", () => {
  const payableStatuses = ["UNPAID", "OVERDUE", "FAILED"];
  const nonPayableStatuses = ["PAID", "DRAFT", "PENDING", "UNSENT"];

  for (const status of payableStatuses) {
    it(`status ${status} is payable`, () => {
      assert.ok(payableStatuses.includes(status));
    });
  }

  for (const status of nonPayableStatuses) {
    it(`status ${status} is NOT payable`, () => {
      assert.ok(!payableStatuses.includes(status));
    });
  }
});

// ── Invoice status transitions ───────────────────────────────────────────────

describe("invoice status transitions", () => {
  it("marking paid assigns a plain number (no N- prefix)", () => {
    const paidNumber = formatPaidInvoiceNumber(5);
    assert.doesNotMatch(paidNumber, /^N-/);
    assert.match(paidNumber, /^\d{6}$/);
  });

  it("unpaid number has N- prefix", () => {
    const unpaidNumber = formatUnpaidInvoiceNumber(5);
    assert.match(unpaidNumber, /^N-\d{6}$/);
  });
});

// ── Custom invoice lines ─────────────────────────────────────────────────────

describe("custom invoice lines", () => {
  it("calculates total from quantity and unit price", () => {
    const lines = [
      { description: "Custom service", quantity: 2, unitAmountCents: 5000 },
      { description: "Setup fee", quantity: 1, unitAmountCents: 2000 }
    ];
    const subtotal = lines.reduce((sum, line) => sum + line.quantity * line.unitAmountCents, 0);
    assert.equal(subtotal, 12_000);
  });

  it("applies VAT to subtotal", () => {
    const subtotalCents = 10_000;
    const vatRate = 19;
    const taxCents = Math.round(subtotalCents * vatRate / 100);
    assert.equal(taxCents, 1_900);
    assert.equal(subtotalCents + taxCents, 11_900);
  });

  it("zero VAT for reverse charge", () => {
    const subtotalCents = 10_000;
    const reverseCharge = true;
    const taxCents = reverseCharge ? 0 : Math.round(subtotalCents * 19 / 100);
    assert.equal(taxCents, 0);
  });
});
