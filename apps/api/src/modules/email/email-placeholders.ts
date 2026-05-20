export const EMAIL_PLACEHOLDERS = [
  { key: "brand_name", description: "Public brand name from email settings." },
  { key: "customer_name", description: "Client name." },
  { key: "customer_email", description: "Client email address." },
  { key: "invoice_number", description: "Invoice number shown to client." },
  { key: "invoice_total_amount", description: "Invoice total, formatted with currency." },
  { key: "invoice_due_date", description: "Invoice due date." },
  { key: "service", description: "Product or service name." },
  { key: "domain", description: "Domain name." },
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
