export type EmailRecipientType = "admin" | "client";

// Groups the events in the admin list. Hosting + domain are also module-gated (see `module`).
export type EmailCategory = "billing" | "account" | "hosting" | "domain" | "support";

// A provisioning module an event belongs to. When that module is inactive the event is hidden
// from the admin editor and never dispatched (the three hosting mails ship with `virtualmin`,
// the domain mail ships with `resellbiz`). Undefined = always available.
export type EmailModule = "resellbiz" | "virtualmin";

export type EmailEventDefinition = {
  body: string;
  category: EmailCategory;
  defaultRecipients: EmailRecipientType[];
  key: string;
  module?: EmailModule;
  subject: string;
  trigger: string;
};

// Category display order for the grouped admin list.
export const EMAIL_CATEGORY_ORDER: EmailCategory[] = ["billing", "account", "hosting", "domain", "support"];

export const EMAIL_EVENTS = [
  {
    key: "new_invoice",
    category: "billing",
    subject: "New Invoice",
    trigger: "when an invoice is generated",
    defaultRecipients: ["admin", "client"],
    body: "<p>Hello {{customer_name}},</p><p>Invoice {{invoice_number}} for {{invoice_total_amount}} has been created. Due date: {{invoice_due_date}}.</p>"
  },
  {
    key: "welcome",
    category: "account",
    subject: "Welcome",
    trigger: "when a user signs up or gets created",
    defaultRecipients: ["admin", "client"],
    body: "<p>Hello {{customer_name}},</p><p>Welcome to {{brand_name}}. Your account is ready.</p>"
  },
  {
    key: "payment_successful",
    category: "billing",
    subject: "Payment successful",
    trigger: "when a user successfully pays an invoice",
    defaultRecipients: ["admin", "client"],
    body: "<p>Hello {{customer_name}},</p><p>Payment for invoice {{invoice_number}} succeeded. Amount: {{invoice_total_amount}}.</p>"
  },
  {
    key: "domain_information",
    category: "domain",
    module: "resellbiz",
    subject: "Domain Information",
    trigger: "when a domain becomes marked as active",
    defaultRecipients: ["admin", "client"],
    body: "<p>Hello {{customer_name}},</p><p>Your domain {{domain}} is now {{resellbiz_domain_status}}. Name servers: {{resellbiz_nameservers}}. Manage it here: <a href=\"{{domain_link}}\">{{domain_link}}</a></p>"
  },
  {
    key: "hosting_account_information",
    category: "hosting",
    module: "virtualmin",
    subject: "Hosting Account Information",
    trigger: "when a hosting account becomes marked as active",
    defaultRecipients: ["admin", "client"],
    body: "<p>Hello {{customer_name}},</p><p>Your hosting service {{service}} is active. Domain: {{domain}}. Control panel: {{virtualmin_control_panel_url}} (username {{virtualmin_control_panel_username}}, password {{virtualmin_control_panel_password}}). Manage it here: <a href=\"{{service_link}}\">{{service_link}}</a></p>"
  },
  {
    key: "hosting_account_suspended",
    category: "hosting",
    module: "virtualmin",
    subject: "Hosting Account Suspended",
    trigger: "when a hosting service is marked as suspended",
    defaultRecipients: ["client"],
    body: "<p>Hello {{customer_name}},</p><p>Your hosting service {{service}} has been suspended.</p>"
  },
  {
    key: "hosting_account_terminated",
    category: "hosting",
    module: "virtualmin",
    subject: "Hosting Account Terminated",
    trigger: "when a hosting service is marked as terminated",
    defaultRecipients: ["client"],
    body: "<p>Hello {{customer_name}},</p><p>Your hosting service {{service}} has been terminated.</p>"
  },
  {
    key: "refund_request_sent",
    category: "billing",
    subject: "Refund Request Sent",
    trigger: "when an invoice is refunded by an admin",
    defaultRecipients: ["admin", "client"],
    body: "<p>Hello {{customer_name}},</p><p>Invoice {{invoice_number}} has been refunded. Amount: {{invoice_total_amount}}.</p>"
  },
  {
    key: "order_confirmation",
    category: "billing",
    subject: "Order Confirmation",
    trigger: "when a new order is registered on the system",
    defaultRecipients: ["admin", "client"],
    body: "<p>Hello {{customer_name}},</p><p>Order {{order_number}} is registered. Total: {{invoice_total_amount}}.</p>"
  },
  {
    key: "invoice_reminder",
    category: "billing",
    subject: "Invoice Reminder",
    trigger: "sent by the cron job",
    defaultRecipients: ["client"],
    body: "<p>Hello {{customer_name}},</p><p>Reminder: invoice {{invoice_number}} for {{invoice_total_amount}} is due on {{invoice_due_date}}.</p>"
  },
  {
    key: "password_reset",
    category: "account",
    subject: "Password Reset",
    trigger: "when a user requests a password reset",
    defaultRecipients: ["client"],
    body: "<p>Hello {{customer_name}},</p><p>Reset your password here: <a href=\"{{password_reset_link}}\">{{password_reset_link}}</a></p>"
  },
  {
    key: "ticket_opened",
    category: "support",
    subject: "Ticket Opened — #{{ticket_id}}",
    trigger: "when a support ticket is opened",
    defaultRecipients: ["admin", "client"],
    body: "<p>Hello {{customer_name}},</p><p>Your ticket <strong>#{{ticket_id}}</strong> has been opened with our <strong>{{department_name}}</strong> team: {{ticket_subject}}</p><p>{{ticket_content}}</p><p><a href=\"{{ticket_url}}\" style=\"display:inline-block;padding:11px 20px;background:#0b3d91;color:#ffffff;border-radius:8px;text-decoration:none;font-weight:bold;\">View ticket</a></p>"
  },
  {
    key: "ticket_answered",
    category: "support",
    subject: "Ticket Answered — #{{ticket_id}}",
    trigger: "when a support ticket receives an answer",
    defaultRecipients: ["admin", "client"],
    body: "<p>Hello {{customer_name}},</p><p>{{staff_name}} from our <strong>{{department_name}}</strong> team replied to your ticket <strong>#{{ticket_id}}</strong>: {{ticket_subject}}</p><p>{{ticket_reply}}</p><p><a href=\"{{ticket_url}}\" style=\"display:inline-block;padding:11px 20px;background:#0b3d91;color:#ffffff;border-radius:8px;text-decoration:none;font-weight:bold;\">View ticket</a></p>"
  },
  {
    key: "ticket_closed",
    category: "support",
    subject: "Ticket Closed — #{{ticket_id}}",
    trigger: "when a support ticket is closed",
    defaultRecipients: ["admin", "client"],
    body: "<p>Hello {{customer_name}},</p><p>Your ticket <strong>#{{ticket_id}}</strong> ({{ticket_subject}}) with our <strong>{{department_name}}</strong> team has been closed.</p><p><a href=\"{{ticket_url}}\" style=\"display:inline-block;padding:11px 20px;background:#0b3d91;color:#ffffff;border-radius:8px;text-decoration:none;font-weight:bold;\">View ticket</a></p>"
  }
] as const satisfies readonly EmailEventDefinition[];

