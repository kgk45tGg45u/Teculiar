import assert from "node:assert/strict";
import { test } from "node:test";
import { resolveVat, sanitizeTaxCountryConfig, vatPercentForCountry } from "@dezhost/shared";

const config = { enabled: true, default: "DE", rates: { DE: 19, AT: 20 } };

test("vatPercentForCountry uses the country's own rate", () => {
  assert.equal(vatPercentForCountry(config, "AT"), 20);
  assert.equal(vatPercentForCountry(config, "de"), 19);
});

test("vatPercentForCountry falls back to the default country, never silently to 0", () => {
  // FR has no rate -> falls back to the default country's (DE) rate, not 0.
  assert.equal(vatPercentForCountry(config, "FR"), 19);
  // No default rate at all -> the German standard rate as a last resort.
  assert.equal(vatPercentForCountry({ enabled: true, default: "ZZ", rates: {} }, "ZZ"), 19);
});

test("resolveVat charges the buyer-country rate for EU consumers", () => {
  const vat = resolveVat({ sellerCountryCode: "DE", buyerCountryCode: "AT", isBusinessCustomer: false }, config);
  assert.equal(vat.rate, 20);
  assert.equal(vat.reverseCharge, false);
});

test("resolveVat reverse-charges EU B2B with a valid VAT ID", () => {
  const vat = resolveVat({ sellerCountryCode: "DE", buyerCountryCode: "FR", isBusinessCustomer: true, buyerVatId: "FR123" }, config);
  assert.equal(vat.rate, 0);
  assert.equal(vat.reverseCharge, true);
});

test("resolveVat zero-rates non-EU buyers (the JPY checkout case)", () => {
  const vat = resolveVat({ sellerCountryCode: "DE", buyerCountryCode: "JP", isBusinessCustomer: false }, config);
  assert.equal(vat.rate, 0);
  assert.equal(vat.reason, "Non-EU export");
});

test("resolveVat charges nothing anywhere when VAT is switched off", () => {
  const off = { enabled: false, default: "DE", rates: { DE: 19 } };
  assert.equal(resolveVat({ sellerCountryCode: "DE", buyerCountryCode: "DE", isBusinessCustomer: false }, off).rate, 0);
  assert.equal(resolveVat({ sellerCountryCode: "DE", buyerCountryCode: "AT", isBusinessCustomer: false }, off).rate, 0);
});

test("resolveVat treats a missing buyer country as the default country", () => {
  const vat = resolveVat({ sellerCountryCode: "DE", buyerCountryCode: "", isBusinessCustomer: false }, config);
  assert.equal(vat.rate, 19);
});

test("sanitizeTaxCountryConfig defaults enabled to true and keeps a default-country rate", () => {
  const clean = sanitizeTaxCountryConfig({ default: "de", rates: { at: 20, bad: "x", neg: -5 } });
  assert.equal(clean.enabled, true);
  assert.equal(clean.default, "DE");
  assert.equal(clean.rates.AT, 20);
  assert.equal(clean.rates.DE, 19); // default country always carries a rate
  assert.equal("BAD" in clean.rates, false); // non-numeric dropped
  assert.equal("NEG" in clean.rates, false); // negative dropped
});

test("sanitizeTaxCountryConfig honours an explicit disabled flag", () => {
  assert.equal(sanitizeTaxCountryConfig({ enabled: false, default: "DE", rates: { DE: 19 } }).enabled, false);
});
