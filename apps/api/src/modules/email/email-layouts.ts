import type { Dictionary } from "../../common/i18n";

// The localized `email` namespace from a loaded dictionary (English baked in per key).
export type EmailDict = Dictionary["email"];

export type EmailLayoutBlockType = "button" | "divider" | "invoiceTable" | "keyValueTable" | "link" | "notice" | "text";

export type EmailLayoutBlock = {
  columns?: string[];
  content?: string;
  href?: string;
  id: string;
  rows?: Array<{ cells?: string[]; label?: string; value?: string }>;
  title?: string;
  tone?: "danger" | "default" | "success" | "warning";
  type: EmailLayoutBlockType;
};

// The admin block palette, labelled in the store's language.
export function emailLayoutBlockLibrary(email: EmailDict): Array<{ description: string; label: string; type: EmailLayoutBlockType }> {
  const b = email.blockLibrary;
  return [
    { description: b.text.description, label: b.text.label, type: "text" },
    { description: b.keyValueTable.description, label: b.keyValueTable.label, type: "keyValueTable" },
    { description: b.invoiceTable.description, label: b.invoiceTable.label, type: "invoiceTable" },
    { description: b.button.description, label: b.button.label, type: "button" },
    { description: b.link.description, label: b.link.label, type: "link" },
    { description: b.notice.description, label: b.notice.label, type: "notice" },
    { description: b.divider.description, label: b.divider.label, type: "divider" }
  ];
}

