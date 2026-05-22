type InvoiceLike = Record<string, any>;

export function renderInvoiceDocument(invoice: InvoiceLike) {
  const seller = asRecord(invoice.sellerSnapshot);
  const buyer = asRecord(invoice.customerSnapshot);
  const buyerAddress = asRecord(buyer.address);
  const number = stringValue(invoice.finalInvoiceNumber) ?? stringValue(invoice.tempInvoiceNumber) ?? stringValue(invoice.invoiceNumber) ?? invoice.id;
  const issuedAt = dateLabel(invoice.issuedAt);
  const dueAt = dateLabel(invoice.dueAt);
  const paidAt = invoice.paidAt ? dateLabel(invoice.paidAt) : "";
  const servicePeriod = periodLabel(invoice.items);
  const footerLines = Array.isArray(invoice.footerLines) ? invoice.footerLines.filter((line): line is string => typeof line === "string" && line.trim().length > 0) : [];
  const rows = Array.isArray(invoice.items) ? invoice.items : [];
  const taxReason = stringValue(invoice.taxReason);
  const paymentInstructions = stringValue(seller.paymentInstructions);
  const bankDetails = stringValue(seller.bankDetails);
  const showVat = numberValue(invoice.taxAmountCents) > 0;

  const html = `<!doctype html>
<html lang="de">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Rechnung ${escapeHtml(number)}</title>
  <style>
    :root { color: #111827; font-family: Arial, Helvetica, sans-serif; }
    body { margin: 0; background: #f3f6f9; }
    .page { box-sizing: border-box; width: 210mm; min-height: 297mm; margin: 0 auto; padding: 18mm 20mm; background: #fff; }
    .top { display: grid; grid-template-columns: 1fr auto; gap: 18mm; align-items: start; border-bottom: 1px solid #d9e2ec; padding-bottom: 10mm; }
    .brand { font-size: 21px; font-weight: 700; letter-spacing: 0; }
    .seller, .meta, .footer { color: #4b5563; font-size: 11px; line-height: 1.55; }
    .sender { margin: 13mm 0 5mm; color: #6b7280; font-size: 10px; text-decoration: underline; }
    .address { min-height: 35mm; font-size: 13px; line-height: 1.55; }
    h1 { margin: 0 0 7mm; font-size: 26px; letter-spacing: 0; }
    .intro { display: grid; grid-template-columns: 1fr 62mm; gap: 14mm; margin-bottom: 8mm; }
    .meta { display: grid; grid-template-columns: 1fr 1fr; gap: 2mm 7mm; }
    .meta strong { color: #111827; }
    table { width: 100%; border-collapse: collapse; font-size: 11px; }
    th { border-bottom: 1px solid #111827; padding: 3mm 2mm; text-align: left; }
    td { border-bottom: 1px solid #e5e7eb; padding: 3mm 2mm; vertical-align: top; }
    th.num, td.num { text-align: right; white-space: nowrap; }
    .totals { display: grid; justify-content: end; gap: 2mm; margin: 7mm 0 8mm; font-size: 12px; }
    .totals div { display: grid; grid-template-columns: 38mm 32mm; gap: 8mm; }
    .total { border-top: 1px solid #111827; padding-top: 3mm; font-size: 15px; font-weight: 700; }
    .note { margin-top: 6mm; border-top: 1px solid #d9e2ec; padding-top: 5mm; color: #374151; font-size: 11px; line-height: 1.55; }
    .footer { margin-top: 12mm; border-top: 1px solid #d9e2ec; padding-top: 5mm; }
  </style>
</head>
<body>
  <main class="page">
    <header class="top">
      <div>
        <div class="brand">${escapeHtml(stringValue(seller.companyName) ?? "Dezhost")}</div>
        <div class="seller">${addressLines(seller).map(escapeHtml).join("<br />")}</div>
      </div>
      <div class="seller">
        ${seller.vatNumber ? `USt-IdNr. ${escapeHtml(String(seller.vatNumber))}<br />` : ""}
        ${seller.email ? escapeHtml(String(seller.email)) : ""}${seller.phone ? `<br />${escapeHtml(String(seller.phone))}` : ""}
      </div>
    </header>

    <div class="sender">${escapeHtml(senderLine(seller))}</div>
    <section class="address">
      <strong>${escapeHtml(stringValue(buyer.companyName) ?? stringValue(buyer.name) ?? "")}</strong><br />
      ${buyer.companyName && buyer.name ? `${escapeHtml(String(buyer.name))}<br />` : ""}
      ${[buyerAddress.line1, `${stringValue(buyerAddress.postalCode) ?? ""} ${stringValue(buyerAddress.city) ?? ""}`.trim(), buyer.countryCode].filter(Boolean).map((line) => escapeHtml(String(line))).join("<br />")}
      ${buyer.vatId ? `<br />USt-IdNr. ${escapeHtml(String(buyer.vatId))}` : ""}
    </section>

    <section class="intro">
      <div>
        <h1>Rechnung ${escapeHtml(number)}</h1>
        <p>Vielen Dank fuer Ihren Auftrag. Wir berechnen die folgenden Leistungen gemaess Bestellung.</p>
      </div>
      <div class="meta">
        <span>Rechnungsdatum</span><strong>${escapeHtml(issuedAt)}</strong>
        <span>Faellig am</span><strong>${escapeHtml(dueAt)}</strong>
        ${paidAt ? `<span>Bezahlt am</span><strong>${escapeHtml(paidAt)}</strong>` : ""}
        <span>Leistungszeitraum</span><strong>${escapeHtml(servicePeriod)}</strong>
        <span>Kundennummer</span><strong>${escapeHtml(String(invoice.userId ?? "-"))}</strong>
      </div>
    </section>

    <table>
      <thead>
        <tr><th>Pos.</th><th>Beschreibung</th><th>Zeitraum</th><th class="num">Menge</th><th class="num">Einzelpreis</th><th class="num">Gesamt</th></tr>
      </thead>
      <tbody>
        ${rows.map((item, index) => invoiceRow(item, index, invoice.currency)).join("")}
      </tbody>
    </table>

    <section class="totals">
      <div><span>Zwischensumme</span><strong>${escapeHtml(formatMoney(numberValue(invoice.subtotalCents ?? invoice.totalCents), invoice.currency))}</strong></div>
      ${numberValue(invoice.discountCents) > 0 ? `<div><span>Rabatt</span><strong>-${escapeHtml(formatMoney(numberValue(invoice.discountCents), invoice.currency))}</strong></div>` : ""}
      ${showVat ? `<div><span>Umsatzsteuer</span><strong>${escapeHtml(formatMoney(numberValue(invoice.taxAmountCents), invoice.currency))}</strong></div>` : ""}
      <div class="total"><span>Rechnungsbetrag</span><strong>${escapeHtml(formatMoney(numberValue(invoice.totalCents), invoice.currency))}</strong></div>
    </section>

    ${taxReason ? `<section class="note">${escapeHtml(taxReason)}</section>` : ""}
    ${(paymentInstructions || bankDetails) ? `<section class="note">${paymentInstructions ? `${escapeHtml(paymentInstructions)}<br />` : ""}${bankDetails ? escapeHtml(bankDetails) : ""}</section>` : ""}
    ${footerLines.length ? `<footer class="footer">${footerLines.map((line) => `<div>${escapeHtml(line)}</div>`).join("")}</footer>` : ""}
  </main>
</body>
</html>`;

  return { fileName: `invoice-${number}.html`, html };
}

