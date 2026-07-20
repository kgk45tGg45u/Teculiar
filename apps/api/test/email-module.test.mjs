import assert from "node:assert/strict";
import net from "node:net";
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import { AuthService } from "../dist/modules/auth/auth.service.js";
import { EmailService } from "../dist/modules/email/email.service.js";

test("email module exposes admin settings, placeholders, logs, and admin UI route", async () => {
  const appModule = await readFile(new URL("../src/app.module.ts", import.meta.url), "utf8");
  const controller = await readFile(new URL("../src/modules/email/email.controller.ts", import.meta.url), "utf8");
  const layouts = await readFile(new URL("../src/modules/email/email-layouts.ts", import.meta.url), "utf8");
  const placeholders = await readFile(new URL("../src/modules/email/email-placeholders.ts", import.meta.url), "utf8");
  const dashboard = await readFile(new URL("../../web/components/admin/admin-dashboard.tsx", import.meta.url), "utf8");
  const sidebar = await readFile(new URL("../../web/components/admin/admin-sidebar.tsx", import.meta.url), "utf8");

  assert.match(appModule, /EmailModule/);
  assert.match(controller, /@Controller\("admin\/dev\/emails"\)/);
  assert.match(controller, /@Get\(\)/);
  assert.match(controller, /@Patch\(\)/);
  assert.match(controller, /@Post\("test"\)/);
  assert.match(controller, /@Post\("test-connection"\)/);
  assert.match(placeholders, /customer_name/);
  assert.match(placeholders, /invoice_total_amount/);
  assert.match(placeholders, /password_reset_link/);
  assert.match(placeholders, /ticket_content/);
  assert.match(layouts, /new_invoice/);
  assert.match(layouts, /invoiceTable/);
  assert.match(layouts, /renderEmailLayout/);
  assert.match(sidebar, /href: "\/admin\/emails"/);
  assert.match(sidebar, /href: "\/admin\/emails\/settings"/);
  assert.match(sidebar, /href: "\/admin\/emails\/template"/);
  assert.match(sidebar, /href: "\/admin\/emails\/logs"/);
  assert.match(dashboard, /view === "emails"/);
  assert.ok(existsSync(new URL("../../web/app/admin/emails/page.tsx", import.meta.url)));
  assert.ok(existsSync(new URL("../../web/app/admin/emails/settings/page.tsx", import.meta.url)));
  assert.ok(existsSync(new URL("../../web/app/admin/emails/template/page.tsx", import.meta.url)));
  assert.ok(existsSync(new URL("../../web/app/admin/emails/logs/page.tsx", import.meta.url)));
});

