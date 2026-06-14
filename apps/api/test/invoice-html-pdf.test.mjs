import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import {
  renderInvoiceDocument,
  renderInvoicePdfFromHtml
} from "../dist/modules/billing/invoice-document.js";
import { formatCustomerNumber } from "@dezhost/shared";

const invoice = {
  currency: "EUR",
  customerSnapshot: {
    address: { city: "Berlin", line1: "Kundenweg 4", postalCode: "10115" },
    companyName: "Kunde GmbH",
    countryCode: "DE",
    customerNumber: 123,
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

test("customer numbers render as stored six digit numbers", () => {
  assert.equal(formatCustomerNumber(123), "000123");
  assert.equal(formatCustomerNumber("42"), "000042");
  assert.equal(formatCustomerNumber(null), "-");
});

test("invoice HTML is protected-route ready, formal, escaped, and snapshot based", () => {
  const document = renderInvoiceDocument(invoice);

  assert.match(document.html, /<!doctype html>/);
  assert.match(document.html, /Rechnung 100001/);
  assert.match(document.html, /Snapshot Host GmbH/);
  assert.match(document.html, /Altstrasse 1/);
  assert.match(document.html, /USt-IdNr\. DE123456789/);
  assert.match(document.html, /Kunde GmbH/);
  assert.match(document.html, /Fällig am/);
  assert.doesNotMatch(document.html, /Leistungszeitraum/);
  assert.match(document.html, /Kundennummer<\/span><strong>000123/);
  assert.match(document.html, /Snapshot footer line/);
  assert.match(document.html, /Kleinunternehmerregelung/);
  assert.doesNotMatch(document.html, /<script>/);
  assert.match(document.html, /&lt;script&gt;alert\(1\)&lt;\/script&gt;/);
});

test("invoice uses the admin logo, a window-envelope address and a rounded black-and-white table", () => {
  const plain = renderInvoiceDocument(invoice);
  // Without a configured logo the masthead falls back to the seller company name.
  assert.match(plain.html, /<div class="brand">Snapshot Host GmbH<\/div>/);

  const branded = renderInvoiceDocument(invoice, { logoUrl: "/uploads/site-logo-1.svg" });
  assert.match(branded.html, /<img class="brandLogo" src="\/uploads\/site-logo-1\.svg"/);

  // Recipient address is pinned to the DIN 5008 Form B window position (Fensterumschlag).
  assert.match(plain.html, /class="addressZone"/);
  assert.match(plain.html, /\.addressZone \{ position: absolute; top: 45mm;/);
  // Rounded, fill-free items table prints cleanly in black & white.
  assert.match(plain.html, /<table class="items">/);
  assert.match(plain.html, /border-radius: 11px/);
  assert.doesNotMatch(plain.html, /background: #f3f6f9/);
});

test("invoice PDF renderer consumes invoice HTML and returns a PDF buffer", async () => {
  const document = renderInvoiceDocument(invoice);
  const pdf = await renderInvoicePdfFromHtml(document.html);

  assert.equal(Buffer.isBuffer(pdf), true);
  assert.equal(pdf.subarray(0, 5).toString(), "%PDF-");
  assert.ok(pdf.byteLength > 6000);
  assert.match(pdf.toString("latin1"), /Dezhost invoice PDF renderer/);
  assert.doesNotMatch(pdf.toString("latin1"), /BT \/F1 10 Tf 44 790 Td/);
});

test("billing controller exposes protected HTML before PDF download", async () => {
  const controller = await readFile(new URL("../src/modules/billing/billing.controller.ts", import.meta.url), "utf8");
  const service = await readFile(new URL("../src/modules/billing/billing.service.ts", import.meta.url), "utf8");

  assert.match(controller, /@Get\("invoices\/:id\/html"\)/);
  assert.match(controller, /this\.billing\.invoiceHtml\(id, request\.user\)/);
  assert.match(service, /invoiceHtml\(id: string, user\?: \{ roles\?: string\[\]; sub: string \}\)/);
  assert.match(service, /renderInvoiceDocument\(invoice, \{ logoUrl: url \}\)\.html/);
  assert.match(service, /renderInvoicePdfFromHtml\(html, image\)/);
});

test("users have stored customer numbers selected for profiles and invoices", async () => {
  const schema = await readFile(new URL("../../../prisma/schema.prisma", import.meta.url), "utf8");
  const migration = await readFile(new URL("../../../prisma/migrations/20260504211933_new_migration/migration.sql", import.meta.url), "utf8");
  const usersRepository = await readFile(new URL("../src/modules/users/users.repository.ts", import.meta.url), "utf8");
  const billingRepository = await readFile(new URL("../src/modules/billing/billing.repository.ts", import.meta.url), "utf8");
  const billingService = await readFile(new URL("../src/modules/billing/billing.service.ts", import.meta.url), "utf8");

  assert.match(schema, /customerNumber\s+Int\s+@unique\s+@default\(autoincrement\(\)\)/);
  assert.match(migration, /`customerNumber` INTEGER NOT NULL AUTO_INCREMENT/);
  assert.match(migration, /UNIQUE INDEX `User_customerNumber_key`\(`customerNumber`\)/);
  assert.match(usersRepository, /customerNumber: true/);
  assert.match(billingRepository, /customerNumber: true/);
  assert.match(billingService, /customerNumber: user\.customerNumber/);
});