export function renderInvoicePdfFromHtml(html: string) {
  const lines = htmlToLines(html);
  return createPdf(lines);
}

function invoiceRow(item: Record<string, any>, index: number, currency: unknown) {
  const start = item.servicePeriodStart ? dateLabel(item.servicePeriodStart) : "";
  const end = item.servicePeriodEnd ? dateLabel(item.servicePeriodEnd) : "";
  const period = start || end ? [start, end].filter(Boolean).join(" - ") : cycleLabel(item.billingCycle);
  return `<tr>
    <td>${index + 1}</td>
    <td>${escapeHtml(String(item.description ?? ""))}</td>
    <td>${escapeHtml(period)}</td>
    <td class="num">${escapeHtml(String(item.quantity ?? 1))}</td>
    <td class="num">${escapeHtml(formatMoney(numberValue(item.unitAmountCents), currency))}</td>
    <td class="num">${escapeHtml(formatMoney(numberValue(item.totalCents), currency))}</td>
  </tr>`;
}

function htmlToLines(html: string) {
  return decodeHtml(html)
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<\/(h1|h2|h3|p|div|section|header|footer|tr)>/gi, "\n")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .split(/\n+/)
    .map((line) => line.replace(/\s+/g, " ").trim())
    .filter(Boolean)
    .slice(0, 48);
}