test("email admin UI: DND-Kit blocks, per-language switch, active toggle, grouped list, viewport preview", async () => {
  const forms = await readFile(new URL("../../web/components/admin/email-admin-editor.tsx", import.meta.url), "utf8");

  assert.match(forms, /EmailTemplateEditor/);
  assert.match(forms, /EmailBlockPalette/);
  assert.match(forms, /layoutBlocks/);
  // DND-Kit replaced the hand-rolled HTML5 drag for content blocks.
  assert.match(forms, /@dnd-kit\/core/);
  assert.match(forms, /useSortable/);
  assert.match(forms, /DndContext/);
  assert.match(forms, /arrayMove/);
  // Per-language editing (fixes the German-only bug + Phase 7.2).
  assert.match(forms, /LanguageSwitcher/);
  assert.match(forms, /locale: activeLocale/);
  assert.match(forms, /\?locale=\$\{encodeURIComponent/);
  // Active/inactive toggle per event row.
  assert.match(forms, /emailToggle/);
  assert.match(forms, /updateEnabled/);
  // Grouped list.
  assert.match(forms, /groupEvents/);
  // Viewport-accurate device preview (Desktop / Tablet / Mobile), scaled + contained.
  assert.match(forms, /EmailDevicePreview/);
  assert.match(forms, /PREVIEW_DEVICES/);
  assert.match(forms, /srcDoc=\{html\}/);
  assert.match(forms, /ResizeObserver/);
  assert.match(forms, /mobile/i);
  assert.match(forms, /tablet/i);
  assert.match(forms, /desktop/i);
});

test("email dispatch honors enabled flag and client-only recipient defaults", async () => {
  const logs = [];
  const settings = new Map([
    ["emailSmtp", { fromEmail: "support@example.test", adminEmails: ["admin@example.test"] }],
    ["emailEventConfigs", { domain_information: { enabled: true, recipients: ["client"] }, new_invoice: { enabled: false, recipients: ["admin", "client"] } }]
  ]);
  const email = new EmailService(fakePrisma(settings, logs));

  await email.dispatch("domain_information", {
    context: { customer_name: "Ada", domain: "example.com" },
    user: { email: "client@example.test", id: "user-1", name: "Ada" }
  });
  await email.dispatch("new_invoice", {
    context: { invoice_number: "N-100001" },
    user: { email: "client@example.test", id: "user-1", name: "Ada" }
  });

  assert.equal(logs.length, 1);
  assert.equal(logs[0].to, "client@example.test");
  assert.equal(logs[0].template, "domain_information");
  assert.equal(logs[0].payload.from, "Teculiar <support@example.test>");
  assert.equal(logs[0].payload.recipientType, "client");
  assert.match(logs[0].payload.html, /example\.com/);
});

test("email dispatch renders modular event layouts inside the main template", async () => {
  const logs = [];
  const settings = new Map([
    ["emailSmtp", { fromEmail: "support@example.test", adminEmails: [] }],
    ["emailEventConfigs", { new_invoice: { enabled: true, recipients: ["client"] } }],
    ["emailLayoutBlocks", {
      new_invoice: [
        {
          id: "invoice-summary",
          rows: [
            { label: "Invoice", value: "{{invoice_number}}" },
            { label: "Total", value: "{{invoice_total_amount}}" }
          ],
          title: "Invoice summary",
          type: "keyValueTable"
        },
        {
          columns: ["Service", "Amount"],
          id: "invoice-lines",
          rows: [{ cells: ["{{service}}", "{{invoice_total_amount}}"] }],
          title: "Invoice lines",
          type: "invoiceTable"
        }
      ]
    }]
  ]);
  const email = new EmailService(fakePrisma(settings, logs));

  await email.dispatch("new_invoice", {
    context: {
      invoice_number: "N-200001",
      invoice_total_amount: "49.00 EUR",
      service: "Managed Hosting"
    },
    user: { email: "client@example.test", id: "user-1", name: "Ada" }
  });

  assert.equal(logs.length, 1);
  assert.match(logs[0].payload.html, /Invoice summary/);
  assert.match(logs[0].payload.html, /<table role="presentation"/);
  assert.match(logs[0].payload.html, /Managed Hosting/);
  assert.match(logs[0].payload.html, /49\.00 EUR/);
});

test("email header renders the configured brand logo as an absolute <img>", async () => {
  const logs = [];
  const settings = new Map([
    ["emailSmtp", { fromEmail: "support@example.test", fromName: "Dezhost", adminEmails: [] }],
    ["emailEventConfigs", { welcome: { enabled: true, recipients: ["client"] } }],
    // Stored as a relative upload path — the email must make it absolute (external mail clients
    // can't resolve /uploads/...).
    ["siteLogoUrl", "/uploads/site-logo-1.svg"]
  ]);
  const email = new EmailService(fakePrisma(settings, logs));

  await email.dispatch("welcome", { user: { email: "client@example.test", id: "user-1", name: "Ada" } });

  assert.equal(logs.length, 1);
  assert.match(logs[0].payload.html, /<img src="https?:\/\/[^"]+\/uploads\/site-logo-1\.svg" alt="Dezhost"/);
});

test("email header falls back to the favicon, then to brand-name text when no logo is set", async () => {
  const logs = [];
  // No siteLogoUrl → favicon is used.
  const withFavicon = new Map([
    ["emailSmtp", { fromEmail: "support@example.test", fromName: "Dezhost", adminEmails: [] }],
    ["emailEventConfigs", { welcome: { enabled: true, recipients: ["client"] } }],
    ["faviconUrl", "https://cdn.example.test/favicon.png"]
  ]);
  const email = new EmailService(fakePrisma(withFavicon, logs));
  await email.dispatch("welcome", { user: { email: "client@example.test", id: "user-1", name: "Ada" } });
  assert.match(logs[0].payload.html, /<img src="https:\/\/cdn\.example\.test\/favicon\.png"/);

  // Neither configured → no <img>, the header keeps the brand-name text only.
  const noLogo = [];
  const plain = new Map([
    ["emailSmtp", { fromEmail: "support@example.test", fromName: "Dezhost", adminEmails: [] }],
    ["emailEventConfigs", { welcome: { enabled: true, recipients: ["client"] } }]
  ]);
  const emailPlain = new EmailService(fakePrisma(plain, noLogo));
  await emailPlain.dispatch("welcome", { user: { email: "client@example.test", id: "user-1", name: "Ada" } });
  assert.doesNotMatch(noLogo[0].payload.html, /<img src=/);
});

test("email dispatch localizes subject and default layout by the recipient's User.locale", async () => {
  const logs = [];
  const settings = new Map([
    ["emailSmtp", { fromEmail: "support@example.test", adminEmails: [] }],
    ["emailEventConfigs", { welcome: { enabled: true, recipients: ["client"] } }],
    // Main language is English, but the recipient is German — the email must follow the recipient.
    ["i18n.languages", { main: "en", others: ["de"] }]
  ]);
  const email = new EmailService(fakePrisma(settings, logs));

  await email.dispatch("welcome", {
    user: { email: "client@example.test", id: "user-1", locale: "de", name: "Ada" }
  });

  assert.equal(logs.length, 1);
  assert.equal(logs[0].subject, "Willkommen"); // German pack subject
  assert.match(logs[0].payload.html, /willkommen bei/); // German default layout copy
});

test("email dispatch falls back to the main language when User.locale is unset", async () => {
  const logs = [];
  const settings = new Map([
    ["emailSmtp", { fromEmail: "support@example.test", adminEmails: [] }],
    ["emailEventConfigs", { welcome: { enabled: true, recipients: ["client"] } }],
    ["i18n.languages", { main: "de", others: ["en"] }]
  ]);
  const email = new EmailService(fakePrisma(settings, logs));

  await email.dispatch("welcome", {
    user: { email: "client@example.test", id: "user-1", name: "Ada" }
  });

  assert.equal(logs.length, 1);
  assert.equal(logs[0].subject, "Willkommen"); // main language (de) drives the fallback
});

test("password reset request emits reset link email without revealing missing accounts", async () => {
  const calls = [];
  const users = {
    findByEmail: async (email) => email === "client@example.test"
      ? { email, id: "user-1", name: "Client User", passwordHash: "old-hash", userRoles: [] }
      : null,
    createAuditLog: async () => undefined
  };
  const email = {
    dispatch: async (eventKey, payload) => calls.push([eventKey, payload])
  };
  const auth = new AuthService({ signAsync: async () => "jwt" }, users, email);

  const result = await auth.requestPasswordReset(" Client@Example.Test ");
  const missing = await auth.requestPasswordReset("missing@example.test");

  assert.deepEqual(result, { ok: true });
  assert.deepEqual(missing, { ok: true });
  assert.equal(calls.length, 1);
  assert.equal(calls[0][0], "password_reset");
  assert.equal(calls[0][1].user.email, "client@example.test");
  assert.match(calls[0][1].context.password_reset_link, /reset-password\?token=/);
});

test("smtp-enabled test emails can be captured by Mailpit-compatible SMTP", async (context) => {
  const received = [];
  const server = net.createServer((socket) => {
    let dataMode = false;
    let message = "";
    socket.write("220 test smtp\r\n");
    socket.on("data", (chunk) => {
      const text = chunk.toString("utf8");
      if (dataMode) {
        message += text;
        if (message.includes("\r\n.\r\n")) {
          received.push(message);
          dataMode = false;
          socket.write("250 queued\r\n");
        }
        return;
      }
      for (const line of text.split(/\r?\n/).filter(Boolean)) {
        if (line.startsWith("EHLO") || line.startsWith("HELO")) socket.write("250-localhost\r\n250 OK\r\n");
        else if (line.startsWith("MAIL FROM")) socket.write("250 OK\r\n");
        else if (line.startsWith("RCPT TO")) socket.write("250 OK\r\n");
        else if (line === "DATA") {
          dataMode = true;
          socket.write("354 end\r\n");
        } else if (line === "QUIT") {
          socket.write("221 bye\r\n");
          socket.end();
        } else socket.write("250 OK\r\n");
      }
    });
  });
  try {
    await new Promise((resolve, reject) => {
      server.once("error", reject);
      server.listen(0, "127.0.0.1", resolve);
    });
  } catch (error) {
    if (error?.code === "EPERM") {
      context.skip("sandbox blocks local SMTP listener");
      return;
    }
    throw error;
  }
  const port = server.address().port;
  const logs = [];
  const settings = new Map([
    ["emailSmtp", { adminEmails: [], enabled: true, fromEmail: "support@example.test", host: "127.0.0.1", port }],
    ["emailEventConfigs", { password_reset: { enabled: true, recipients: ["client"] } }],
    // Main language English so the captured subject is the English pack default.
    ["i18n.languages", { main: "en", others: ["de"] }]
  ]);
  const email = new EmailService(fakePrisma(settings, logs));

  try {
    await email.sendTest("password_reset", { customer_email: "client@example.test", password_reset_link: "http://localhost/reset" });
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }

  assert.equal(logs[0].status, "SENT");
  assert.match(received[0], /Subject: Password Reset/);
  assert.match(received[0], /client@example.test/);
});

test("module-gated events are hidden in the editor and never dispatched when the module is inactive", async () => {
  const logs = [];
  const settings = new Map([
    ["emailSmtp", { fromEmail: "support@example.test", adminEmails: [] }],
    ["emailEventConfigs", { domain_information: { enabled: true, recipients: ["client"] } }],
    ["module.virtualmin.active", 0],
    ["module.resellbiz.active", false]
  ]);
  const email = new EmailService(fakePrisma(settings, logs));

  const admin = await email.adminSettings();
  const keys = admin.events.map((event) => event.key);
  // The three hosting mails (virtualmin) and the domain mail (resellbiz) disappear entirely.
  for (const gated of ["hosting_account_information", "hosting_account_suspended", "hosting_account_terminated", "domain_information"]) {
    assert.ok(!keys.includes(gated), `${gated} should be hidden`);
  }
  assert.ok(keys.includes("new_invoice"));
  assert.deepEqual(admin.activeModules, []);

  // Dispatch is blocked for gated events even if something triggers them.
  await email.dispatch("domain_information", { user: { email: "c@example.test", id: "u1", name: "Ada" } });
  await email.dispatch("hosting_account_information", { user: { email: "c@example.test", id: "u1", name: "Ada" } });
  assert.equal(logs.length, 0);

  // With the modules active, the events come back and dispatch works.
  settings.set("module.virtualmin.active", 1);
  settings.set("module.resellbiz.active", true);
  const active = await email.adminSettings();
  assert.ok(active.events.map((event) => event.key).includes("domain_information"));
  await email.dispatch("domain_information", { user: { email: "c@example.test", id: "u1", name: "Ada" } });
  assert.equal(logs.length, 1);
});

test("per-locale editing keeps each language separate and dispatches in the recipient's language", async () => {
  const logs = [];
  const settings = new Map([
    ["emailSmtp", { fromEmail: "support@example.test", adminEmails: [] }],
    ["i18n.languages", { main: "de", others: ["en"] }]
  ]);
  const email = new EmailService(fakePrisma(settings, logs));

  await email.updateSettings({ events: [{ key: "new_invoice", enabled: true, recipients: ["client"], subject: "DE Rechnung", layoutBlocks: [{ id: "t", type: "text", content: "DE-Text {{customer_name}}" }] }] }, "de");
  await email.updateSettings({ events: [{ key: "new_invoice", enabled: true, recipients: ["client"], subject: "EN Invoice", layoutBlocks: [{ id: "t", type: "text", content: "EN text {{customer_name}}" }] }] }, "en");

  const de = await email.adminSettings("de");
  const en = await email.adminSettings("en");
  assert.equal(en.locale, "en");
  assert.deepEqual(en.languages, { main: "de", others: ["en"] });
  assert.equal(de.events.find((event) => event.key === "new_invoice").subject, "DE Rechnung");
  assert.equal(en.events.find((event) => event.key === "new_invoice").subject, "EN Invoice");

  // An English customer receives the English content — the German-only bug is gone.
  await email.dispatch("new_invoice", { user: { email: "c@example.test", id: "u1", locale: "en", name: "Ada" } });
  assert.equal(logs.length, 1);
  assert.equal(logs[0].subject, "EN Invoice");
  assert.match(logs[0].payload.html, /EN text Ada/);
  assert.doesNotMatch(logs[0].payload.html, /DE-Text/);
});

function fakePrisma(settings, logs) {
  return {
    emailLog: {
      create: async ({ data }) => {
        logs.push(data);
        return data;
      },
      findMany: async () => logs
    },
    // Persist per key+locale so per-language editing can be asserted end-to-end.
    emailTemplate: (() => {
      const store = new Map();
      const idOf = (where) => `${where.key_locale.key}:${where.key_locale.locale}`;
      return {
        findUnique: async ({ where }) => store.get(idOf(where)) ?? null,
        upsert: async ({ create, update, where }) => {
          const existing = store.get(idOf(where));
          const row = existing ? { ...existing, ...update } : { ...create };
          store.set(idOf(where), row);
          return row;
        }
      };
    })(),
    systemSetting: {
      findUnique: async ({ where }) => settings.has(where.key) ? { key: where.key, value: settings.get(where.key) } : null,
      // Module active-state lookup (email dispatch reads module.<name>.active). Return only the
      // stored rows in the requested key set; absent rows default the module to active.
      findMany: async ({ where }) => (where?.key?.in ?? [])
        .filter((key) => settings.has(key))
        .map((key) => ({ key, value: settings.get(key) })),
      upsert: async ({ create, update, where }) => {
        settings.set(where.key, update.value);
        return { ...create, value: update.value };
      }
    }
  };
}
