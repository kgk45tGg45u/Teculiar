import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import {
  renderInvoiceDocument,
  renderInvoicePdfFromHtml
} from "../dist/modules/billing/invoice-document.js";
import { formatCustomerNumber } from "@teculiar/shared";

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

test("paid invoices render the admin-defined payment method label next to the paid date", () => {
  const document = renderInvoiceDocument({ ...invoice, paymentMethodLabel: "Kreditkarte (Mollie)" });

  assert.match(document.html, /<span>Bezahlt am<\/span>/);
  assert.match(document.html, /<span>Zahlungsart<\/span><strong>Kreditkarte \(Mollie\)<\/strong>/);
});

test("the payment method row is omitted when the invoice is unpaid or has no resolved label", () => {
  const unpaid = renderInvoiceDocument({ ...invoice, status: "PENDING", paidAt: null, paymentMethodLabel: "Kreditkarte" });
  assert.doesNotMatch(unpaid.html, /Zahlungsart/);

  const paidButUnlabelled = renderInvoiceDocument({ ...invoice, paymentMethodLabel: undefined });
  assert.doesNotMatch(paidButUnlabelled.html, /Zahlungsart/);
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
  assert.match(pdf.toString("latin1"), /Teculiar invoice PDF renderer/);
  assert.doesNotMatch(pdf.toString("latin1"), /BT \/F1 10 Tf 44 790 Td/);
});

test("billing controller exposes protected HTML before PDF download and forwards the viewer locale", async () => {
  const controller = await readFile(new URL("../src/modules/billing/billing.controller.ts", import.meta.url), "utf8");
  const service = await readFile(new URL("../src/modules/billing/billing.service.ts", import.meta.url), "utf8");

  assert.match(controller, /@Get\("invoices\/:id\/html"\)/);
  // The viewer's display language flows from the query param into the renderer so the PDF/HTML
  // matches the on-screen invoice (which follows the language toggle).
  assert.match(controller, /@Query\("locale"\) locale\?: string/);
  assert.match(controller, /this\.billing\.invoiceHtml\(id, request\.user, locale\)/);
  assert.match(controller, /this\.billing\.invoicePdf\(id, request\.user, locale\)/);
  assert.match(service, /invoiceHtml\(id: string, user\?: \{ roles\?: string\[\]; sub: string \}, locale\?: string\)/);
  assert.match(service, /renderInvoiceDocument\(invoice, \{ logoUrl: url, locale: resolved \}\)\.html/);
  assert.match(service, /renderInvoicePdfFromHtml\(html, image\)/);
});

test("invoice localizes labels by the resolved locale (English)", () => {
  const en = renderInvoiceDocument(invoice, { locale: "en" });

  assert.match(en.html, /<html lang="en">/);
  assert.match(en.html, /<h1>Invoice 100001<\/h1>/);
  assert.match(en.html, /<span>Invoice Date<\/span>/);
  assert.match(en.html, /<span>Due Date<\/span>/);
  assert.match(en.html, /<span>Customer No\.<\/span>/);
  assert.match(en.html, /VAT ID DE123456789/);
  assert.match(en.html, /Total Amount/);
  // English never shows the German labels.
  assert.doesNotMatch(en.html, /Rechnung 100001/);
  assert.doesNotMatch(en.html, /USt-IdNr\./);
});

test("pending invoices (temporary N- number) warn they are not a final invoice", () => {
  const pending = renderInvoiceDocument({
    ...invoice,
    finalInvoiceNumber: null,
    tempInvoiceNumber: "N-100001",
    invoiceNumber: "N-100001",
    paidAt: null,
    status: "PENDING"
  });
  assert.match(pending.html, /Rechnung N-100001/);
  assert.match(pending.html, /Dies ist keine endgültige Rechnung\./);

  const pendingEn = renderInvoiceDocument({
    ...invoice,
    finalInvoiceNumber: null,
    tempInvoiceNumber: "N-100001",
    invoiceNumber: "N-100001",
    paidAt: null,
    status: "PENDING"
  }, { locale: "en" });
  assert.match(pendingEn.html, /This is not a final invoice\./);

  // A final (numbered) invoice never carries the pending warning.
  const final = renderInvoiceDocument(invoice);
  assert.doesNotMatch(final.html, /endgültige Rechnung wird nach erfolgreicher Zahlung/);
});

test("invoice money formats use the invoice's stored currency, not the live toggle", () => {
  const usd = renderInvoiceDocument({ ...invoice, currency: "USD", totalCents: 11900, subtotalCents: 11900 }, { locale: "en" });
  assert.match(usd.html, /\$119\.00/);

  const eur = renderInvoiceDocument({ ...invoice, currency: "EUR", totalCents: 11900, subtotalCents: 11900 }, { locale: "de" });
  assert.match(eur.html, /119,00/);
  assert.match(eur.html, /€/);
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
