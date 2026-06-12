export const EMAIL_PLACEHOLDERS = [
  { key: "brand_name", description: "Public brand name from email settings." },
  { key: "customer_name", description: "Client name." },
  { key: "customer_email", description: "Client email address." },
  { key: "invoice_number", description: "Invoice number shown to client." },
  { key: "invoice_total_amount", description: "Invoice total, formatted with currency." },
  { key: "invoice_due_date", description: "Invoice due date." },
  { key: "service", description: "Product or service name." },
  { key: "service_link", description: "Link to the service in the client dashboard." },
  { key: "domain", description: "Domain name." },
  { key: "domain_link", description: "Link to the domain in the client dashboard." },
  { key: "domain_status", description: "Current domain status (Active, Pending, …)." },
  { key: "nameservers", description: "Domain name servers, comma separated." },
  { key: "control_panel_url", description: "Webmin/Virtualmin control panel address." },
  { key: "control_panel_username", description: "Hosting control panel login username." },
  { key: "control_panel_password", description: "Hosting control panel login password." },
  { key: "order_number", description: "Order number." },
  { key: "password_reset_link", description: "Signed link for the password reset page." },
  { key: "ticket_id", description: "Public ticket id." },
  { key: "ticket_subject", description: "Support ticket subject." },
  { key: "ticket_content", description: "Original ticket message." },
  { key: "ticket_reply", description: "Latest public ticket reply." },
  { key: "ticket_status", description: "Ticket status." },
  { key: "current_date", description: "Current date." }
] as const;

export type EmailPlaceholderKey = (typeof EMAIL_PLACEHOLDERS)[number]["key"];
