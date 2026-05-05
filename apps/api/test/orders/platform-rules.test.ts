import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  addBillingCycle,
  formatInvoiceNumber,
  formatOrderNumber,
  shouldCloseAnsweredTicket
} from "../../src/modules/billing/platform-rules";

describe("platform billing and support rules", () => {
  it("formats order numbers as 6 digits", () => {
    assert.equal(formatOrderNumber(1), "000001");
    assert.equal(formatOrderNumber(123456), "123456");
    assert.throws(() => formatOrderNumber(1_000_000), /6 digits/);
  });

  it("formats invoice numbers as 7 digits", () => {
    assert.equal(formatInvoiceNumber(1), "0000001");
    assert.equal(formatInvoiceNumber(1_234_567), "1234567");
    assert.throws(() => formatInvoiceNumber(10_000_000), /7 digits/);
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
