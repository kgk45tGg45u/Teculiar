import { Injectable } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import net from "node:net";
import tls from "node:tls";
import { readMainCurrency, readMainLanguage } from "../../common/currency";
import { formatDate, formatMoney, loadDictionary } from "../../common/i18n";
import { PrismaService } from "../prisma/prisma.service";
import { DEFAULT_EMAIL_TEMPLATE_HTML, EMAIL_EVENTS, defaultEmailEventConfigs, emailEventDefinition, type EmailRecipientType } from "./email-events";
import { emailLayoutBlockLibrary, normalizeEmailLayoutBlocks, renderEmailLayout, type EmailDict, type EmailLayoutBlock } from "./email-layouts";
import { emailPlaceholdersForModules } from "./email-placeholders";

type EmailUser = {
  email?: string | null;
  id?: string | null;
  locale?: string | null;
  name?: string | null;
};

type EmailDispatchInput = {
  context?: Record<string, unknown>;
  teamId?: string | null;
  user?: EmailUser | null;
};

type EmailEventConfig = {
  enabled?: boolean;
  recipients?: EmailRecipientType[];
};

type EmailEventPatch = {
  body?: string;
  enabled?: boolean;
  key: string;
  layoutBlocks?: EmailLayoutBlock[];
  recipients?: string[];
  subject?: string;
};

type EmailSmtpSettings = {
  adminEmails?: string[] | string;
  enabled?: boolean;
  fromEmail?: string;
  fromName?: string;
  host?: string;
  password?: string;
  port?: number;
  replyTo?: string;
  secure?: boolean;
  username?: string;
};

@Injectable()
export class EmailService {
  constructor(private readonly prisma: PrismaService) {}

  async adminSettings() {
    // The admin editor shows defaults in the store's main language; DB overrides still win.
    const [mainLang, mainCurrency] = await Promise.all([this.mainLanguage(), this.mainCurrency()]);
    const dict = loadDictionary(mainLang).email;
    const sampleVars = defaultTestVariables(mainCurrency, mainLang);
    const [smtp, eventConfigs, layoutConfigs, templateHtml, testVariables, templates, logs, activeModules] = await Promise.all([
      this.smtpSettings(),
      this.eventConfigs(),
      this.layoutConfigs(),
      this.settingString("emailTemplateHtml", DEFAULT_EMAIL_TEMPLATE_HTML),
      this.settingJson<Record<string, unknown>>("emailTestVariables", sampleVars),
      Promise.all(EMAIL_EVENTS.map((event) => this.templateFor(event.key, mainLang))),
      this.listLogs(100),
      this.activeModules()
    ]);

    return {
      events: EMAIL_EVENTS.map((event, index) => ({
        ...event,
        enabled: eventConfigs[event.key]?.enabled ?? true,
        layoutBlocks: normalizeEmailLayoutBlocks(layoutConfigs[event.key], event.key, templates[index]?.body ?? packBody(dict, event.key, event.body), dict),
        recipients: eventConfigs[event.key]?.recipients ?? event.defaultRecipients,
        body: templates[index]?.body ?? packBody(dict, event.key, event.body),
        subject: templates[index]?.subject ?? packSubject(dict, event.key, event.subject)
      })),
      blockLibrary: emailLayoutBlockLibrary(dict),
      logs,
      // Only show shortcodes contributed by modules that are currently active.
      placeholders: emailPlaceholdersForModules(activeModules),
      smtp: publicSmtp(smtp),
      templateHtml,
      // Merge defaults under any saved overrides so newly added placeholders still preview.
      testVariables: { ...sampleVars, ...testVariables }
    };
  }

  // Which provisioning modules are active. Modules default to active when no setting row
  // exists yet (matching the modules admin page defaults).
  private async activeModules(): Promise<string[]> {
    const rows = await this.prisma.systemSetting.findMany({
      where: { key: { in: ["module.virtualmin.active", "module.resellbiz.active"] } }
    });
    const byKey = Object.fromEntries(rows.map((row) => [row.key, row.value]));
    const isActive = (key: string) => {
      const value = byKey[key];
      return value === undefined || (value !== 0 && value !== false && value !== "0");
    };
    const modules: string[] = [];
    if (isActive("module.virtualmin.active")) {
      modules.push("virtualmin");
    }
    if (isActive("module.resellbiz.active")) {
      modules.push("resellbiz");
    }
    return modules;
  }

