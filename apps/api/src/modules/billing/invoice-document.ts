import { formatCustomerNumber } from "@dezhost/shared";
import { load } from "cheerio";
import PDFDocument from "pdfkit";

type InvoiceLike = Record<string, any>;

export function renderInvoiceDocument(invoice: InvoiceLike) {
  const seller = asRecord(invoice.sellerSnapshot);
  const buyer = asRecord(invoice.customerSnapshot);
  const buyerAddress = asRecord(buyer.address);
  const number = stringValue(invoice.finalInvoiceNumber) ?? stringValue(invoice.tempInvoiceNumber) ?? stringValue(invoice.invoiceNumber) ?? invoice.id;
  const issuedAt = dateLabel(invoice.issuedAt);
  const dueAt = dateLabel(invoice.dueAt);
  const paidAt = invoice.paidAt ? dateLabel(invoice.paidAt) : "";
  const customerNumber = formatCustomerNumber(buyer.customerNumber ?? asRecord(invoice.user).customerNumber);
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
    .sellerCompany { margin-top: 2mm; color: #111827; font-size: 12px; font-weight: 700; }
    .seller, .meta, .footer { color: #4b5563; font-size: 11px; line-height: 1.55; }
    .sender { margin: 13mm 0 5mm; color: #6b7280; font-size: 10px; text-decoration: underline; }
    .address { min-height: 35mm; font-size: 13px; line-height: 1.55; }
    .address span { display: block; }
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
        <div class="brand">Kundenrechnung</div>
        <div class="sellerCompany">${escapeHtml(stringValue(seller.companyName) ?? "Dezhost")}</div>
        <div class="seller sellerAddress">${addressLines(seller).map(escapeHtml).join("<br />")}</div>
      </div>
      <div class="seller sellerContact">
        ${seller.vatNumber ? `USt-IdNr. ${escapeHtml(String(seller.vatNumber))}<br />` : ""}
        ${seller.email ? escapeHtml(String(seller.email)) : ""}${seller.phone ? `<br />${escapeHtml(String(seller.phone))}` : ""}
      </div>
    </header>

    <div class="sender">${escapeHtml(senderLine(seller))}</div>
    <section class="address">
      <strong>${escapeHtml(stringValue(buyer.companyName) ?? stringValue(buyer.name) ?? "")}</strong><br />
      ${buyer.companyName && buyer.name ? `<span>${escapeHtml(String(buyer.name))}</span>` : ""}
      ${[buyerAddress.line1, `${stringValue(buyerAddress.postalCode) ?? ""} ${stringValue(buyerAddress.city) ?? ""}`.trim(), buyer.countryCode].filter(Boolean).map((line) => `<span>${escapeHtml(String(line))}</span>`).join("")}
      ${buyer.vatId ? `<span>USt-IdNr. ${escapeHtml(String(buyer.vatId))}</span>` : ""}
    </section>

    <section class="intro">
      <div>
        <h1>Rechnung ${escapeHtml(number)}</h1>
        <p>Vielen Dank fuer Ihren Auftrag. Wir berechnen die folgenden Leistungen gemaess Bestellung.</p>
      </div>
      <div class="meta">
        <span>Rechnungsdatum</span><strong>${escapeHtml(issuedAt)}</strong>
        <span>Fällig am</span><strong>${escapeHtml(dueAt)}</strong>
        ${paidAt ? `<span>Bezahlt am</span><strong>${escapeHtml(paidAt)}</strong>` : ""}
        <span>Kundennummer</span><strong>${escapeHtml(customerNumber)}</strong>
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
  const content = pdfContentFromHtml(html);
  return new Promise<Buffer>((resolve, reject) => {
    const chunks: Buffer[] = [];
    const document = new PDFDocument({
      compress: false,
      info: {
        Creator: "Dezhost invoice PDF renderer",
        Title: content.title
      },
      margins: { bottom: 48, left: 56, right: 56, top: 52 },
      size: "A4"
    });
    document.on("data", (chunk: Buffer) => chunks.push(chunk));
    document.on("end", () => resolve(Buffer.concat(chunks)));
    document.on("error", reject);
    drawInvoicePdf(document, content);
    document.end();
  });
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

type PdfContent = {
  brand: string;
  footer: string[];
  intro: string;
  meta: Array<[string, string]>;
  notes: string[];
  recipient: string[];
  rows: string[][];
  sellerAddress: string[];
  sellerCompany: string;
  sellerContact: string[];
  sender: string;
  tableHeaders: string[];
  title: string;
  totals: Array<[string, string]>;
};

function pdfContentFromHtml(html: string): PdfContent {
  const $ = load(html);
  const clean = (value: string) => value.replace(/\s+/g, " ").trim();
  const text = (selector: string) => clean($(selector).first().text());
  const elementLines = (element: any) => {
    const fragment = $(element).clone();
    fragment.find("br").replaceWith("\n");
    return fragment.text().split("\n").map(clean).filter(Boolean);
  };
  const lineText = (selector: string) => {
    return elementLines($(selector).first());
  };
  const values = (selector: string) => $(selector).toArray().map((element) => clean($(element).text())).filter(Boolean);
  const labels = values(".meta span");
  const metaValues = values(".meta strong");

  return {
    brand: text(".brand"),
    footer: values(".footer div"),
    intro: text(".intro p"),
    meta: labels.map((label, index) => [label, metaValues[index] ?? ""]),
    notes: $(".note").toArray().flatMap((element) => elementLines(element)),
    recipient: [text(".address strong"), ...values(".address span")].filter(Boolean),
    rows: $("table tbody tr").toArray().map((row) => $(row).find("td").toArray().map((cell) => clean($(cell).text()))),
    sellerAddress: lineText(".sellerAddress"),
    sellerCompany: text(".sellerCompany"),
    sellerContact: lineText(".sellerContact"),
    sender: text(".sender"),
    tableHeaders: values("table thead th"),
    title: text("h1"),
    totals: $(".totals div").toArray().map((row) => {
      const parts = $(row).children().toArray().map((element) => clean($(element).text()));
      return [parts[0] ?? "", parts[1] ?? ""];
    })
  };
}

function drawInvoicePdf(document: PDFKit.PDFDocument, content: PdfContent) {
  const left = document.page.margins.left;
  const right = document.page.width - document.page.margins.right;
  const width = right - left;
  const textColor = "#111827";
  const muted = "#4b5563";
  const border = "#d9e2ec";

  document.fillColor(textColor).font("Helvetica-Bold").fontSize(21).text(content.brand, left, 52);
  document.fontSize(11).text(content.sellerCompany, left, 81);
  document.fillColor(muted).font("Helvetica").fontSize(9).text(content.sellerAddress.join("\n"), left, 98, { lineGap: 2 });
  document.text(content.sellerContact.join("\n"), right - 170, 58, { align: "right", lineGap: 2, width: 170 });
  document.moveTo(left, 132).lineTo(right, 132).strokeColor(border).lineWidth(1).stroke();

  document.fillColor(muted).fontSize(8).text(content.sender, left, 155, { underline: true });
  document.fillColor(textColor).fontSize(11).font("Helvetica-Bold").text(content.recipient[0] ?? "", left, 175);
  document.font("Helvetica").text(content.recipient.slice(1).join("\n"), left, 193, { lineGap: 3 });

  document.fillColor(textColor).font("Helvetica-Bold").fontSize(24).text(content.title, left, 262, { width: 278 });
  document.fillColor(muted).font("Helvetica").fontSize(9).text(content.intro, left, 301, { lineGap: 2, width: 278 });

  const metaX = right - 186;
  let metaY = 265;
  content.meta.forEach(([label, value]) => {
    document.fillColor(muted).font("Helvetica").fontSize(8.5).text(label, metaX, metaY, { width: 82 });
    document.fillColor(textColor).font("Helvetica-Bold").text(value, metaX + 88, metaY, { align: "right", width: 98 });
    metaY += 16;
  });

  let y = drawPdfTableHeader(document, content.tableHeaders, left, width, 370, border, textColor);
  for (const row of content.rows) {
    const columns = pdfTableColumns(width);
    document.font("Helvetica").fontSize(9);
    const rowHeight = Math.max(...row.map((value, index) => document.heightOfString(value, { width: columns[index]!.width - 12 })), 10) + 15;
    if (y + rowHeight > document.page.height - 145) {
      document.addPage();
      y = drawPdfTableHeader(document, content.tableHeaders, left, width, document.page.margins.top, border, textColor);
    }
    row.forEach((value, index) => {
      const column = columns[index]!;
      document.fillColor(textColor).font("Helvetica").text(value, left + column.offset + 6, y + 8, {
        align: index >= 3 ? "right" : "left",
        width: column.width - 12
      });
    });
    document.moveTo(left, y + rowHeight).lineTo(left + width, y + rowHeight).strokeColor("#e5e7eb").lineWidth(0.7).stroke();
    y += rowHeight;
  }

  y += 20;
  const totalX = right - 222;
  content.totals.forEach(([label, value], index) => {
    const finalRow = index === content.totals.length - 1;
    if (finalRow) {
      document.moveTo(totalX, y).lineTo(right, y).strokeColor(textColor).lineWidth(1).stroke();
      y += 10;
    }
    document.fillColor(finalRow ? textColor : muted).font(finalRow ? "Helvetica-Bold" : "Helvetica").fontSize(finalRow ? 12 : 10).text(label, totalX, y, { width: 124 });
    document.fillColor(textColor).font("Helvetica-Bold").text(value, totalX + 128, y, { align: "right", width: 94 });
    y += finalRow ? 25 : 19;
  });

  for (const note of content.notes) {
    y = pdfSpace(document, y, 45);
    document.moveTo(left, y).lineTo(right, y).strokeColor(border).lineWidth(0.8).stroke();
    document.fillColor(muted).font("Helvetica").fontSize(9).text(note, left, y + 12, { lineGap: 2, width });
    y += document.heightOfString(note, { lineGap: 2, width }) + 27;
  }

  if (content.footer.length) {
    y = pdfSpace(document, y, 42);
    document.moveTo(left, y).lineTo(right, y).strokeColor(border).lineWidth(0.8).stroke();
    document.fillColor(muted).font("Helvetica").fontSize(8).text(content.footer.join("\n"), left, y + 12, { lineGap: 2, width });
  }
}

function drawPdfTableHeader(document: PDFKit.PDFDocument, headers: string[], left: number, width: number, y: number, border: string, textColor: string) {
  const columns = pdfTableColumns(width);
  document.rect(left, y, width, 30).fill("#f3f6f9");
  headers.forEach((header, index) => {
    const column = columns[index]!;
    document.fillColor(textColor).font("Helvetica-Bold").fontSize(8.5).text(header, left + column.offset + 6, y + 10, {
      align: index >= 3 ? "right" : "left",
      width: column.width - 12
    });
  });
  document.moveTo(left, y + 30).lineTo(left + width, y + 30).strokeColor(border).lineWidth(0.8).stroke();
  return y + 30;
}

function pdfTableColumns(width: number) {
  const ratios = [0.08, 0.33, 0.2, 0.1, 0.145, 0.145];
  let offset = 0;
  return ratios.map((ratio) => {
    const column = { offset, width: width * ratio };
    offset += column.width;
    return column;
  });
}

function pdfSpace(document: PDFKit.PDFDocument, y: number, height: number) {
  if (y + height <= document.page.height - document.page.margins.bottom) {
    return y;
  }
  document.addPage();
  return document.page.margins.top;
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
