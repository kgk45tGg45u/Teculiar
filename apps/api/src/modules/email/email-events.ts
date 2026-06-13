export type EmailRecipientType = "admin" | "client";

export type EmailEventDefinition = {
  body: string;
  defaultRecipients: EmailRecipientType[];
  key: string;
  subject: string;
  trigger: string;
};

export const EMAIL_EVENTS = [
  {
    key: "new_invoice",
    subject: "New Invoice",
    trigger: "when an invoice is generated",
    defaultRecipients: ["admin", "client"],
    body: "<p>Hello {{customer_name}},</p><p>Invoice {{invoice_number}} for {{invoice_total_amount}} has been created. Due date: {{invoice_due_date}}.</p>"
  },
  {
    key: "welcome",
    subject: "Welcome",
    trigger: "when a user signs up or gets created",
    defaultRecipients: ["admin", "client"],
    body: "<p>Hello {{customer_name}},</p><p>Welcome to {{brand_name}}. Your account is ready.</p>"
  },
  {
    key: "payment_successful",
    subject: "Payment successful",
    trigger: "when a user successfully pays an invoice",
    defaultRecipients: ["admin", "client"],
    body: "<p>Hello {{customer_name}},</p><p>Payment for invoice {{invoice_number}} succeeded. Amount: {{invoice_total_amount}}.</p>"
  },
  {
    key: "domain_information",
    subject: "Domain Information",
    trigger: "when a domain becomes marked as active",
    defaultRecipients: ["admin", "client"],
    body: "<p>Hello {{customer_name}},</p><p>Your domain {{domain}} is now {{domain_status}}. Name servers: {{nameservers}}. Manage it here: <a href=\"{{domain_link}}\">{{domain_link}}</a></p>"
  },
  {
    key: "hosting_account_information",
    subject: "Hosting Account Information",
    trigger: "when a hosting account becomes marked as active",
    defaultRecipients: ["admin", "client"],
    body: "<p>Hello {{customer_name}},</p><p>Your hosting service {{service}} is active. Domain: {{domain}}. Control panel: {{control_panel_url}} (username {{control_panel_username}}, password {{control_panel_password}}). Manage it here: <a href=\"{{service_link}}\">{{service_link}}</a></p>"
  },
  {
    key: "hosting_account_suspended",
    subject: "Hosting Account Suspended",
    trigger: "when a hosting service is marked as suspended",
    defaultRecipients: ["client"],
    body: "<p>Hello {{customer_name}},</p><p>Your hosting service {{service}} has been suspended.</p>"
  },
  {
    key: "hosting_account_terminated",
    subject: "Hosting Account Terminated",
    trigger: "when a hosting service is marked as terminated",
    defaultRecipients: ["client"],
    body: "<p>Hello {{customer_name}},</p><p>Your hosting service {{service}} has been terminated.</p>"
  },
  {
    key: "refund_request_sent",
    subject: "Refund Request Sent",
    trigger: "when an invoice is refunded by an admin",
    defaultRecipients: ["admin", "client"],
    body: "<p>Hello {{customer_name}},</p><p>Invoice {{invoice_number}} has been refunded. Amount: {{invoice_total_amount}}.</p>"
  },
  {
    key: "order_confirmation",
    subject: "Order Confirmation",
    trigger: "when a new order is registered on the system",
    defaultRecipients: ["admin", "client"],
    body: "<p>Hello {{customer_name}},</p><p>Order {{order_number}} is registered. Total: {{invoice_total_amount}}.</p>"
  },
  {
    key: "invoice_reminder",
    subject: "Invoice Reminder",
    trigger: "sent by the cron job",
    defaultRecipients: ["client"],
    body: "<p>Hello {{customer_name}},</p><p>Reminder: invoice {{invoice_number}} for {{invoice_total_amount}} is due on {{invoice_due_date}}.</p>"
  },
  {
    key: "password_reset",
    subject: "Password Reset",
    trigger: "when a user requests a password reset",
    defaultRecipients: ["client"],
    body: "<p>Hello {{customer_name}},</p><p>Reset your password here: <a href=\"{{password_reset_link}}\">{{password_reset_link}}</a></p>"
  },
  {
    key: "ticket_opened",
    subject: "Ticket Opened — #{{ticket_id}}",
    trigger: "when a support ticket is opened",
    defaultRecipients: ["admin", "client"],
    body: "<p>Hello {{customer_name}},</p><p>Your ticket <strong>#{{ticket_id}}</strong> has been opened with our <strong>{{department_name}}</strong> team: {{ticket_subject}}</p><p>{{ticket_content}}</p><p><a href=\"{{ticket_url}}\" style=\"display:inline-block;padding:11px 20px;background:#0b3d91;color:#ffffff;border-radius:8px;text-decoration:none;font-weight:bold;\">View ticket</a></p>"
  },
  {
    key: "ticket_answered",
    subject: "Ticket Answered — #{{ticket_id}}",
    trigger: "when a support ticket receives an answer",
    defaultRecipients: ["admin", "client"],
    body: "<p>Hello {{customer_name}},</p><p>{{staff_name}} from our <strong>{{department_name}}</strong> team replied to your ticket <strong>#{{ticket_id}}</strong>: {{ticket_subject}}</p><p>{{ticket_reply}}</p><p><a href=\"{{ticket_url}}\" style=\"display:inline-block;padding:11px 20px;background:#0b3d91;color:#ffffff;border-radius:8px;text-decoration:none;font-weight:bold;\">View ticket</a></p>"
  },
  {
    key: "ticket_closed",
    subject: "Ticket Closed — #{{ticket_id}}",
    trigger: "when a support ticket is closed",
    defaultRecipients: ["admin", "client"],
    body: "<p>Hello {{customer_name}},</p><p>Your ticket <strong>#{{ticket_id}}</strong> ({{ticket_subject}}) with our <strong>{{department_name}}</strong> team has been closed.</p><p><a href=\"{{ticket_url}}\" style=\"display:inline-block;padding:11px 20px;background:#0b3d91;color:#ffffff;border-radius:8px;text-decoration:none;font-weight:bold;\">View ticket</a></p>"
  }
] as const satisfies readonly EmailEventDefinition[];

export const DEFAULT_EMAIL_TEMPLATE_HTML = `<!doctype html>
<html>
  <body style="margin:0;background:#f4f7fb;color:#172033;font-family:Arial,Helvetica,sans-serif;">
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f4f7fb;padding:32px 12px;">
      <tr>
        <td align="center">
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:640px;background:#ffffff;border:1px solid #dde5ef;border-radius:8px;overflow:hidden;">
            <tr>
              <td style="padding:24px 28px;background:#10223d;color:#ffffff;">
                <div style="font-size:14px;letter-spacing:0;text-transform:uppercase;opacity:.78;">{{brand_name}}</div>
                <h1 style="margin:8px 0 0;font-size:24px;line-height:1.25;">{{subject}}</h1>
              </td>
            </tr>
            <tr>
              <td style="padding:28px;font-size:16px;line-height:1.6;">
                {{content}}
              </td>
            </tr>
            <tr>
              <td style="padding:18px 28px;background:#f8fafc;color:#5b6575;font-size:13px;">
                {{brand_name}} - {{current_date}}
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;

export function defaultEmailEventConfigs() {
  return Object.fromEntries(EMAIL_EVENTS.map((event) => [
    event.key,
    { enabled: true, recipients: event.defaultRecipients }
  ]));
}

export function emailEventDefinition(key: string) {
  return EMAIL_EVENTS.find((event) => event.key === key);
}