// Builds the per-event default layouts from a localized `email` pack. Layout-block copy,
// table titles and status labels all read from the pack so a default email renders in the
// recipient's language; admin-saved overrides (stored verbatim) bypass this.
function buildDefaultLayouts(email: EmailDict): Record<string, EmailLayoutBlock[]> {
  const L = email.labels;
  const lay = email.layout;
  const invoiceSummaryBlocks = (prefix: string): EmailLayoutBlock[] => [
    keyValueTable(`${prefix}-summary`, lay.invoiceSummary.title, [
      [L.invoice, "{{invoice_number}}"],
      [L.total, "{{invoice_total_amount}}"],
      [L.dueDate, "{{invoice_due_date}}"]
    ]),
    {
      columns: [L.service, L.amount],
      id: `${prefix}-lines`,
      rows: [{ cells: ["{{service}}", "{{invoice_total_amount}}"] }],
      title: lay.invoiceSummary.linesTitle,
      type: "invoiceTable"
    }
  ];
  return {
    domain_information: [
      text("domain-intro", lay.domain_information.intro),
      keyValueTable("domain-summary", lay.domain_information.summaryTitle, [
        [L.domain, "{{domain}}"],
        [L.status, "{{resellbiz_domain_status}}"],
        [L.nameServers, "{{resellbiz_nameservers}}"]
      ]),
      button("domain-button", lay.domain_information.button, "{{domain_link}}"),
      notice("domain-note", lay.domain_information.note)
    ],
    hosting_account_information: [
      text("hosting-intro", lay.hosting_account_information.intro),
      keyValueTable("hosting-summary", lay.hosting_account_information.summaryTitle, [
        [L.service, "{{service}}"],
        [L.domain, "{{domain}}"],
        [L.status, L.active]
      ]),
      keyValueTable("hosting-access", lay.hosting_account_information.accessTitle, [
        [L.address, "{{virtualmin_control_panel_url}}"],
        [L.username, "{{virtualmin_control_panel_username}}"],
        [L.password, "{{virtualmin_control_panel_password}}"]
      ]),
      keyValueTable("hosting-mail", lay.hosting_account_information.mailTitle, [
        [L.mailServer, "{{virtualmin_mail_server}}"],
        [L.imapPort, "{{virtualmin_imap_port}}"],
        [L.smtpPort, "{{virtualmin_smtp_port}}"]
      ]),
      button("hosting-button", lay.hosting_account_information.button, "{{service_link}}"),
      notice("hosting-note", lay.hosting_account_information.note, "warning")
    ],
    hosting_account_suspended: [
      text("hosting-suspended-intro", lay.hosting_account_suspended.intro),
      keyValueTable("hosting-suspended-summary", lay.hosting_account_suspended.summaryTitle, [
        [L.service, "{{service}}"],
        [L.domain, "{{domain}}"],
        [L.status, L.suspended]
      ]),
      notice("hosting-suspended-note", lay.hosting_account_suspended.note, "warning")
    ],
    hosting_account_terminated: [
      text("hosting-terminated-intro", lay.hosting_account_terminated.intro),
      keyValueTable("hosting-terminated-summary", lay.hosting_account_terminated.summaryTitle, [
        [L.service, "{{service}}"],
        [L.domain, "{{domain}}"],
        [L.status, L.terminated]
      ]),
      notice("hosting-terminated-note", lay.hosting_account_terminated.note, "danger")
    ],
    invoice_reminder: [
      text("invoice-reminder-intro", lay.invoice_reminder.intro),
      ...invoiceSummaryBlocks("invoice-reminder"),
      button("invoice-reminder-button", lay.invoice_reminder.button, "{{invoice_link}}")
    ],
    new_invoice: [
      text("new-invoice-intro", lay.new_invoice.intro),
      ...invoiceSummaryBlocks("new-invoice"),
      button("new-invoice-button", lay.new_invoice.button, "{{invoice_link}}")
    ],
    order_confirmation: [
      text("order-confirmation-intro", lay.order_confirmation.intro),
      keyValueTable("order-confirmation-summary", lay.order_confirmation.summaryTitle, [
        [L.order, "{{order_number}}"],
        [L.total, "{{invoice_total_amount}}"],
        [L.service, "{{service}}"],
        [L.domain, "{{domain}}"]
      ])
    ],
    password_reset: [
      text("password-reset-intro", lay.password_reset.intro),
      button("password-reset-button", lay.password_reset.button, "{{password_reset_link}}"),
      notice("password-reset-note", lay.password_reset.note)
    ],
    payment_successful: [
      text("payment-successful-intro", lay.payment_successful.intro),
      ...invoiceSummaryBlocks("payment-successful"),
      notice("payment-successful-note", lay.payment_successful.note, "success")
    ],
    refund_request_sent: [
      text("refund-intro", lay.refund_request_sent.intro),
      ...invoiceSummaryBlocks("refund"),
      notice("refund-note", lay.refund_request_sent.note)
    ],
    ticket_answered: [
      text("ticket-answered-intro", lay.ticket_answered.intro),
      keyValueTable("ticket-answered-summary", lay.ticket_answered.summaryTitle, [
        [L.ticket, "#{{ticket_id}}"],
        [L.subject, "{{ticket_subject}}"],
        [L.status, "{{ticket_status}}"]
      ]),
      notice("ticket-answer", "{{ticket_reply}}")
    ],
    ticket_closed: [
      text("ticket-closed-intro", lay.ticket_closed.intro),
      keyValueTable("ticket-closed-summary", lay.ticket_closed.summaryTitle, [
        [L.ticket, "#{{ticket_id}}"],
        [L.subject, "{{ticket_subject}}"],
        [L.status, "{{ticket_status}}"]
      ])
    ],
    ticket_opened: [
      text("ticket-opened-intro", lay.ticket_opened.intro),
      keyValueTable("ticket-opened-summary", lay.ticket_opened.summaryTitle, [
        [L.ticket, "#{{ticket_id}}"],
        [L.subject, "{{ticket_subject}}"],
        [L.status, "{{ticket_status}}"]
      ]),
      notice("ticket-content", "{{ticket_content}}")
    ],
    welcome: [
      text("welcome-intro", lay.welcome.intro),
      keyValueTable("welcome-summary", lay.welcome.summaryTitle, [
        [L.customer, "{{customer_name}}"],
        [L.email, "{{customer_email}}"]
      ])
    ]
  };
}

