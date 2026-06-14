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

export const EMAIL_LAYOUT_BLOCK_LIBRARY: Array<{ description: string; label: string; type: EmailLayoutBlockType }> = [
  { description: "Rich copy with placeholders.", label: "Text", type: "text" },
  { description: "Two-column facts such as invoice number and total.", label: "Key/value table", type: "keyValueTable" },
  { description: "Email-safe line item table.", label: "Invoice table", type: "invoiceTable" },
  { description: "Primary call-to-action button.", label: "Button", type: "button" },
  { description: "Inline text hyperlink.", label: "Link", type: "link" },
  { description: "Highlighted compliance or status note.", label: "Notice", type: "notice" },
  { description: "Thin visual break.", label: "Divider", type: "divider" }
];

const DEFAULT_EMAIL_LAYOUTS: Record<string, EmailLayoutBlock[]> = {
  domain_information: [
    text("domain-intro", "Hello {{customer_name}},<br /><br />your domain {{domain}} has been registered and is now active."),
    keyValueTable("domain-summary", "Domain", [
      ["Domain", "{{domain}}"],
      ["Status", "{{resellbiz_domain_status}}"],
      ["Name servers", "{{resellbiz_nameservers}}"]
    ]),
    button("domain-button", "Manage domain", "{{domain_link}}"),
    notice("domain-note", "Keep your domain contact data current to avoid registry compliance issues.")
  ],
  hosting_account_information: [
    text("hosting-intro", "Hello {{customer_name}},<br /><br />your hosting account is active. Use the control panel details below to sign in."),
    keyValueTable("hosting-summary", "Hosting account", [
      ["Service", "{{service}}"],
      ["Domain", "{{domain}}"],
      ["Status", "Active"]
    ]),
    keyValueTable("hosting-access", "Control panel access", [
      ["Address", "{{virtualmin_control_panel_url}}"],
      ["Username", "{{virtualmin_control_panel_username}}"],
      ["Password", "{{virtualmin_control_panel_password}}"]
    ]),
    keyValueTable("hosting-mail", "Email settings", [
      ["Mail server", "{{virtualmin_mail_server}}"],
      ["IMAP port", "{{virtualmin_imap_port}}"],
      ["SMTP port", "{{virtualmin_smtp_port}}"]
    ]),
    button("hosting-button", "Open hosting service", "{{service_link}}"),
    notice("hosting-note", "For your security, sign in and change this password after your first login.", "warning")
  ],
  hosting_account_suspended: [
    text("hosting-suspended-intro", "Hello {{customer_name}},<br /><br />your hosting service has been suspended."),
    keyValueTable("hosting-suspended-summary", "Service status", [
      ["Service", "{{service}}"],
      ["Domain", "{{domain}}"],
      ["Status", "Suspended"]
    ]),
    notice("hosting-suspended-note", "Contact support if you believe this suspension is incorrect.", "warning")
  ],
  hosting_account_terminated: [
    text("hosting-terminated-intro", "Hello {{customer_name}},<br /><br />your hosting service has been terminated."),
    keyValueTable("hosting-terminated-summary", "Service status", [
      ["Service", "{{service}}"],
      ["Domain", "{{domain}}"],
      ["Status", "Terminated"]
    ]),
    notice("hosting-terminated-note", "Backups and retained data depend on your service terms.", "danger")
  ],
  invoice_reminder: [
    text("invoice-reminder-intro", "Hello {{customer_name}},<br /><br />this is a friendly reminder that your invoice is due."),
    invoiceSummaryBlocks("invoice-reminder"),
    button("invoice-reminder-button", "Pay invoice", "{{invoice_link}}")
  ].flat(),
  new_invoice: [
    text("new-invoice-intro", "Hello {{customer_name}},<br /><br />a new invoice has been generated for your account."),
    invoiceSummaryBlocks("new-invoice"),
    button("new-invoice-button", "View invoice", "{{invoice_link}}")
  ].flat(),
  order_confirmation: [
    text("order-confirmation-intro", "Hello {{customer_name}},<br /><br />your order was registered successfully."),
    keyValueTable("order-confirmation-summary", "Order summary", [
      ["Order", "{{order_number}}"],
      ["Total", "{{invoice_total_amount}}"],
      ["Service", "{{service}}"],
      ["Domain", "{{domain}}"]
    ])
  ],
  password_reset: [
    text("password-reset-intro", "Hello {{customer_name}},<br /><br />use the secure link below to reset your password."),
    button("password-reset-button", "Reset password", "{{password_reset_link}}"),
    notice("password-reset-note", "Ignore this email if you did not request a password reset.")
  ],
  payment_successful: [
    text("payment-successful-intro", "Hello {{customer_name}},<br /><br />we received your payment. Thank you."),
    invoiceSummaryBlocks("payment-successful"),
    notice("payment-successful-note", "Paid invoices are stored in your client dashboard.", "success")
  ].flat(),
  refund_request_sent: [
    text("refund-intro", "Hello {{customer_name}},<br /><br />a refund was recorded for this invoice."),
    invoiceSummaryBlocks("refund"),
    notice("refund-note", "Refund processing time depends on the original payment method.")
  ].flat(),
  ticket_answered: [
    text("ticket-answered-intro", "Your support ticket has a new answer."),
    keyValueTable("ticket-answered-summary", "Ticket", [
      ["Ticket", "#{{ticket_id}}"],
      ["Subject", "{{ticket_subject}}"],
      ["Status", "{{ticket_status}}"]
    ]),
    notice("ticket-answer", "{{ticket_reply}}")
  ],
  ticket_closed: [
    text("ticket-closed-intro", "Your support ticket has been closed."),
    keyValueTable("ticket-closed-summary", "Ticket", [
      ["Ticket", "#{{ticket_id}}"],
      ["Subject", "{{ticket_subject}}"],
      ["Status", "{{ticket_status}}"]
    ])
  ],
  ticket_opened: [
    text("ticket-opened-intro", "A new support ticket was opened."),
    keyValueTable("ticket-opened-summary", "Ticket", [
      ["Ticket", "#{{ticket_id}}"],
      ["Subject", "{{ticket_subject}}"],
      ["Status", "{{ticket_status}}"]
    ]),
    notice("ticket-content", "{{ticket_content}}")
  ],
  welcome: [
    text("welcome-intro", "Hello {{customer_name}},<br /><br />welcome to {{brand_name}}. Your account is ready."),
    keyValueTable("welcome-summary", "Account", [
      ["Customer", "{{customer_name}}"],
      ["Email", "{{customer_email}}"]
    ])
  ]
};