  async updateSettings(input: {
    events?: EmailEventPatch[];
    smtp?: EmailSmtpSettings;
    templateHtml?: string;
    testVariables?: Record<string, unknown>;
  }) {
    const tasks: Array<Promise<unknown>> = [];
    if (input.smtp) {
      tasks.push(this.saveSmtpSettings(input.smtp));
    }
    if (typeof input.templateHtml === "string") {
      tasks.push(this.upsertSetting("emailTemplateHtml", input.templateHtml));
    }
    if (input.testVariables) {
      tasks.push(this.upsertSetting("emailTestVariables", input.testVariables));
    }
    if (input.events) {
      // Overrides are stored against the main language (the locale the admin editor shows).
      const mainLang = await this.mainLanguage();
      const dict = loadDictionary(mainLang).email;
      const configs: Record<string, EmailEventConfig> = {};
      const currentLayouts = await this.layoutConfigs();
      const layouts: Record<string, EmailLayoutBlock[]> = { ...currentLayouts };
      for (const event of input.events) {
        const definition = emailEventDefinition(event.key);
        if (!definition) {
          continue;
        }
        const fallbackBody = packBody(dict, event.key, definition.body);
        configs[event.key] = {
          enabled: event.enabled !== false,
          recipients: normalizedRecipients(event.recipients, definition.defaultRecipients)
        };
        tasks.push(this.prisma.emailTemplate.upsert({
          where: { key_locale: { key: event.key, locale: mainLang } },
          create: {
            body: event.body ?? fallbackBody,
            key: event.key,
            locale: mainLang,
            subject: event.subject ?? packSubject(dict, event.key, definition.subject)
          },
          update: {
            body: event.body ?? fallbackBody,
            subject: event.subject ?? packSubject(dict, event.key, definition.subject)
          }
        }));
        if (Array.isArray(event.layoutBlocks)) {
          layouts[event.key] = normalizeEmailLayoutBlocks(event.layoutBlocks, event.key, event.body ?? fallbackBody, dict);
        }
      }
      tasks.push(this.upsertSetting("emailEventConfigs", configs));
      tasks.push(this.upsertSetting("emailLayoutBlocks", layouts));
    }

    await Promise.all(tasks);
    return this.adminSettings();
  }

  async sendTest(eventKey: string, context: Record<string, unknown> = {}, to?: string) {
    const testVariables = await this.settingJson<Record<string, unknown>>("emailTestVariables", defaultTestVariables());
    const recipientEmail = to ?? stringValue(context.customer_email) ?? stringValue(testVariables.customer_email);
    return this.dispatch(eventKey, {
      context: { ...testVariables, ...context },
      user: {
        email: recipientEmail,
        name: stringValue(context.customer_name) ?? stringValue(testVariables.customer_name)
      }
    });
  }

  async dispatch(eventKey: string, input: EmailDispatchInput) {
    const definition = emailEventDefinition(eventKey);
    if (!definition) {
      return [];
    }

    const mainLang = await this.mainLanguage();
    const recipientLocale = resolveLocale(input.user?.locale, mainLang);
    const dict = loadDictionary(recipientLocale).email;
    const [smtp, configs, layoutConfigs, templateHtml, template] = await Promise.all([
      this.smtpSettings(),
      this.eventConfigs(),
      this.layoutConfigs(),
      this.settingString("emailTemplateHtml", DEFAULT_EMAIL_TEMPLATE_HTML),
      this.templateFor(eventKey, recipientLocale)
    ]);
    const config = configs[eventKey] ?? { enabled: true, recipients: definition.defaultRecipients };
    if (config.enabled === false) {
      return [];
    }

    const context = normalizeContext({
      ...input.context,
      brand_name: smtp.fromName || stringValue(input.context?.brand_name) || "Dezhost",
      current_date: formatDate(new Date(), recipientLocale),
      customer_email: input.user?.email ?? input.context?.customer_email,
      customer_name: input.user?.name ?? input.context?.customer_name ?? input.user?.email
    });
    const subject = renderText(template?.subject ?? packSubject(dict, eventKey, definition.subject), context);
    const layoutBlocks = normalizeEmailLayoutBlocks(layoutConfigs[eventKey], eventKey, template?.body ?? packBody(dict, eventKey, definition.body), dict);
    const content = renderEmailLayout(layoutBlocks, context);
    const html = renderShell(templateHtml, { ...context, content, subject });
    const text = stripHtml(content);
    const recipients = this.recipients(config.recipients ?? definition.defaultRecipients, input.user, smtp);

    const logs = [];
    for (const recipient of recipients) {
      const delivery = await this.deliver({
        html,
        recipient: recipient.email,
        smtp,
        subject,
        text
      });
      logs.push(await this.prisma.emailLog.create({
        data: {
          payload: {
            context,
            from: emailFrom(smtp),
            html,
            recipientType: recipient.type,
            replyTo: smtp.replyTo,
            smtpDelivery: delivery,
            smtp: {
              enabled: Boolean(smtp.enabled),
              host: smtp.host,
              port: smtp.port,
              secure: Boolean(smtp.secure)
            },
            text
          } as Prisma.InputJsonValue,
          sentAt: delivery.status === "SENT" ? new Date() : undefined,
          status: delivery.status,
          subject,
          teamId: input.teamId ?? undefined,
          template: eventKey,
          to: recipient.email,
          userId: recipient.type === "client" ? input.user?.id ?? undefined : undefined
        }
      }));
    }
    return logs;
  }