export function defaultEmailLayout(eventKey: string, fallbackBody: string, email: EmailDict) {
  return cloneBlocks(buildDefaultLayouts(email)[eventKey] ?? [text(`${eventKey}-body`, fallbackBody)]);
}

export function normalizeEmailLayoutBlocks(value: unknown, eventKey: string, fallbackBody: string, email: EmailDict) {
  if (!Array.isArray(value) || !value.length) {
    return defaultEmailLayout(eventKey, fallbackBody, email);
  }
  const blocks = value.map((item, index) => normalizeBlock(item, eventKey, index)).filter(Boolean) as EmailLayoutBlock[];
  return blocks.length ? blocks : defaultEmailLayout(eventKey, fallbackBody, email);
}

export function renderEmailLayout(blocks: EmailLayoutBlock[], context: Record<string, string>) {
  return blocks.map((block) => renderBlock(block, context)).join("");
}

function text(id: string, content: string): EmailLayoutBlock {
  return { content, id, type: "text" };
}

function keyValueTable(id: string, title: string, rows: string[][]): EmailLayoutBlock {
  return { id, rows: rows.map(([label, value]) => ({ label, value })), title, type: "keyValueTable" };
}

function button(id: string, content: string, href: string): EmailLayoutBlock {
  return { content, href, id, type: "button" };
}

function notice(id: string, content: string, tone: EmailLayoutBlock["tone"] = "default"): EmailLayoutBlock {
  return { content, id, tone, type: "notice" };
}

function cloneBlocks(blocks: EmailLayoutBlock[]) {
  return blocks.map((block) => ({
    ...block,
    columns: block.columns ? [...block.columns] : undefined,
    rows: block.rows?.map((row) => ({ ...row, cells: row.cells ? [...row.cells] : undefined }))
  }));
}

function normalizeBlock(value: unknown, eventKey: string, index: number): EmailLayoutBlock | null {
  if (!isRecord(value)) {
    return null;
  }
  const type = emailLayoutBlockType(value.type);
  if (!type) {
    return null;
  }
  const rows = Array.isArray(value.rows)
    ? value.rows.map((row) => isRecord(row) ? {
      cells: Array.isArray(row.cells) ? row.cells.map((cell) => String(cell ?? "")) : undefined,
      label: typeof row.label === "string" ? row.label : undefined,
      value: typeof row.value === "string" ? row.value : undefined
    } : null).filter(Boolean) as EmailLayoutBlock["rows"]
    : undefined;
  return {
    columns: Array.isArray(value.columns) ? value.columns.map((column) => String(column ?? "")) : undefined,
    content: typeof value.content === "string" ? value.content : undefined,
    href: typeof value.href === "string" ? value.href : undefined,
    id: typeof value.id === "string" && value.id ? value.id : `${eventKey}-${type}-${index}`,
    rows,
    title: typeof value.title === "string" ? value.title : undefined,
    tone: emailLayoutTone(value.tone),
    type
  };
}

function renderBlock(block: EmailLayoutBlock, context: Record<string, string>) {
  if (block.type === "divider") {
    return `<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin:24px 0;"><tr><td style="border-top:1px solid #dde5ef;font-size:0;line-height:0;">&nbsp;</td></tr></table>`;
  }
  if (block.type === "button") {
    const href = renderAttribute(block.href || "#", context);
    return `<table role="presentation" cellspacing="0" cellpadding="0" style="margin:24px 0;"><tr><td style="border-radius:8px;background:#0077b6;"><a href="${href}" style="display:inline-block;padding:14px 26px;color:#ffffff;font-size:15px;font-weight:800;text-decoration:none;">${renderInline(block.content || "Open", context)}</a></td></tr></table>`;
  }
  if (block.type === "link") {
    const href = renderAttribute(block.href || "#", context);
    return `<div style="margin:0 0 18px;color:#172033;font-size:16px;line-height:1.65;"><a href="${href}" style="color:#0b3d91;font-weight:600;text-decoration:underline;">${renderInline(block.content || block.href || "Link", context)}</a></div>`;
  }
  if (block.type === "invoiceTable") {
    return renderDataTable(block, context);
  }
  if (block.type === "keyValueTable") {
    return renderKeyValueTable(block, context);
  }
  if (block.type === "notice") {
    const colors = toneColors(block.tone);
    return `<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin:20px 0;border:1px solid ${colors.border};border-radius:8px;background:${colors.background};"><tr><td style="padding:14px 16px;color:${colors.text};font-size:14px;line-height:1.6;">${renderInline(block.content || "", context)}</td></tr></table>`;
  }
  return `<div style="margin:0 0 18px;color:#172033;font-size:16px;line-height:1.65;">${renderInline(block.content || "", context)}</div>`;
}

