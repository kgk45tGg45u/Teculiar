import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  addBillingCycle,
  formatInvoiceNumber,
  formatOrderNumber,
  formatPaidInvoiceNumber,
  formatUnpaidInvoiceNumber,
  shouldCloseAnsweredTicket
} from "../../src/modules/billing/platform-rules";

describe("platform billing and support rules", () => {
  it("formats order numbers as 6 digits", () => {
    assert.equal(formatOrderNumber(1), "000001");
    assert.equal(formatOrderNumber(123456), "123456");
    assert.throws(() => formatOrderNumber(1_000_000), /6 digits/);
  });

  it("formatInvoiceNumber (deprecated) returns N-XXXXXX unpaid format", () => {
    // formatInvoiceNumber is now an alias for formatUnpaidInvoiceNumber
    assert.equal(formatInvoiceNumber(1), "N-000001");
    assert.equal(formatInvoiceNumber(123456), "N-123456");
    assert.throws(() => formatInvoiceNumber(1_000_000));
  });

  it("formatUnpaidInvoiceNumber returns N-XXXXXX", () => {
    assert.equal(formatUnpaidInvoiceNumber(1), "N-000001");
    assert.equal(formatUnpaidInvoiceNumber(123456), "N-123456");
  });

  it("formatPaidInvoiceNumber returns plain 6-digit number", () => {
    assert.equal(formatPaidInvoiceNumber(1), "000001");
    assert.equal(formatPaidInvoiceNumber(999999), "999999");
    assert.throws(() => formatPaidInvoiceNumber(1_000_000));
  });

  it("calculates next due date from the prior due date and billing cycle", () => {
    assert.equal(addBillingCycle(new Date("2026-05-01T00:00:00.000Z"), "MONTHLY").toISOString(), "2026-06-01T00:00:00.000Z");
    assert.equal(addBillingCycle(new Date("2026-05-01T00:00:00.000Z"), "YEAR_1").toISOString(), "2027-05-01T00:00:00.000Z");
  });

  it("closes answered tickets after the admin-defined hour window", () => {
    const updatedAt = new Date("2026-05-04T12:00:00.000Z");
    assert.equal(shouldCloseAnsweredTicket("WAITING_ON_CLIENT", updatedAt, new Date("2026-05-05T12:00:00.000Z"), 24), true);
    assert.equal(shouldCloseAnsweredTicket("WAITING_ON_CLIENT", updatedAt, new Date("2026-05-05T11:59:00.000Z"), 24), false);
    assert.equal(shouldCloseAnsweredTicket("OPEN", updatedAt, new Date("2026-05-06T12:00:00.000Z"), 24), false);
  });
});