  // Records an inbound (IMAP-fetched) email so admins can see every received message with its
  // title and the matched client. Stored in the same EmailLog table as outgoing mail.
  logInboundEmail(input: {
    to: string;
    from?: string;
    subject: string;
    userId?: string;
    department?: string;
    status: string;
    ticketId?: string;
    body?: string;
  }) {
    return this.prisma.emailLog.create({
      data: {
        status: input.status,
        subject: input.subject || "(no subject)",
        template: "inbound",
        to: input.to,
        userId: input.userId ?? undefined,
        sentAt: new Date(),
        payload: {
          direction: "inbound",
          department: input.department,
          from: input.from,
          ticketId: input.ticketId,
          to: input.to,
          text: input.body?.slice(0, 4000)
        } as Prisma.InputJsonValue
      }
    });
  }

  async sendEventToUser(userId: string, eventKey: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId }, select: { id: true, email: true, name: true, locale: true } });
    if (!user?.email) {
      return [];
    }
    const definition = emailEventDefinition(eventKey);
    if (!definition) {
      return [];
    }
    const mainLang = await this.mainLanguage();
    const recipientLocale = resolveLocale(user.locale, mainLang);
    const dict = loadDictionary(recipientLocale).email;
    const [smtp, layoutConfigs, templateHtml, template] = await Promise.all([
      this.smtpSettings(),
      this.layoutConfigs(),
      this.settingString("emailTemplateHtml", DEFAULT_EMAIL_TEMPLATE_HTML),
      this.templateFor(eventKey, recipientLocale)
    ]);
    const context = normalizeContext({
      brand_name: smtp.fromName || "Dezhost",
      current_date: formatDate(new Date(), recipientLocale),
      customer_email: user.email,
      customer_name: user.name ?? user.email
    });
    const subject = renderText(template?.subject ?? packSubject(dict, eventKey, definition.subject), context);
    const layoutBlocks = normalizeEmailLayoutBlocks(layoutConfigs[eventKey], eventKey, template?.body ?? packBody(dict, eventKey, definition.body), dict);
    const content = renderEmailLayout(layoutBlocks, context);
    const html = renderShell(templateHtml, { ...context, content, subject });
    const text = stripHtml(content);
    const delivery = await this.deliver({ html, recipient: user.email, smtp, subject, text });
    return [await this.prisma.emailLog.create({
      data: {
        payload: { context, from: emailFrom(smtp), html, recipientType: "client", replyTo: smtp.replyTo, smtpDelivery: delivery, smtp: { enabled: Boolean(smtp.enabled), host: smtp.host, port: smtp.port, secure: Boolean(smtp.secure) }, text } as Prisma.InputJsonValue,
        sentAt: delivery.status === "SENT" ? new Date() : undefined,
        status: delivery.status,
        subject,
        template: eventKey,
        to: user.email,
        userId: user.id
      }
    })];
  }

  async sendCustomToUser(userId: string, subject: string, body: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId }, select: { id: true, email: true, name: true, locale: true } });
    if (!user?.email) {
      return [];
    }
    const [smtp, templateHtml, mainLang] = await Promise.all([
      this.smtpSettings(),
      this.settingString("emailTemplateHtml", DEFAULT_EMAIL_TEMPLATE_HTML),
      this.mainLanguage()
    ]);
    const context = normalizeContext({
      brand_name: smtp.fromName || "Dezhost",
      current_date: formatDate(new Date(), resolveLocale(user.locale, mainLang)),
      customer_email: user.email,
      customer_name: user.name ?? user.email
    });
    const resolvedSubject = renderText(subject, context);
    const content = renderText(body, context);
    const html = renderShell(templateHtml, { ...context, content, subject: resolvedSubject });
    const text = stripHtml(content);
    const delivery = await this.deliver({ html, recipient: user.email, smtp, subject: resolvedSubject, text });
    return [await this.prisma.emailLog.create({
      data: {
        payload: { context, from: emailFrom(smtp), html, recipientType: "client", smtpDelivery: delivery, smtp: { enabled: Boolean(smtp.enabled), host: smtp.host, port: smtp.port, secure: Boolean(smtp.secure) }, text } as Prisma.InputJsonValue,
        sentAt: delivery.status === "SENT" ? new Date() : undefined,
        status: delivery.status,
        subject: resolvedSubject,
        template: "custom",
        to: user.email,
        userId: user.id
      }
    })];
  }

  async testSmtpConnection(smtp?: EmailSmtpSettings) {
    const current = await this.settingJson<EmailSmtpSettings>("emailSmtp", {});
    const base = await this.smtpSettings();
    const settings: EmailSmtpSettings = smtp
      ? { ...base, ...smtp, password: smtp.password === "********" ? current.password ?? "" : smtp.password ?? "" }
      : base;

    if (!settings.enabled) {
      return { ok: false, message: "SMTP is not enabled. Enable SMTP first." };
    }
    if (!settings.host) {
      return { ok: false, message: "SMTP host is not configured." };
    }

    let sock: net.Socket | undefined;
    const timeoutMs = 12000;

    const run = async (): Promise<{ ok: boolean; message: string }> => {
      const port = Number(settings.port || 587);
      const useImplicitTls = Boolean(settings.secure) && port === 465;
      const useStartTls = Boolean(settings.secure) && !useImplicitTls;
      try {
        sock = await openSmtpTcp({ host: settings.host!, port, implicitTls: useImplicitTls });
        sock.on("error", () => undefined);
        let reader = smtpCloseAwareReader(sock);
        await reader.read();
        await reader.command(`EHLO ${settings.host}`, [2]);
        if (useStartTls) {
          await reader.command("STARTTLS", [2]);
          sock.removeAllListeners();
          sock.on("error", () => undefined);
          sock = await upgradeToTls(sock, settings.host!);
          sock.on("error", () => undefined);
          reader = smtpCloseAwareReader(sock);
          await reader.command(`EHLO ${settings.host}`, [2]);
        }
        if (settings.username || settings.password) {
          await reader.command("AUTH LOGIN", [3]);
          await reader.command(Buffer.from(settings.username ?? "").toString("base64"), [3]);
          await reader.command(Buffer.from(settings.password ?? "").toString("base64"), [2]);
        }
        await reader.command("QUIT", [2]).catch(() => undefined);
        return { ok: true, message: `Connected to ${settings.host}:${port} successfully.` };
      } catch (error) {
        return { ok: false, message: error instanceof Error ? error.message : "Connection failed." };
      } finally {
        sock?.destroy();
      }
    };

    const deadline = new Promise<{ ok: boolean; message: string }>((resolve) => {
      setTimeout(() => {
        sock?.destroy();
        resolve({ ok: false, message: `SMTP test timed out after ${timeoutMs / 1000} seconds.` });
      }, timeoutMs);
    });

    return Promise.race([run(), deadline]);
  }

  private async deliver(input: { html: string; recipient: string; smtp: EmailSmtpSettings; subject: string; text: string }) {
    if (!input.smtp.enabled) {
      return { mode: "local-outbox", status: "SENT" };
    }
    try {
      const response = await sendSmtp({
        from: input.smtp.fromEmail || "no-reply@dezhost.local",
        fromName: input.smtp.fromName || "Dezhost",
        html: input.html,
        recipient: input.recipient,
        smtp: input.smtp,
        subject: input.subject,
        text: input.text
      });
      return { mode: "smtp", response, status: "SENT" };
    } catch (error) {
      return {
        error: error instanceof Error ? error.message : "SMTP delivery failed",
        mode: "smtp",
        status: "FAILED"
      };
    }
  }

  listLogs(limit = 100) {
    const take = Math.min(Math.max(Number.isFinite(limit) ? Math.trunc(limit) : 100, 1), 500);
    return this.prisma.emailLog.findMany({
      include: { user: { select: { email: true, id: true, name: true } } },
      orderBy: { createdAt: "desc" },
      take
    });
  }

  // A per-locale DB override for an event, or null (→ the pack default applies). EmailTemplate.locale
  // is a free-form String, so any language resolves; a missing row simply yields the pack default.
  private templateFor(key: string, preferredLocale: string) {
    return this.prisma.emailTemplate.findUnique({ where: { key_locale: { key, locale: preferredLocale } } });
  }

  private mainLanguage() {
    return readMainLanguage(this.prisma);
  }

  private mainCurrency() {
    return readMainCurrency(this.prisma);
  }

  private async eventConfigs() {
    const value = await this.settingJson<Record<string, EmailEventConfig>>("emailEventConfigs", defaultEmailEventConfigs());
    const configs: Record<string, EmailEventConfig> = {};
    for (const event of EMAIL_EVENTS) {
      configs[event.key] = {
        enabled: value[event.key]?.enabled ?? true,
        recipients: normalizedRecipients(value[event.key]?.recipients, event.defaultRecipients)
      };
    }
    return configs;
  }

  private async layoutConfigs() {
    return this.settingJson<Record<string, EmailLayoutBlock[]>>("emailLayoutBlocks", {});
  }

  private async smtpSettings() {
    const [smtp, invoiceCompanyEmail] = await Promise.all([
      this.settingJson<EmailSmtpSettings>("emailSmtp", {}),
      this.settingString("invoiceCompanyEmail", "")
    ]);
    return {
      ...smtp,
      adminEmails: normalizeEmailList(smtp.adminEmails).length
        ? normalizeEmailList(smtp.adminEmails)
        : normalizeEmailList(process.env.ADMIN_EMAIL || invoiceCompanyEmail || "admin@dezhost.local"),
      fromEmail: smtp.fromEmail || process.env.MAIL_FROM || invoiceCompanyEmail || "no-reply@dezhost.local",
      fromName: smtp.fromName || "Dezhost"
    };
  }

  private recipients(types: EmailRecipientType[], user: EmailUser | null | undefined, smtp: Required<Pick<EmailSmtpSettings, "adminEmails" | "fromEmail" | "fromName">> & EmailSmtpSettings) {
    const recipients: Array<{ email: string; type: EmailRecipientType }> = [];
    if (types.includes("client") && user?.email) {
      recipients.push({ email: user.email, type: "client" });
    }
    if (types.includes("admin")) {
      for (const email of normalizeEmailList(smtp.adminEmails)) {
        recipients.push({ email, type: "admin" });
      }
    }
    const seen = new Set<string>();
    return recipients.filter((recipient) => {
      const key = `${recipient.type}:${recipient.email.toLowerCase()}`;
      if (seen.has(key)) {
        return false;
      }
      seen.add(key);
      return true;
    });
  }

  private async saveSmtpSettings(input: EmailSmtpSettings) {
    const current = await this.settingJson<EmailSmtpSettings>("emailSmtp", {});
    return this.upsertSetting("emailSmtp", {
      adminEmails: normalizeEmailList(input.adminEmails),
      enabled: Boolean(input.enabled),
      fromEmail: input.fromEmail ?? "",
      fromName: input.fromName ?? "Dezhost",
      host: input.host ?? "",
      password: input.password === "********" ? current.password ?? "" : input.password ?? "",
      port: Number(input.port || 587),
      replyTo: input.replyTo ?? "",
      secure: Boolean(input.secure),
      username: input.username ?? ""
    });
  }

  private async settingString(key: string, fallback = "") {
    const setting = await this.prisma.systemSetting.findUnique({ where: { key } });
    return typeof setting?.value === "string" ? setting.value : fallback;
  }

  private async settingJson<T>(key: string, fallback: T): Promise<T> {
    const setting = await this.prisma.systemSetting.findUnique({ where: { key } });
    return isRecord(setting?.value) || Array.isArray(setting?.value) ? setting.value as T : fallback;
  }

  private upsertSetting(key: string, value: unknown) {
    return this.prisma.systemSetting.upsert({
      where: { key },
      create: { key, value: value as Prisma.InputJsonValue },
      update: { value: value as Prisma.InputJsonValue }
    });
  }
}