// Fuller-redesign notification shell: a 4px accent rule over a rounded white card, navy header
// lockup ({{brand_logo}} when a logo is set, else the brand name), and a quiet receipt-style
// footer. Email-safe tables + inline styles only (Gmail / Outlook / Apple Mail). {{content}} and
// {{brand_logo}} are injected as trusted HTML; every other placeholder is escaped.
export const DEFAULT_EMAIL_TEMPLATE_HTML = `<!doctype html>
<html>
  <body style="margin:0;background:#eef2f7;color:#1f2937;font-family:Arial,Helvetica,sans-serif;">
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#eef2f7;padding:32px 12px;">
      <tr>
        <td align="center">
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:600px;">
            <tr>
              <td style="height:4px;background:#0077b6;border-radius:12px 12px 0 0;font-size:0;line-height:0;">&nbsp;</td>
            </tr>
            <tr>
              <td style="background:#ffffff;border:1px solid #e5ebf2;border-top:0;border-radius:0 0 12px 12px;">
                <table role="presentation" width="100%" cellspacing="0" cellpadding="0">
                  <tr>
                    <td style="padding:26px 32px 22px;background:#0b2140;color:#ffffff;border-radius:0;">
                      {{brand_logo}}
                      <div style="font-size:12px;font-weight:700;letter-spacing:.16em;text-transform:uppercase;color:#9fc7e6;">{{brand_name}}</div>
                      <h1 style="margin:10px 0 0;font-size:23px;line-height:1.22;font-weight:800;letter-spacing:-.01em;">{{subject}}</h1>
                    </td>
                  </tr>
                  <tr>
                    <td style="padding:26px 32px 8px;font-size:15px;line-height:1.65;color:#1f2937;">
                      {{content}}
                    </td>
                  </tr>
                  <tr>
                    <td style="padding:20px 32px 24px;background:#f7f9fc;border-top:1px solid #eef2f7;color:#64748b;font-size:12.5px;line-height:1.7;">
                      {{brand_name}} · {{current_date}}
                    </td>
                  </tr>
                </table>
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

// The provisioning module an event ships with, or undefined when it is always available.
// (`as const` omits the property on events that don't declare it, so narrow with `in`.)
export function emailEventModule(key: string): EmailModule | undefined {
  const def = emailEventDefinition(key);
  return def && "module" in def ? def.module : undefined;
}

// True when the event belongs to a module that is not in `activeModules` — such events are
// hidden from the editor and skipped at dispatch.
export function isEmailEventModuleActive(key: string, activeModules: readonly string[]): boolean {
  const mod = emailEventModule(key);
  return !mod || activeModules.includes(mod);
}