function createPdf(lines: string[]) {
  const escaped = lines.map((line, index) => `BT /F1 10 Tf 44 ${790 - index * 15} Td (${pdfEscape(line)}) Tj ET`).join("\n");
  const objects = [
    "1 0 obj << /Type /Catalog /Pages 2 0 R >> endobj",
    "2 0 obj << /Type /Pages /Kids [3 0 R] /Count 1 >> endobj",
    "3 0 obj << /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >> endobj",
    "4 0 obj << /Type /Font /Subtype /Type1 /BaseFont /Helvetica >> endobj",
    `5 0 obj << /Length ${Buffer.byteLength(escaped)} >> stream\n${escaped}\nendstream endobj`
  ];
  let offset = "%PDF-1.4\n".length;
  const xref = ["0000000000 65535 f "];
  const body = objects.map((object) => {
    xref.push(`${String(offset).padStart(10, "0")} 00000 n `);
    offset += Buffer.byteLength(`${object}\n`);
    return object;
  }).join("\n");
  const start = Buffer.byteLength(`%PDF-1.4\n${body}\n`);
  return Buffer.from(`%PDF-1.4\n${body}\nxref\n0 ${xref.length}\n${xref.join("\n")}\ntrailer << /Root 1 0 R /Size ${xref.length} >>\nstartxref\n${start}\n%%EOF`);
}

function addressLines(seller: Record<string, any>) {
  return [
    stringValue(seller.address),
    [seller.zip, seller.city].filter(Boolean).join(" "),
    stringValue(seller.country)
  ].filter((line): line is string => typeof line === "string" && line.trim().length > 0);
}

function senderLine(seller: Record<string, any>) {
  return [seller.companyName, seller.address, seller.zip, seller.city].filter(Boolean).join(", ");
}

function periodLabel(items: unknown) {
  const rows = Array.isArray(items) ? items : [];
  const starts = rows.map((item) => asRecord(item).servicePeriodStart).filter(Boolean);
  const ends = rows.map((item) => asRecord(item).servicePeriodEnd).filter(Boolean);
  if (starts.length || ends.length) {
    return [starts[0] ? dateLabel(starts[0]) : "", ends[0] ? dateLabel(ends[0]) : ""].filter(Boolean).join(" - ");
  }
  return "gem. Leistungsbeschreibung";
}

function cycleLabel(value: unknown) {
  if (typeof value !== "string" || !value) {
    return "-";
  }
  return value.replace(/_/g, " ").toLowerCase();
}

function dateLabel(value: unknown) {
  const date = value instanceof Date ? value : new Date(String(value));
  return Number.isFinite(date.getTime()) ? new Intl.DateTimeFormat("de-DE", { dateStyle: "medium" }).format(date) : "-";
}

function formatMoney(cents: number, currency: unknown) {
  return new Intl.NumberFormat("de-DE", { currency: typeof currency === "string" ? currency : "EUR", style: "currency" }).format(cents / 100);
}

function numberValue(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function stringValue(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function asRecord(value: unknown): Record<string, any> {
  return typeof value === "object" && value !== null && !Array.isArray(value) ? value as Record<string, any> : {};
}

function escapeHtml(value: unknown) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function decodeHtml(value: string) {
  return value
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, "&");
}

function pdfEscape(value: string) {
  return value.replace(/[\\()]/g, "\\$&");
}