function publicSmtp(smtp: EmailSmtpSettings) {
  return {
    ...smtp,
    adminEmails: normalizeEmailList(smtp.adminEmails),
    password: smtp.password ? "********" : ""
  };
}

function normalizedRecipients(value: unknown, fallback: readonly EmailRecipientType[]) {
  const recipients = Array.isArray(value) ? value.filter((item): item is EmailRecipientType => item === "admin" || item === "client") : [];
  return recipients.length ? recipients : [...fallback];
}

function normalizeEmailList(value: unknown) {
  const raw = Array.isArray(value) ? value.join(",") : String(value ?? "");
  return raw.split(",").map((email) => email.trim()).filter(Boolean);
}

function emailFrom(smtp: EmailSmtpSettings) {
  const name = smtp.fromName || "Dezhost";
  const email = smtp.fromEmail || "no-reply@dezhost.local";
  return `${name} <${email}>`;
}

// Email language = the up-to-date recipient locale, falling back to the store's main language.
function resolveLocale(value: string | null | undefined, mainLang: string): string {
  return typeof value === "string" && value ? value : mainLang;
}

function packSubject(dict: EmailDict, key: string, fallback: string): string {
  return (dict.events as Record<string, { subject?: string } | undefined>)[key]?.subject ?? fallback;
}

