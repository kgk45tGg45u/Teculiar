// Placeholders offered on the Emails page. Each placeholder carries a `group` so the
// admin UI can colour-code the draggable shortcode tags (tickets one colour, invoices
// another, Virtualmin another, …).
//
// Core placeholders are always available. Module placeholders are contributed by a
// provisioning module (Virtualmin, Resell.biz, …) and only appear while that module is
// active — disabling the module removes its shortcodes from the page.

export type EmailPlaceholderGroup =
  | "general"
  | "customer"
  | "invoice"
  | "payment"
  | "order"
  | "service"
  | "domain"
  | "ticket"
  | "virtualmin"
  | "resellbiz";

export type EmailPlaceholder = {
  description: string;
  group: EmailPlaceholderGroup;
  key: string;
};

export const CORE_EMAIL_PLACEHOLDERS: EmailPlaceholder[] = [
  { key: "brand_name", group: "general", description: "Public brand name from email settings." },
  { key: "current_date", group: "general", description: "Current date." },
  { key: "customer_name", group: "customer", description: "Client name." },
  { key: "customer_email", group: "customer", description: "Client email address." },
  { key: "invoice_number", group: "invoice", description: "Invoice number shown to client." },
  { key: "invoice_total_amount", group: "invoice", description: "Invoice total, formatted with currency." },
  { key: "invoice_due_date", group: "invoice", description: "Invoice due date." },
  { key: "invoice_link", group: "invoice", description: "Link to the invoice in the client dashboard." },
  { key: "payment_gateway", group: "payment", description: "Payment gateway used to pay the invoice (PayPal, SEPA, …)." },
  { key: "order_number", group: "order", description: "Order number." },
  { key: "service", group: "service", description: "Product or service name." },
  { key: "service_link", group: "service", description: "Link to the service in the client dashboard." },
  { key: "domain", group: "domain", description: "Domain name." },
  { key: "domain_link", group: "domain", description: "Link to the domain in the client dashboard." },
  { key: "ticket_id", group: "ticket", description: "Public ticket id." },
  { key: "ticket_subject", group: "ticket", description: "Support ticket subject." },
  { key: "ticket_content", group: "ticket", description: "Original ticket message." },
  { key: "ticket_reply", group: "ticket", description: "Latest public ticket reply." },
  { key: "ticket_status", group: "ticket", description: "Ticket status." },
  { key: "ticket_url", group: "ticket", description: "Direct link to view the ticket." },
  { key: "staff_name", group: "ticket", description: "Name of the staff member who replied." },
  { key: "department_name", group: "ticket", description: "Support department handling the ticket." },
  { key: "password_reset_link", group: "general", description: "Signed link for the password reset page." }
];

// Keyed by the module name used in `module.<name>.active` system settings.
export const MODULE_EMAIL_PLACEHOLDERS: Record<string, EmailPlaceholder[]> = {
  virtualmin: [
    { key: "virtualmin_control_panel_url", group: "virtualmin", description: "Virtualmin / Webmin control panel address." },
    { key: "virtualmin_control_panel_username", group: "virtualmin", description: "Virtualmin control panel login username." },
    { key: "virtualmin_control_panel_password", group: "virtualmin", description: "Virtualmin control panel login password." },
    { key: "virtualmin_mail_server", group: "virtualmin", description: "Mail server hostname for IMAP/POP and SMTP." },
    { key: "virtualmin_smtp_port", group: "virtualmin", description: "Outgoing (SMTP) mail server port." },
    { key: "virtualmin_imap_port", group: "virtualmin", description: "Incoming (IMAP) mail server port." }
  ],
  resellbiz: [
    { key: "resellbiz_domain_status", group: "resellbiz", description: "Current domain status (Active, Pending, …)." },
    { key: "resellbiz_nameservers", group: "resellbiz", description: "Domain name servers, comma separated." }
  ]
};

// Build the placeholder list shown on the Emails page: core placeholders plus the
// shortcodes contributed by each currently-active module.
export function emailPlaceholdersForModules(activeModules: Iterable<string>): EmailPlaceholder[] {
  const placeholders = [...CORE_EMAIL_PLACEHOLDERS];
  for (const moduleName of activeModules) {
    const extra = MODULE_EMAIL_PLACEHOLDERS[moduleName];
    if (extra) {
      placeholders.push(...extra);
    }
  }
  return placeholders;
}

// Full list (core + every module), used as a fallback and for documentation/tests.
export const EMAIL_PLACEHOLDERS: EmailPlaceholder[] = emailPlaceholdersForModules(
  Object.keys(MODULE_EMAIL_PLACEHOLDERS)
);

export type EmailPlaceholderKey = string;
