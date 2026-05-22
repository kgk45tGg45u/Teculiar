import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import {
  renderInvoiceDocument,
  renderInvoicePdfFromHtml
} from "../dist/modules/billing/invoice-document.js";

const invoice = {
  currency: "EUR",
  customerSnapshot: {
    address: { city: "Berlin", line1: "Kundenweg 4", postalCode: "10115" },
    companyName: "Kunde GmbH",
    countryCode: "DE",
    email: "kunde@example.test",
    name: "Max Kunde",
    vatId: "DE999"
  },
  discountCents: 0,
  dueAt: new Date("2026-05-29T00:00:00.000Z"),
  finalInvoiceNumber: "100001",
  footerLines: ["Snapshot footer line"],
  id: "invoice-1",
  invoiceNumber: "100001",
  issuedAt: new Date("2026-05-22T00:00:00.000Z"),
  items: [{
    billingCycle: "YEAR_1",
    description: "Silber Hosting <script>alert(1)</script>",
    quantity: 1,
    taxAmountCents: 0,
    taxRate: 0,
    totalCents: 475,
    unitAmountCents: 475
  }],
  paidAt: new Date("2026-05-22T12:00:00.000Z"),
  sellerSnapshot: {
    address: "Altstrasse 1",
    bankDetails: "IBAN DE00 0000 0000 0000 0000 00",
    city: "Berlin",
    companyName: "Snapshot Host GmbH",
    country: "DE",
    email: "rechnung@example.test",
    paymentInstructions: "Bitte innerhalb der Frist zahlen.",
    phone: "+49 30 555",
    vatNumber: "DE123456789",
    zip: "10117"
  },
  status: "PAID",
  subtotalCents: 475,
  taxAmountCents: 0,
  taxReason: "Kleinunternehmerregelung gemaess Paragraph 19 UStG",
  totalCents: 475,
  transactions: [{ method: "CREDIT_CARD", status: "SUCCEEDED" }]
};

test("invoice HTML is protected-route ready, formal, escaped, and snapshot based", () => {
  const document = renderInvoiceDocument(invoice);

  assert.match(document.html, /<!doctype html>/);
  assert.match(document.html, /Rechnung 100001/);
  assert.match(document.html, /Snapshot Host GmbH/);
  assert.match(document.html, /Altstrasse 1/);
  assert.match(document.html, /USt-IdNr\. DE123456789/);
  assert.match(document.html, /Kunde GmbH/);
  assert.match(document.html, /Leistungszeitraum/);
  assert.match(document.html, /Snapshot footer line/);
  assert.match(document.html, /Kleinunternehmerregelung/);
  assert.doesNotMatch(document.html, /<script>/);
  assert.match(document.html, /&lt;script&gt;alert\(1\)&lt;\/script&gt;/);
});

test("invoice PDF renderer consumes invoice HTML and returns a PDF buffer", () => {
  const document = renderInvoiceDocument(invoice);
  const pdf = renderInvoicePdfFromHtml(document.html);

  assert.equal(Buffer.isBuffer(pdf), true);
  assert.equal(pdf.subarray(0, 8).toString(), "%PDF-1.4");
  assert.match(pdf.toString("latin1"), /Rechnung 100001/);
  assert.match(pdf.toString("latin1"), /Snapshot footer line/);
});

test("billing controller exposes protected HTML before PDF download", async () => {
  const controller = await readFile(new URL("../src/modules/billing/billing.controller.ts", import.meta.url), "utf8");
  const service = await readFile(new URL("../src/modules/billing/billing.service.ts", import.meta.url), "utf8");

  assert.match(controller, /@Get\("invoices\/:id\/html"\)/);
  assert.match(controller, /this\.billing\.invoiceHtml\(id, request\.user\)/);
  assert.match(service, /invoiceHtml\(id: string, user\?: \{ roles\?: string\[\]; sub: string \}\)/);
  assert.match(service, /renderInvoiceDocument\(invoice\)\.html/);
  assert.match(service, /renderInvoicePdfFromHtml\(html\)/);
});
