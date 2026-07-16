import { formatCustomerNumber } from "@teculiar/shared";
import { load } from "cheerio";
import PDFDocument from "pdfkit";
import { formatDate, formatMoney as fmtMoney, loadDictionary } from "../../common/i18n";

type InvoiceLike = Record<string, any>;
type RenderOptions = { logoUrl?: string; locale?: string };

const PT_PER_MM = 2.834645669;
const mm = (value: number) => value * PT_PER_MM;

export function renderInvoiceDocument(invoice: InvoiceLike, options: RenderOptions = {}) {
  const seller = asRecord(invoice.sellerSnapshot);
  const buyer = asRecord(invoice.customerSnapshot);
  const buyerAddress = asRecord(buyer.address);
  const locale = options.locale || "de";
  const dict = loadDictionary(locale);
  const inv = dict.invoice;
  const currency = stringValue(invoice.currency) ?? "EUR";
  const number = stringValue(invoice.finalInvoiceNumber) ?? stringValue(invoice.tempInvoiceNumber) ?? stringValue(invoice.invoiceNumber) ?? invoice.id;
  // A pending invoice carries a temporary "N-" number (final sequential number is assigned on
  // payment). Flag it so the document warns the customer it is not yet a final invoice.
  const isPending = !invoice.finalInvoiceNumber && String(number).startsWith("N-");
  const issuedAt = formatDate(invoice.issuedAt, locale);
  const dueAt = formatDate(invoice.dueAt, locale);
  const paidAt = invoice.paidAt ? formatDate(invoice.paidAt, locale) : "";
  const paymentMethodLabel = paidAt ? stringValue(invoice.paymentMethodLabel) : undefined;
  const customerNumber = formatCustomerNumber(buyer.customerNumber ?? asRecord(invoice.user).customerNumber);
  const footerLines = Array.isArray(invoice.footerLines) ? invoice.footerLines.filter((line): line is string => typeof line === "string" && line.trim().length > 0) : [];
  const rows = Array.isArray(invoice.items) ? invoice.items : [];
  const taxNote = invoiceTaxNote(invoice, inv);
  const paymentInstructions = stringValue(seller.paymentInstructions);
  const bankDetails = stringValue(seller.bankDetails);
  const showVat = numberValue(invoice.taxAmountCents) > 0;
  const sellerCompany = stringValue(seller.companyName) ?? "Teculiar";
  const logoUrl = stringValue(options.logoUrl);

  const sellerContact = [
    ...addressLines(seller),
    seller.vatNumber ? `${inv.vatId} ${String(seller.vatNumber)}` : "",
    seller.email ? String(seller.email) : "",
    seller.phone ? String(seller.phone) : ""
  ].filter((line): line is string => typeof line === "string" && line.trim().length > 0);

  const html = `<!doctype html>
<html lang="${escapeHtml(locale)}">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${escapeHtml(inv.title)} ${escapeHtml(number)}</title>
  <style>
    :root { color: #1a1a1a; font-family: Arial, Helvetica, sans-serif; }
    * { box-sizing: border-box; }
    body { margin: 0; background: #fff; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    .page { position: relative; width: 210mm; min-height: 297mm; margin: 0 auto; padding: 0 20mm 18mm; background: #fff; }

    /* Top region holds the masthead and the recipient address window. Fixed
       92 mm tall so the invoice body always starts below the window — and the
       address itself is pinned to the DIN 5008 (Form B) position so it lines up
       with a German Fensterumschlag window envelope. */
    .letterhead { position: relative; height: 92mm; }
    .masthead { display: flex; justify-content: space-between; align-items: flex-start; gap: 12mm; padding-top: 15mm; }
    .brandLogo { max-height: 22mm; max-width: 72mm; object-fit: contain; }
    .brand { font-size: 21px; font-weight: 800; letter-spacing: -0.01em; }
    .sellerBlock { text-align: right; color: #555; font-size: 10px; line-height: 1.5; }
    .sellerBlock strong { display: block; color: #1a1a1a; font-size: 11.5px; margin-bottom: 1mm; }

    .addressZone { position: absolute; top: 45mm; left: 25mm; width: 80mm; }
    .sender { color: #777; font-size: 8px; text-decoration: underline; margin-bottom: 2.5mm; }
    .recipient { font-size: 12.5px; line-height: 1.55; }
    .recipient strong { display: block; font-size: 13px; }
    .recipient span { display: block; }

    .docHead { display: flex; justify-content: space-between; align-items: flex-start; gap: 12mm; margin-bottom: 8mm; }
    .docHead h1 { margin: 0 0 2.5mm; font-size: 22px; letter-spacing: -0.01em; }
    .docHead .intro { margin: 0; max-width: 96mm; color: #666; font-size: 10.5px; line-height: 1.55; }
    .meta { display: grid; grid-template-columns: auto auto; gap: 1.6mm 7mm; font-size: 10.5px; white-space: nowrap; }
    .meta span { color: #666; }
    .meta strong { color: #1a1a1a; text-align: right; }

    /* Rounded, border-only table — no fills, so it prints cleanly in black & white. */
    table.items { width: 100%; border-collapse: separate; border-spacing: 0; font-size: 10.5px; border: 1px solid #c9c9c9; border-radius: 11px; overflow: hidden; }
    table.items thead th { text-align: left; padding: 3.4mm 3.4mm; font-size: 8.5px; font-weight: 700; letter-spacing: 0.04em; text-transform: uppercase; color: #555; border-bottom: 1px solid #b8b8b8; }
    table.items tbody td { padding: 2.8mm 3.4mm; border-bottom: 1px solid #ededed; vertical-align: top; }
    table.items tbody tr:last-child td { border-bottom: none; }
    table.items th.num, table.items td.num { text-align: right; white-space: nowrap; }
    table.items td.desc { color: #1a1a1a; }

    .totals { width: 76mm; margin: 7mm 0 8mm auto; }
    .totals > div { display: flex; justify-content: space-between; gap: 8mm; padding: 1.5mm 0; font-size: 11px; color: #555; }
    .totals > div strong { color: #1a1a1a; font-weight: 600; }
    .totals > div:last-child { margin-top: 1.5mm; padding-top: 3mm; border-top: 1.6px solid #1a1a1a; font-size: 13.5px; font-weight: 800; color: #1a1a1a; }
    .totals > div:last-child strong { font-weight: 800; }

    .note { margin-top: 5mm; border: 1px solid #dcdcdc; border-radius: 11px; padding: 4mm 5mm; color: #444; font-size: 10px; line-height: 1.6; }
    .footer { margin-top: 9mm; border-top: 1px solid #dcdcdc; padding-top: 4mm; color: #777; font-size: 9px; line-height: 1.55; }
  </style>
</head>
<body>
  <main class="page">
    <div class="letterhead">
      <header class="masthead">
        ${logoUrl ? `<img class="brandLogo" src="${escapeHtml(logoUrl)}" alt="${escapeHtml(sellerCompany)}" />` : `<div class="brand">${escapeHtml(sellerCompany)}</div>`}
        <div class="sellerBlock">
          <strong>${escapeHtml(sellerCompany)}</strong>
          ${sellerContact.map((line) => escapeHtml(line)).join("<br />")}
        </div>
      </header>

      <section class="addressZone">
        <div class="sender">${escapeHtml(senderLine(seller))}</div>
        <div class="recipient">
          <strong>${escapeHtml(stringValue(buyer.companyName) ?? stringValue(buyer.name) ?? "")}</strong>
          ${buyer.companyName && buyer.name ? `<span>${escapeHtml(String(buyer.name))}</span>` : ""}
          ${[buyerAddress.line1, `${stringValue(buyerAddress.postalCode) ?? ""} ${stringValue(buyerAddress.city) ?? ""}`.trim(), buyer.countryCode].filter(Boolean).map((line) => `<span>${escapeHtml(String(line))}</span>`).join("")}
          ${buyer.vatId ? `<span>${escapeHtml(inv.vatId)} ${escapeHtml(String(buyer.vatId))}</span>` : ""}
        </div>
      </section>
    </div>

    <section class="docHead">
      <div>
        <h1>${escapeHtml(inv.title)} ${escapeHtml(number)}</h1>
        <p class="intro">${escapeHtml(inv.intro)}</p>
      </div>
      <div class="meta">
        <span>${escapeHtml(inv.meta.invoiceDate)}</span><strong>${escapeHtml(issuedAt)}</strong>
        <span>${escapeHtml(inv.meta.dueDate)}</span><strong>${escapeHtml(dueAt)}</strong>
        ${paidAt ? `<span>${escapeHtml(inv.meta.paidDate)}</span><strong>${escapeHtml(paidAt)}</strong>` : ""}
        ${paymentMethodLabel ? `<span>${escapeHtml(inv.meta.paymentMethod)}</span><strong>${escapeHtml(paymentMethodLabel)}</strong>` : ""}
        <span>${escapeHtml(inv.meta.customerNumber)}</span><strong>${escapeHtml(customerNumber)}</strong>
      </div>
    </section>

    <table class="items">
      <thead>
        <tr><th>${escapeHtml(inv.table.position)}</th><th>${escapeHtml(inv.table.description)}</th><th>${escapeHtml(inv.table.period)}</th><th class="num">${escapeHtml(inv.table.quantity)}</th><th class="num">${escapeHtml(inv.table.unitPrice)}</th><th class="num">${escapeHtml(inv.table.total)}</th></tr>
      </thead>
      <tbody>
        ${rows.map((item, index) => invoiceRow(item, index, currency, locale)).join("")}
      </tbody>
    </table>

    <section class="totals">
      <div><span>${escapeHtml(inv.totals.subtotal)}</span><strong>${escapeHtml(fmtMoney(numberValue(invoice.subtotalCents ?? invoice.totalCents), currency, locale))}</strong></div>
      ${numberValue(invoice.discountCents) > 0 ? `<div><span>${escapeHtml(inv.totals.discount)}</span><strong>-${escapeHtml(fmtMoney(numberValue(invoice.discountCents), currency, locale))}</strong></div>` : ""}
      ${showVat ? `<div><span>${escapeHtml(inv.totals.vat)}</span><strong>${escapeHtml(fmtMoney(numberValue(invoice.taxAmountCents), currency, locale))}</strong></div>` : ""}
      <div><span>${escapeHtml(inv.totals.grandTotal)}</span><strong>${escapeHtml(fmtMoney(numberValue(invoice.totalCents), currency, locale))}</strong></div>
    </section>

    ${isPending ? `<section class="note">${escapeHtml(inv.pendingNotice)}</section>` : ""}
    ${taxNote ? `<section class="note">${escapeHtml(taxNote)}</section>` : ""}
    ${(paymentInstructions || bankDetails) ? `<section class="note">${paymentInstructions ? `${multilineHtml(paymentInstructions)}${bankDetails ? "<br />" : ""}` : ""}${bankDetails ? multilineHtml(bankDetails) : ""}</section>` : ""}
    ${footerLines.length ? `<footer class="footer">${footerLines.map((line) => `<div>${escapeHtml(line)}</div>`).join("")}</footer>` : ""}
  </main>
</body>
</html>`;

  return { fileName: `invoice-${number}.html`, html };
}