function renderKeyValueTable(block: EmailLayoutBlock, context: Record<string, string>) {
  const rows = (block.rows ?? []).map((row) => `<tr><td style="padding:12px 14px;color:#5b6575;font-size:13px;border-top:1px solid #e6edf5;">${renderInline(row.label || "", context)}</td><td align="right" style="padding:12px 14px;color:#172033;font-size:14px;font-weight:700;border-top:1px solid #e6edf5;">${renderInline(row.value || "", context)}</td></tr>`).join("");
  return `<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin:22px 0;border:1px solid #e5ebf2;border-radius:10px;border-collapse:separate;border-spacing:0;overflow:hidden;"><tr><td colspan="2" style="padding:12px 16px;background:#f4f8fc;color:#0b2140;font-size:12px;font-weight:800;letter-spacing:.06em;text-transform:uppercase;">${renderInline(block.title || "Details", context)}</td></tr>${rows}</table>`;
}

function renderDataTable(block: EmailLayoutBlock, context: Record<string, string>) {
  const columns = block.columns?.length ? block.columns : ["Description", "Amount"];
  const heading = `<tr>${columns.map((column) => `<th align="left" style="padding:12px 14px;background:#f8fafc;color:#5b6575;font-size:12px;text-transform:uppercase;">${renderInline(column, context)}</th>`).join("")}</tr>`;
  const rows = (block.rows ?? []).map((row) => `<tr>${(row.cells ?? []).map((cell) => `<td style="padding:13px 14px;color:#172033;font-size:14px;border-top:1px solid #e6edf5;">${renderInline(cell, context)}</td>`).join("")}</tr>`).join("");
  return `<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin:22px 0;border:1px solid #dde5ef;border-radius:8px;border-collapse:separate;border-spacing:0;overflow:hidden;"><caption style="padding:0 0 8px;text-align:left;color:#172033;font-size:15px;font-weight:700;">${renderInline(block.title || "Items", context)}</caption>${heading}${rows}</table>`;
}

function renderInline(value: string, context: Record<string, string>) {
  return value.replace(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g, (_, key: string) => escapeHtml(context[key] ?? "").replace(/\n/g, "<br />"));
}

function renderAttribute(value: string, context: Record<string, string>) {
  return renderInline(value, context).replace(/"/g, "&quot;");
}

function emailLayoutBlockType(value: unknown): EmailLayoutBlockType | null {
  return value === "button" || value === "divider" || value === "invoiceTable" || value === "keyValueTable" || value === "link" || value === "notice" || value === "text" ? value : null;
}

function emailLayoutTone(value: unknown): EmailLayoutBlock["tone"] {
  return value === "danger" || value === "success" || value === "warning" ? value : "default";
}

function toneColors(tone: EmailLayoutBlock["tone"]) {
  if (tone === "danger") {
    return { background: "#fff5f5", border: "#fecaca", text: "#7f1d1d" };
  }
  if (tone === "success") {
    return { background: "#f0fdf4", border: "#bbf7d0", text: "#14532d" };
  }
  if (tone === "warning") {
    return { background: "#fffbeb", border: "#fde68a", text: "#713f12" };
  }
  return { background: "#f8fafc", border: "#dde5ef", text: "#334155" };
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