function packBody(dict: EmailDict, key: string, fallback: string): string {
  return (dict.events as Record<string, { body?: string } | undefined>)[key]?.body ?? fallback;
}

function normalizeContext(value: Record<string, unknown>) {
  return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, item === undefined || item === null ? "" : String(item)]));
}

function renderText(template: string, context: Record<string, string>) {
  return template.replace(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g, (_, key: string) => context[key] ?? "");
}

function renderShell(template: string, context: Record<string, string>) {
  const content = context.content ?? "";
  return template.replace(/\{\{\s*content\s*\}\}/g, content).replace(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g, (_, key: string) => escapeHtml(context[key] ?? ""));
}

function stripHtml(value: string) {
  return value.replace(/<br\s*\/?>/gi, "\n").replace(/<[^>]*>/g, "").replace(/\n{3,}/g, "\n\n").trim();
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function stringValue(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function defaultTestVariables(currency = "EUR", locale = "de") {
  const baseUrl = (process.env.PUBLIC_WEB_URL ?? process.env.NEXT_PUBLIC_WEB_URL ?? process.env.APP_URL ?? "http://localhost:3000").replace(/\/$/, "");
  return {
    customer_email: "client@example.test",
    customer_name: "Test Client",
    domain: "example.com",
    invoice_due_date: "2026-06-01",
    invoice_number: "N-100001",
    invoice_total_amount: formatMoney(2900, currency, locale),
    order_number: "123456",
    password_reset_link: `${baseUrl}/reset-password?token=test`,
    payment_gateway: "PayPal",
    service: "Starter Hosting",
    ticket_content: "My website does not load.",
    ticket_id: "ABC12345",
    ticket_reply: "We checked the service and answered your ticket.",
    ticket_status: "Open",
    ticket_subject: "Website down",
    virtualmin_control_panel_password: "S3cre7-pass",
    virtualmin_control_panel_url: "https://server.dezhost.com:10000",
    virtualmin_control_panel_username: "client-user",
    virtualmin_imap_port: "993",
    virtualmin_mail_server: "server.dezhost.com",
    virtualmin_smtp_port: "587",
    resellbiz_domain_status: "Active",
    resellbiz_nameservers: "ns1.dezhost.com, ns2.dezhost.com"
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

async function sendSmtp(input: {
  from: string;
  fromName: string;
  html: string;
  recipient: string;
  smtp: EmailSmtpSettings;
  subject: string;
  text: string;
}) {
  if (!input.smtp.host) {
    throw new Error("SMTP host is required");
  }
  const port = Number(input.smtp.port || 587);
  const useImplicitTls = Boolean(input.smtp.secure) && port === 465;
  const useStartTls = Boolean(input.smtp.secure) && !useImplicitTls;

  let sock = await openSmtpTcp({ host: input.smtp.host, port, implicitTls: useImplicitTls });
  sock.on("error", () => undefined);
  let reader = smtpCloseAwareReader(sock);
  try {
    await reader.read();
    await reader.command(`EHLO ${input.smtp.host}`, [2]);
    if (useStartTls) {
      await reader.command("STARTTLS", [2]);
      sock.removeAllListeners();
      sock.on("error", () => undefined);
      sock = await upgradeToTls(sock, input.smtp.host);
      sock.on("error", () => undefined);
      reader = smtpCloseAwareReader(sock);
      await reader.command(`EHLO ${input.smtp.host}`, [2]);
    }
    if (input.smtp.username || input.smtp.password) {
      await reader.command("AUTH LOGIN", [3]);
      await reader.command(Buffer.from(input.smtp.username ?? "").toString("base64"), [3]);
      await reader.command(Buffer.from(input.smtp.password ?? "").toString("base64"), [2]);
    }
    await reader.command(`MAIL FROM:<${input.from}>`, [2]);
    await reader.command(`RCPT TO:<${input.recipient}>`, [2]);
    await reader.command("DATA", [3]);
    sock.write(`${dotStuff(buildMimeMessage(input))}\r\n.\r\n`);
    const response = await reader.read([2]);
    await reader.command("QUIT", [2]).catch(() => undefined);
    return response.message;
  } finally {
    sock.destroy();
  }
}

function openSmtpTcp({ host, port, implicitTls }: { host: string; implicitTls: boolean; port: number }) {
  return new Promise<net.Socket>((resolve, reject) => {
    const timer = setTimeout(() => { socket?.destroy(); reject(new Error("SMTP connection timed out")); }, 8000);
    let socket: net.Socket;
    if (implicitTls) {
      const tlsSock = tls.connect({ host, port, rejectUnauthorized: false });
      socket = tlsSock;
      tlsSock.once("secureConnect", () => { clearTimeout(timer); resolve(tlsSock); });
    } else {
      const tcpSock = net.connect({ host, port });
      socket = tcpSock;
      tcpSock.once("connect", () => { clearTimeout(timer); resolve(tcpSock); });
    }
    socket.once("error", (err) => { clearTimeout(timer); reject(err); });
  });
}

function upgradeToTls(socket: net.Socket, host: string): Promise<net.Socket> {
  return new Promise((resolve, reject) => {
    const tlsSock = tls.connect({ socket, host, rejectUnauthorized: false });
    const timer = setTimeout(() => { tlsSock.destroy(); reject(new Error("STARTTLS upgrade timed out")); }, 8000);
    tlsSock.once("secureConnect", () => { clearTimeout(timer); resolve(tlsSock); });
    tlsSock.once("error", (err) => { clearTimeout(timer); reject(err); });
  });
}

function smtpReader(socket: net.Socket) {
  let chunkBuffer = "";
  let current: string[] = [];
  const responses: Array<{ code: number; message: string }> = [];
  const waiters: Array<(response: { code: number; message: string }) => void> = [];

  socket.setEncoding("utf8");
  socket.on("data", (chunk) => {
    chunkBuffer += chunk;
    let index = chunkBuffer.indexOf("\n");
    while (index >= 0) {
      const line = chunkBuffer.slice(0, index).replace(/\r$/, "");
      chunkBuffer = chunkBuffer.slice(index + 1);
      current.push(line);
      const match = line.match(/^(\d{3})\s/);
      if (match) {
        const response = { code: Number(match[1]), message: current.join("\n") };
        current = [];
        const waiter = waiters.shift();
        if (waiter) {
          waiter(response);
        } else {
          responses.push(response);
        }
      }
      index = chunkBuffer.indexOf("\n");
    }
  });

  return {
    async command(command: string, expected: number[]) {
      socket.write(`${command}\r\n`);
      return this.read(expected);
    },
    read(expected: number[] = [2, 3]) {
      return new Promise<{ code: number; message: string }>((resolve, reject) => {
        const done = (response: { code: number; message: string }) => {
          if (!expected.includes(Math.floor(response.code / 100))) {
            reject(new Error(`SMTP rejected command: ${response.message}`));
            return;
          }
          resolve(response);
        };
        const response = responses.shift();
        if (response) {
          done(response);
          return;
        }
        waiters.push(done);
      });
    }
  };
}

function smtpCloseAwareReader(socket: net.Socket) {
  let chunkBuffer = "";
  let current: string[] = [];
  const responses: Array<{ code: number; message: string }> = [];
  const waiters: Array<{ resolve: (r: { code: number; message: string }) => void; reject: (e: Error) => void }> = [];
  let closeError: Error | null = null;

  socket.setEncoding("utf8");
  socket.on("data", (chunk) => {
    chunkBuffer += chunk;
    let index = chunkBuffer.indexOf("\n");
    while (index >= 0) {
      const line = chunkBuffer.slice(0, index).replace(/\r$/, "");
      chunkBuffer = chunkBuffer.slice(index + 1);
      current.push(line);
      const match = line.match(/^(\d{3})\s/);
      if (match) {
        const response = { code: Number(match[1]), message: current.join("\n") };
        current = [];
        const waiter = waiters.shift();
        if (waiter) {
          waiter.resolve(response);
        } else {
          responses.push(response);
        }
      }
      index = chunkBuffer.indexOf("\n");
    }
  });

  const failWaiters = (error: Error) => {
    closeError = error;
    for (const waiter of waiters.splice(0)) {
      waiter.reject(error);
    }
  };

  socket.once("error", (err) => failWaiters(err));
  socket.once("close", () => failWaiters(closeError ?? new Error("SMTP connection closed.")));

  return {
    async command(command: string, expected: number[]) {
      socket.write(`${command}\r\n`);
      return this.read(expected);
    },
    read(expected: number[] = [2, 3]) {
      return new Promise<{ code: number; message: string }>((resolve, reject) => {
        if (closeError) {
          reject(closeError);
          return;
        }
        const done = (response: { code: number; message: string }) => {
          if (!expected.includes(Math.floor(response.code / 100))) {
            reject(new Error(`SMTP rejected command: ${response.message}`));
            return;
          }
          resolve(response);
        };
        const existing = responses.shift();
        if (existing) {
          done(existing);
          return;
        }
        waiters.push({ resolve: done, reject });
      });
    }
  };
}

function buildMimeMessage(input: { from: string; fromName: string; html: string; recipient: string; subject: string; text: string }) {
  const boundary = `dezhost-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const fromDomain = input.from.includes("@") ? input.from.split("@")[1] : "dezhost.com";
  return [
    `From: ${input.fromName} <${input.from}>`,
    `To: <${input.recipient}>`,
    `Subject: ${input.subject}`,
    "MIME-Version: 1.0",
    `Date: ${new Date().toUTCString()}`,
    `Message-ID: <${Date.now()}.${Math.random().toString(16).slice(2)}@${fromDomain}>`,
    `Content-Type: multipart/alternative; boundary="${boundary}"`,
    "",
    `--${boundary}`,
    'Content-Type: text/plain; charset="UTF-8"',
    "Content-Transfer-Encoding: quoted-printable",
    "",
    toQuotedPrintable(input.text),
    "",
    `--${boundary}`,
    'Content-Type: text/html; charset="UTF-8"',
    "Content-Transfer-Encoding: quoted-printable",
    "",
    toQuotedPrintable(input.html),
    "",
    `--${boundary}--`
  ].join("\r\n");
}

function toQuotedPrintable(input: string): string {
  // Normalize line endings to CRLF before encoding
  const normalized = input.replace(/\r\n/g, "\n").replace(/\r/g, "\n").replace(/\n/g, "\r\n");
  let result = "";
  for (const line of normalized.split("\r\n")) {
    let encoded = "";
    for (let i = 0; i < line.length; i++) {
      const code = line.charCodeAt(i);
      // Encode non-printable ASCII, non-ASCII, and the '=' character
      if (code === 61 || code < 33 || code > 126) {
        // Tab (9) and space (32) are printable but must be encoded at end of line (handled below)
        if (code === 9 || code === 32) {
          encoded += line[i];
        } else {
          encoded += `=${code.toString(16).toUpperCase().padStart(2, "0")}`;
        }
      } else {
        encoded += line[i];
      }
    }
    // Trailing whitespace must be encoded in QP
    encoded = encoded.replace(/([ \t]+)$/, (match) =>
      [...match].map((ch) => `=${ch.charCodeAt(0).toString(16).toUpperCase().padStart(2, "0")}`).join("")
    );
    // Soft line breaks at 76 characters (including the trailing =)
    while (encoded.length > 75) {
      // Don't break inside an encoded sequence =XX or leave a dangling =
      let split = 75;
      while (split > 0 && (encoded[split - 1] === "=" || encoded[split - 2] === "=")) {
        split--;
      }
      if (split === 0) split = 75;
      result += encoded.slice(0, split) + "=\r\n";
      encoded = encoded.slice(split);
    }
    result += encoded + "\r\n";
  }
  // Remove trailing CRLF added to last line
  return result.endsWith("\r\n") ? result.slice(0, -2) : result;
}

function dotStuff(message: string) {
  return message.replace(/^\./gm, "..");
}