export function renderInvoicePdfFromHtml(html: string, logoImage?: Buffer) {
  const content = pdfContentFromHtml(html);
  return new Promise<Buffer>((resolve, reject) => {
    const chunks: Buffer[] = [];
    const document = new PDFDocument({
      compress: false,
      info: {
        Creator: "Teculiar invoice PDF renderer",
        Title: content.title
      },
      margins: { bottom: 48, left: 56, right: 56, top: 52 },
      size: "A4"
    });
    document.on("data", (chunk: Buffer) => chunks.push(chunk));
    document.on("end", () => resolve(Buffer.concat(chunks)));
    document.on("error", reject);
    drawInvoicePdf(document, content, logoImage);
    document.end();
  });
}

function invoiceRow(item: Record<string, any>, index: number, currency: string, locale: string) {
  const start = item.servicePeriodStart ? formatDate(item.servicePeriodStart, locale) : "";
  const end = item.servicePeriodEnd ? formatDate(item.servicePeriodEnd, locale) : "";
  const period = start || end ? [start, end].filter(Boolean).join(" – ") : cycleLabel(item.billingCycle, locale);
  return `<tr>
    <td>${index + 1}</td>
    <td class="desc">${escapeHtml(String(item.description ?? ""))}</td>
    <td>${escapeHtml(period)}</td>
    <td class="num">${escapeHtml(String(item.quantity ?? 1))}</td>
    <td class="num">${escapeHtml(fmtMoney(numberValue(item.unitAmountCents), currency, locale))}</td>
    <td class="num">${escapeHtml(fmtMoney(numberValue(item.totalCents), currency, locale))}</td>
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
  const lineText = (selector: string) => elementLines($(selector).first());
  const values = (selector: string) => $(selector).toArray().map((element) => clean($(element).text())).filter(Boolean);
  const labels = values(".meta span");
  const metaValues = values(".meta strong");

  return {
    brand: text(".brand"),
    footer: values(".footer div"),
    intro: text(".intro"),
    meta: labels.map((label, index) => [label, metaValues[index] ?? ""]),
    // One entry per .note section, keeping its internal line breaks (bank details etc.)
    // so the PDF draws one box per note instead of one box per line.
    notes: $(".note").toArray().map((element) => elementLines(element).join("\n")).filter(Boolean),
    recipient: [text(".recipient strong"), ...values(".recipient span")].filter(Boolean),
    rows: $("table.items tbody tr").toArray().map((row) => $(row).find("td").toArray().map((cell) => clean($(cell).text()))),
    sellerCompany: text(".sellerBlock strong"),
    sellerContact: lineText(".sellerBlock").slice(1),
    sender: text(".sender"),
    tableHeaders: values("table.items thead th"),
    title: text("h1"),
    totals: $(".totals > div").toArray().map((row) => {
      const parts = $(row).children().toArray().map((element) => clean($(element).text()));
      return [parts[0] ?? "", parts[1] ?? ""];
    })
  };
}

function drawInvoicePdf(document: PDFKit.PDFDocument, content: PdfContent, logoImage?: Buffer) {
  const left = document.page.margins.left;
  const right = document.page.width - document.page.margins.right;
  const width = right - left;
  const ink = "#1a1a1a";
  const muted = "#666666";
  const line = "#c9c9c9";
  const lineSoft = "#ededed";

  // ── Masthead: logo (or company name) left, full seller block right ──
  const topY = mm(14);
  let drewLogo = false;
  if (logoImage) {
    try {
      document.image(logoImage, left, topY, { fit: [mm(62), mm(20)] });
      drewLogo = true;
    } catch {
      drewLogo = false;
    }
  }
  if (!drewLogo) {
    document.fillColor(ink).font("Helvetica-Bold").fontSize(20).text(content.sellerCompany || content.brand, left, topY);
  }
  const sellerW = mm(76);
  document.fillColor(ink).font("Helvetica-Bold").fontSize(10.5).text(content.sellerCompany, right - sellerW, topY, { align: "right", width: sellerW });
  if (content.sellerContact.length) {
    document.fillColor(muted).font("Helvetica").fontSize(8.5).text(content.sellerContact.join("\n"), right - sellerW, document.y + 1.5, { align: "right", width: sellerW, lineGap: 1.5 });
  }

  // ── Recipient address window — fixed to the DIN 5008 Form B position ──
  const addrX = mm(25);
  const addrW = mm(80);
  document.fillColor(muted).font("Helvetica").fontSize(7.5).text(content.sender, addrX, mm(45), { underline: true, width: addrW });
  document.fillColor(ink).font("Helvetica-Bold").fontSize(11).text(content.recipient[0] ?? "", addrX, mm(50), { width: addrW });
  if (content.recipient.length > 1) {
    document.font("Helvetica").fontSize(10.5).text(content.recipient.slice(1).join("\n"), addrX, document.y + 1.5, { width: addrW, lineGap: 2 });
  }

  // ── Document head: title + intro (left), meta (right) — start below the window ──
  const headY = mm(92);
  document.fillColor(ink).font("Helvetica-Bold").fontSize(20).text(content.title, left, headY, { width: mm(96) });
  if (content.intro) {
    document.fillColor(muted).font("Helvetica").fontSize(9).text(content.intro, left, document.y + 3, { width: mm(96), lineGap: 1.5 });
  }
  const leftBottom = document.y;

  const metaW = mm(72);
  const metaX = right - metaW;
  const metaLabelW = metaW * 0.44;
  const metaValueW = metaW - metaLabelW;
  let metaY = headY;
  content.meta.forEach(([label, value]) => {
    // Advance by the taller of the two cells so a long, admin-defined value (e.g. a
    // payment method name) that wraps to a second line never overlaps the next row.
    document.font("Helvetica").fontSize(9);
    const labelH = document.heightOfString(label, { width: metaLabelW });
    document.font("Helvetica-Bold").fontSize(9);
    const valueH = document.heightOfString(value, { width: metaValueW });
    document.fillColor(muted).font("Helvetica").fontSize(9).text(label, metaX, metaY, { width: metaLabelW });
    document.fillColor(ink).font("Helvetica-Bold").fontSize(9).text(value, metaX + metaLabelW, metaY, { align: "right", width: metaValueW });
    metaY += Math.max(labelH, valueH, 10.5) + 4;
  });

  let y = Math.max(leftBottom, metaY) + mm(7);

  // ── Items table (rounded, border-only) ──
  y = drawPdfTable(document, content, left, width, y, { ink, muted, line, lineSoft });

  // ── Totals ──
  y += mm(6);
  const totalX = right - mm(76);
  content.totals.forEach(([label, value], index) => {
    const finalRow = index === content.totals.length - 1;
    if (finalRow) {
      document.moveTo(totalX, y).lineTo(right, y).strokeColor(ink).lineWidth(1.2).stroke();
      y += 9;
    }
    document.fillColor(finalRow ? ink : muted).font(finalRow ? "Helvetica-Bold" : "Helvetica").fontSize(finalRow ? 12.5 : 10).text(label, totalX, y, { width: mm(44) });
    document.fillColor(ink).font("Helvetica-Bold").fontSize(finalRow ? 12.5 : 10).text(value, totalX + mm(44), y, { align: "right", width: mm(32) });
    y += finalRow ? 24 : 18;
  });

  // ── Notes ──
  const notePadY = 11;
  const noteLineGap = 2;
  const noteInnerW = width - 24;
  for (const note of content.notes) {
    y = pdfSpace(document, y, 48);
    // Measure with the same font the text is drawn in, then trim the descender +
    // line-gap slack pdfkit reserves below the final baseline so the ink (which has
    // no descenders in these notes) sits optically centred in the rounded box.
    document.font("Helvetica").fontSize(9);
    const textHeight = document.heightOfString(note, { lineGap: noteLineGap, width: noteInnerW });
    const noteHeight = textHeight - 4 + notePadY * 2;
    document.roundedRect(left, y, width, noteHeight, 10).strokeColor(line).lineWidth(0.8).stroke();
    document.fillColor("#444444").text(note, left + 12, y + notePadY, { lineGap: noteLineGap, width: noteInnerW });
    y += noteHeight + 8;
  }

  // ── Footer ──
  if (content.footer.length) {
    y = pdfSpace(document, y, 44);
    document.moveTo(left, y).lineTo(right, y).strokeColor(line).lineWidth(0.8).stroke();
    document.fillColor(muted).font("Helvetica").fontSize(8).text(content.footer.join("\n"), left, y + 12, { lineGap: 2, width });
  }
}

function drawPdfTable(
  document: PDFKit.PDFDocument,
  content: PdfContent,
  left: number,
  width: number,
  top: number,
  colors: { ink: string; muted: string; line: string; lineSoft: string }
) {
  const columns = pdfTableColumns(width);
  const headerHeight = 26;

  const drawHeader = (y: number) => {
    content.tableHeaders.forEach((header, index) => {
      const column = columns[index]!;
      document.fillColor(colors.muted).font("Helvetica-Bold").fontSize(8).text(header.toUpperCase(), left + column.offset + 9, y + 9, {
        align: index >= 3 ? "right" : "left",
        characterSpacing: 0.2,
        lineBreak: false,
        width: column.width - 18
      });
    });
    document.moveTo(left, y + headerHeight).lineTo(left + width, y + headerHeight).strokeColor(colors.line).lineWidth(0.8).stroke();
    return y + headerHeight;
  };

  let y = top;
  let sectionTop = top;
  let paged = false;
  y = drawHeader(y);

  content.rows.forEach((row, rowIndex) => {
    document.font("Helvetica").fontSize(9);
    const rowHeight = Math.max(...row.map((value, index) => document.heightOfString(value, { width: columns[index]!.width - 18 })), 10) + 14;
    if (y + rowHeight > document.page.height - mm(38)) {
      if (!paged) {
        document.roundedRect(left, sectionTop, width, y - sectionTop, 10).strokeColor(colors.line).lineWidth(0.8).stroke();
      }
      document.addPage();
      paged = true;
      y = document.page.margins.top;
      sectionTop = y;
      y = drawHeader(y);
    }
    row.forEach((value, index) => {
      const column = columns[index]!;
      document.fillColor(index === 1 ? colors.ink : "#3a3a3a").font("Helvetica").fontSize(9).text(value, left + column.offset + 9, y + 8, {
        align: index >= 3 ? "right" : "left",
        width: column.width - 18
      });
    });
    y += rowHeight;
    if (rowIndex < content.rows.length - 1) {
      document.moveTo(left + 6, y).lineTo(left + width - 6, y).strokeColor(colors.lineSoft).lineWidth(0.6).stroke();
    }
  });

  document.roundedRect(left, sectionTop, width, y - sectionTop, 10).strokeColor(colors.line).lineWidth(0.8).stroke();
  return y;
}

function pdfTableColumns(width: number) {
  // Widths tuned so the upper-cased German headers ("EINZELPREIS", "MENGE", "POS.")
  // never wrap onto a second line at the header font size below.
  const ratios = [0.085, 0.33, 0.165, 0.105, 0.1575, 0.1575];
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

// Internal resolveVat() reasons that must never print on a customer document — most
// importantly the admin's global "VAT disabled" switch.
const INTERNAL_TAX_REASONS = new Set(["VAT disabled", "VAT", "No VAT"]);

// The customer-facing tax note. Legally meaningful zero-VAT reasons print localized
// (reverse charge / export); a custom/legacy reason (e.g. Kleinunternehmerregelung) prints
// as stored; internal engine reasons are suppressed.
function invoiceTaxNote(invoice: InvoiceLike, inv: { taxNotes?: { reverseCharge?: string; nonEuExport?: string } }): string | undefined {
  if (numberValue(invoice.taxAmountCents) > 0) {
    return undefined;
  }
  if (invoice.reverseCharge) {
    return inv.taxNotes?.reverseCharge;
  }
  const reason = stringValue(invoice.taxReason);
  if (!reason || INTERNAL_TAX_REASONS.has(reason)) {
    return undefined;
  }
  if (reason === "EU reverse charge") {
    return inv.taxNotes?.reverseCharge;
  }
  if (reason === "Non-EU export") {
    return inv.taxNotes?.nonEuExport;
  }
  return reason;
}

// Admin-entered notes (payment instructions, bank details) keep their line breaks.
function multilineHtml(value: string) {
  return value.split(/\r?\n/).map((line) => escapeHtml(line)).join("<br />");
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

function cycleLabel(value: unknown, locale: string) {
  if (typeof value !== "string" || !value) {
    return "-";
  }
  const labels = loadDictionary(locale).common.billingCycle as Record<string, string>;
  return labels[value] ?? value.replace(/_/g, " ").toLowerCase();
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