export function defaultEmailLayout(eventKey: string, fallbackBody: string) {
  return cloneBlocks(DEFAULT_EMAIL_LAYOUTS[eventKey] ?? [text(`${eventKey}-body`, fallbackBody)]);
}

export function normalizeEmailLayoutBlocks(value: unknown, eventKey: string, fallbackBody: string) {
  if (!Array.isArray(value) || !value.length) {
    return defaultEmailLayout(eventKey, fallbackBody);
  }
  const blocks = value.map((item, index) => normalizeBlock(item, eventKey, index)).filter(Boolean) as EmailLayoutBlock[];
  return blocks.length ? blocks : defaultEmailLayout(eventKey, fallbackBody);
}

export function renderEmailLayout(blocks: EmailLayoutBlock[], context: Record<string, string>) {
  return blocks.map((block) => renderBlock(block, context)).join("");
}

function invoiceSummaryBlocks(prefix: string): EmailLayoutBlock[] {
  return [
    keyValueTable(`${prefix}-summary`, "Invoice summary", [
      ["Invoice", "{{invoice_number}}"],
      ["Total", "{{invoice_total_amount}}"],
      ["Due date", "{{invoice_due_date}}"]
    ]),
    {
      columns: ["Service", "Amount"],
      id: `${prefix}-lines`,
      rows: [{ cells: ["{{service}}", "{{invoice_total_amount}}"] }],
      title: "Invoice lines",
      type: "invoiceTable"
    }
  ];
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
    return `<table role="presentation" cellspacing="0" cellpadding="0" style="margin:24px 0;"><tr><td style="border-radius:6px;background:#b11226;"><a href="${href}" style="display:inline-block;padding:13px 18px;color:#ffffff;font-size:15px;font-weight:700;text-decoration:none;">${renderInline(block.content || "Open", context)}</a></td></tr></table>`;
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
  return `<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin:22px 0;border:1px solid #dde5ef;border-radius:8px;border-collapse:separate;border-spacing:0;overflow:hidden;"><tr><td colspan="2" style="padding:14px;background:#f8fafc;color:#172033;font-size:15px;font-weight:700;">${renderInline(block.title || "Details", context)}</td></tr>${rows}</table>`;
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
