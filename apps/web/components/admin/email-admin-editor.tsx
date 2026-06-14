"use client";

import type { DragEvent } from "react";
import { GripVertical, Mail, Plus, Save, Send, Trash2 } from "lucide-react";
import { useRef, useState } from "react";
import { API_BASE_URL, authHeaders, type ApiEmailAdminSettings, type ApiEmailLayoutBlock, type ApiEmailLog } from "../../lib/api";
import { Button } from "../ui/button";
import { notifyResponse } from "../ui/toast-provider";
import styles from "./admin-dashboard.module.css";

type EmailSettingsPatch = {
  events?: Array<{
    body?: string;
    enabled?: boolean;
    key: string;
    layoutBlocks?: ApiEmailLayoutBlock[];
    recipients?: string[];
    subject?: string;
  }>;
  smtp?: ApiEmailAdminSettings["smtp"];
  templateHtml?: string;
  testVariables?: Record<string, unknown>;
};

type EmailEvent = ApiEmailAdminSettings["events"][number];
type EmailPlaceholder = ApiEmailAdminSettings["placeholders"][number];

// Each shortcode group gets its own tag colour so admins can tell at a glance what a
// placeholder relates to (tickets, invoices, the Virtualmin module, …).
const PLACEHOLDER_GROUP_CLASS: Record<string, string | undefined> = {
  general: styles.tagGeneral,
  customer: styles.tagCustomer,
  invoice: styles.tagInvoice,
  payment: styles.tagPayment,
  order: styles.tagOrder,
  service: styles.tagService,
  domain: styles.tagDomain,
  ticket: styles.tagTicket,
  virtualmin: styles.tagVirtualmin,
  resellbiz: styles.tagResellbiz
};

export function EmailSettingsForm({ initial, section = "emails", timezone = "UTC" }: { initial: ApiEmailAdminSettings; section?: "emails" | "logs" | "settings" | "template"; timezone?: string }) {
  const [settings, setSettings] = useState(initial);
  const [message, setMessage] = useState("");

  async function refresh() {
    const next = await fetch(`${API_BASE_URL}/admin/dev/emails`, { headers: authHeaders() }).then((item) => item.json()).catch(() => settings);
    setSettings(next);
  }

  async function save(payload: EmailSettingsPatch): Promise<boolean> {
    const response = await fetch(`${API_BASE_URL}/admin/dev/emails`, {
      body: JSON.stringify(payload),
      headers: { "Content-Type": "application/json", ...authHeaders() },
      method: "PATCH"
    });
    const responsePayload = await response.clone().json().catch(() => undefined);
    if (response.ok && responsePayload?.events) {
      setSettings(responsePayload as ApiEmailAdminSettings);
    }
    setMessage(await notifyResponse(response, "Email settings saved.", "Email settings failed."));
    return response.ok;
  }

  async function sendTest(eventKey: string) {
    const response = await fetch(`${API_BASE_URL}/admin/dev/emails/test`, {
      body: JSON.stringify({ eventKey }),
      headers: { "Content-Type": "application/json", ...authHeaders() },
      method: "POST"
    });
    const payload = await response.clone().json().catch(() => []);
    setMessage(await notifyResponse(response, `Test email logged (${Array.isArray(payload) ? payload.length : 0}).`, "Test email failed."));
    if (response.ok) {
      await refresh();
    }
  }

  return (
    <div className={`${styles.form} ${styles.emailCompact}`}>
      {section === "settings" ? <EmailSmtpSettingsSection settings={settings} save={save} sendTest={sendTest} /> : null}
      {section === "template" ? <EmailTemplateEditor settings={settings} save={save} /> : null}
      {section === "logs" ? <EmailLogsTable logs={settings.logs} timezone={timezone} /> : null}
      {section === "emails" ? <EmailEventsEditor settings={settings} save={save} sendTest={sendTest} /> : null}
      {message ? <p>{message}</p> : null}
    </div>
  );
}

function EmailSmtpSettingsSection({ save, sendTest, settings }: {
  save: (payload: EmailSettingsPatch) => Promise<boolean>;
  sendTest: (eventKey: string) => Promise<void>;
  settings: ApiEmailAdminSettings;
}) {
  const formRef = useRef<HTMLFormElement>(null);
  const [testResult, setTestResult] = useState<{ ok: boolean; message: string } | null>(null);
  const [testing, setTesting] = useState(false);

  function collectSmtp(formData: FormData): ApiEmailAdminSettings["smtp"] {
    return {
      adminEmails: splitComma(formData.get("adminEmails")),
      enabled: formData.get("smtpEnabled") === "on",
      fromEmail: String(formData.get("fromEmail") ?? ""),
      fromName: String(formData.get("fromName") ?? ""),
      host: String(formData.get("host") ?? ""),
      password: String(formData.get("password") ?? ""),
      port: Number(formData.get("port") ?? 587),
      replyTo: String(formData.get("replyTo") ?? ""),
      secure: formData.get("secure") === "on",
      username: String(formData.get("username") ?? "")
    };
  }

  async function submit(formData: FormData) {
    setTestResult(null);
    await save({ smtp: collectSmtp(formData) });
  }

  async function saveAndTest(formData: FormData) {
    setTestResult(null);
    setTesting(true);
    const smtp = collectSmtp(formData);
    const saved = await save({ smtp });
    if (!saved) {
      setTestResult({ ok: false, message: "Settings could not be saved. Check the error above." });
      setTesting(false);
      return;
    }
    try {
      const response = await fetch(`${API_BASE_URL}/admin/dev/emails/test-connection`, {
        body: JSON.stringify({ smtp }),
        headers: { "Content-Type": "application/json", ...authHeaders() },
        method: "POST"
      });
      const result = await response.json().catch(() => ({ ok: false, message: "Unexpected response" }));
      setTestResult(result as { ok: boolean; message: string });
    } catch {
      setTestResult({ ok: false, message: "Request failed." });
    } finally {
      setTesting(false);
    }
  }

  return (
    <form ref={formRef} className={styles.form} onSubmit={(e) => e.preventDefault()}>
      <fieldset className={styles.lineEditor}>
        <legend>SMTP</legend>
        <label><span><input defaultChecked={Boolean(settings.smtp.enabled)} name="smtpEnabled" type="checkbox" /> Enable SMTP</span></label>
        <label>From name<input defaultValue={settings.smtp.fromName ?? "Dezhost"} name="fromName" /></label>
        <label>From email<input defaultValue={settings.smtp.fromEmail ?? ""} name="fromEmail" type="email" /></label>
        <label>Reply-to<input defaultValue={settings.smtp.replyTo ?? ""} name="replyTo" type="email" /></label>
        <label>Admin recipients<input defaultValue={(settings.smtp.adminEmails ?? []).join(", ")} name="adminEmails" placeholder="admin@example.com, billing@example.com" /></label>
        <label>Host<input defaultValue={settings.smtp.host ?? ""} name="host" placeholder="smtp.example.com" /></label>
        <label>Port<input defaultValue={settings.smtp.port ?? 587} name="port" type="number" /></label>
        <label>Username<input defaultValue={settings.smtp.username ?? ""} name="username" /></label>
        <label>Password<input defaultValue={settings.smtp.password ?? ""} name="password" type="password" /></label>
        <label><span><input defaultChecked={Boolean(settings.smtp.secure)} name="secure" type="checkbox" /> TLS/SSL</span></label>
      </fieldset>
      {testResult ? (
        <p style={{ color: testResult.ok ? "var(--success, green)" : "var(--danger, red)", fontWeight: 600 }}>
          {testResult.ok ? "✓" : "✗"} {testResult.message}
        </p>
      ) : null}
      <div className={styles.inlineForm}>
        <Button icon={Save} type="button" onClick={() => { if (formRef.current) submit(new FormData(formRef.current)); }}>Save Settings</Button>
        <Button icon={Mail} type="button" variant="secondary" disabled={testing} onClick={() => { if (formRef.current) saveAndTest(new FormData(formRef.current)); }}>
          {testing ? "Testing…" : "Save & Test Connection"}
        </Button>
        <Button icon={Send} type="button" variant="secondary" onClick={() => sendTest("new_invoice")}>Send Test Email</Button>
      </div>
    </form>
  );
}

function EmailTemplateEditor({ save, settings }: {
  save: (payload: EmailSettingsPatch) => Promise<boolean>;
  settings: ApiEmailAdminSettings;
}) {
  const [templateHtml, setTemplateHtml] = useState(settings.templateHtml);
  const [previewKey, setPreviewKey] = useState(settings.events[0]?.key ?? "");
  const sampleEvent = settings.events.find((event) => event.key === previewKey) ?? settings.events[0];
  const previewHtml = renderEmailPreview(templateHtml, sampleEvent?.layoutBlocks ?? [], sampleEvent?.subject ?? "Email Preview", settings.testVariables);

  async function submit() {
    await save({ templateHtml });
  }

  return (
    <div className={styles.emailSplit}>
      <form action={submit} className={styles.form}>
        <label>Template HTML<textarea value={templateHtml} onChange={(event) => setTemplateHtml(event.target.value)} name="templateHtml" rows={24} /></label>
        <label>Preview email<select value={previewKey} onChange={(event) => setPreviewKey(event.target.value)}>{settings.events.map((event) => <option key={event.key} value={event.key}>{event.subject}</option>)}</select></label>
        <PlaceholderTray placeholders={settings.placeholders} />
        <Button icon={Save} type="submit">Save Template</Button>
      </form>
      <EmailPreviewFrames html={previewHtml} />
    </div>
  );
}

function EmailEventsEditor({ save, sendTest, settings }: {
  save: (payload: EmailSettingsPatch) => Promise<boolean>;
  sendTest: (eventKey: string) => Promise<void>;
  settings: ApiEmailAdminSettings;
}) {
  const [events, setEvents] = useState(settings.events);
  const [selectedKey, setSelectedKey] = useState(settings.events[0]?.key ?? "");
  const selected = events.find((event) => event.key === selectedKey) ?? events[0];
  const previewHtml = selected ? renderEmailPreview(settings.templateHtml, selected.layoutBlocks, selected.subject, settings.testVariables) : "";

  function updateSelected(patch: Partial<EmailEvent>) {
    if (!selected) {
      return;
    }
    const key = selected.key;
    setEvents((items) => items.map((event) => event.key === key ? { ...event, ...patch } : event));
  }

  function updateBlocks(layoutBlocks: ApiEmailLayoutBlock[]) {
    updateSelected({ layoutBlocks });
  }

  async function submit() {
    await save({
      events: events.map((event) => ({
        body: event.body,
        enabled: event.enabled,
        key: event.key,
        layoutBlocks: event.layoutBlocks,
        recipients: event.recipients,
        subject: event.subject
      }))
    });
  }

  if (!selected) {
    return null;
  }

  return (
    <div className={styles.emailDesigner}>
      <aside className={styles.emailEventList}>
        {events.map((event) => (
          <button aria-current={event.key === selected.key ? "page" : undefined} key={event.key} onClick={() => setSelectedKey(event.key)} type="button">
            <strong>{event.subject}</strong>
            <span>{event.trigger}</span>
          </button>
        ))}
      </aside>
      <form action={submit} className={styles.form}>
        <fieldset className={styles.lineEditor}>
          <legend>{selected.key}</legend>
          <label><span><input checked={selected.enabled} onChange={(event) => updateSelected({ enabled: event.target.checked })} type="checkbox" /> Enabled</span></label>
          <label>Subject<input value={selected.subject} onChange={(event) => updateSelected({ subject: event.target.value })} /></label>
          <div className={styles.inlineForm}>
            <label><span><input checked={selected.recipients.includes("admin")} onChange={(event) => updateSelected({ recipients: toggleRecipient(selected.recipients, "admin", event.target.checked) })} type="checkbox" /> Admin</span></label>
            <label><span><input checked={selected.recipients.includes("client")} onChange={(event) => updateSelected({ recipients: toggleRecipient(selected.recipients, "client", event.target.checked) })} type="checkbox" /> Client</span></label>
          </div>
        </fieldset>
        <EmailBlockPalette blockLibrary={settings.blockLibrary} onAdd={(type) => updateBlocks([...selected.layoutBlocks, createBlock(type)])} />
        <EmailBlockList blocks={selected.layoutBlocks} onChange={updateBlocks} />
        <PlaceholderTray placeholders={settings.placeholders} />
        <div className={styles.inlineForm}>
          <Button icon={Save} type="submit">Save Emails</Button>
          <Button icon={Send} type="button" variant="secondary" onClick={() => sendTest(selected.key)}>Send Test</Button>
        </div>
      </form>
      <EmailPreviewFrames html={previewHtml} />
    </div>
  );
}

function EmailBlockPalette({ blockLibrary, onAdd }: {
  blockLibrary?: ApiEmailAdminSettings["blockLibrary"];
  onAdd: (type: ApiEmailLayoutBlock["type"]) => void;
}) {
  const library = blockLibrary?.length ? blockLibrary : DEFAULT_BLOCK_LIBRARY;
  return (
    <div className={styles.emailBlockPalette}>
      {library.map((block) => (
        <button
          draggable
          key={block.type}
          onClick={() => onAdd(block.type)}
          onDragStart={(event) => event.dataTransfer.setData("application/email-block", block.type)}
          type="button"
        >
          <Plus size={14} />
          <span>{block.label}</span>
        </button>
      ))}
    </div>
  );
}

// Drag-and-drop block list. Reordering removes the dragged block first and re-inserts it
// relative to the hovered block based on the pointer position (top half = before, bottom
// half = after), which avoids the off-by-one jumps the previous implementation had. Only the
// grip handle is draggable so editing the fields never starts an accidental drag.
function EmailBlockList({ blocks, onChange }: { blocks: ApiEmailLayoutBlock[]; onChange: (blocks: ApiEmailLayoutBlock[]) => void }) {
  const [dragId, setDragId] = useState<string | null>(null);
  const [overId, setOverId] = useState<string | null>(null);
  const [overPos, setOverPos] = useState<"after" | "before">("before");

  function clearDrag() {
    setDragId(null);
    setOverId(null);
  }

  function moveBlock(fromId: string, targetId: string | null, position: "after" | "before") {
    if (fromId === targetId) {
      return;
    }
    const moved = blocks.find((block) => block.id === fromId);
    if (!moved) {
      return;
    }
    const without = blocks.filter((block) => block.id !== fromId);
    const targetIndex = targetId ? without.findIndex((block) => block.id === targetId) : -1;
    if (targetIndex < 0) {
      without.push(moved);
    } else {
      without.splice(position === "after" ? targetIndex + 1 : targetIndex, 0, moved);
    }
    onChange(without);
  }

  function insertNew(type: ApiEmailLayoutBlock["type"], targetId: string | null, position: "after" | "before") {
    const next = [...blocks];
    const targetIndex = targetId ? next.findIndex((block) => block.id === targetId) : -1;
    const block = createBlock(type);
    if (targetIndex < 0) {
      next.push(block);
    } else {
      next.splice(position === "after" ? targetIndex + 1 : targetIndex, 0, block);
    }
    onChange(next);
  }

  function positionFor(event: DragEvent<HTMLElement>): "after" | "before" {
    const rect = event.currentTarget.getBoundingClientRect();
    return event.clientY - rect.top > rect.height / 2 ? "after" : "before";
  }

  // A drag carries a block operation when it sets either the "new block" type (palette) or a
  // block id (reorder). Plain-text shortcode drops set neither — we must leave those alone so the
  // browser performs its native text insertion into the targeted input/textarea.
  function isBlockDrag(event: DragEvent<HTMLElement>) {
    return event.dataTransfer.types.includes("application/email-block") || event.dataTransfer.types.includes("application/email-block-id");
  }

  function onSummaryDragOver(event: DragEvent<HTMLElement>, blockId: string) {
    if (!isBlockDrag(event)) {
      return;
    }
    event.preventDefault();
    setOverId(blockId);
    setOverPos(positionFor(event));
  }

  function onSummaryDrop(event: DragEvent<HTMLElement>, blockId: string) {
    if (!isBlockDrag(event)) {
      return;
    }
    event.preventDefault();
    // Stop the drop from also bubbling to the list container handler, which would otherwise
    // run with a stale `blocks` closure and clobber this reorder (e.g. move the block to the end).
    event.stopPropagation();
    const position = positionFor(event);
    const newType = event.dataTransfer.getData("application/email-block");
    const moveId = event.dataTransfer.getData("application/email-block-id");
    if (newType) {
      insertNew(newType as ApiEmailLayoutBlock["type"], blockId, position);
    } else if (moveId) {
      moveBlock(moveId, blockId, position);
    }
    clearDrag();
  }

  function onListDragOver(event: DragEvent<HTMLElement>) {
    if (isBlockDrag(event)) {
      event.preventDefault();
    }
  }

  function onListDrop(event: DragEvent<HTMLElement>) {
    if (!isBlockDrag(event)) {
      return;
    }
    event.preventDefault();
    const newType = event.dataTransfer.getData("application/email-block");
    const moveId = event.dataTransfer.getData("application/email-block-id");
    if (newType) {
      insertNew(newType as ApiEmailLayoutBlock["type"], null, "after");
    } else if (moveId) {
      moveBlock(moveId, null, "after");
    }
    clearDrag();
  }

  return (
    <div className={styles.emailBlockList} onDragOver={onListDragOver} onDrop={onListDrop}>
      {blocks.map((block) => (
        <details
          className={styles.emailBuilderBlock}
          data-drop={overId === block.id && dragId ? overPos : undefined}
          data-dragging={dragId === block.id ? "true" : undefined}
          key={block.id}
          open
        >
          <summary onDragOver={(event) => onSummaryDragOver(event, block.id)} onDrop={(event) => onSummaryDrop(event, block.id)}>
            <span
              aria-label="Drag to reorder"
              className={styles.emailBlockGrip}
              draggable
              onDragEnd={clearDrag}
              onDragStart={(event) => {
                event.dataTransfer.setData("application/email-block-id", block.id);
                event.dataTransfer.effectAllowed = "move";
                setDragId(block.id);
              }}
            >
              <GripVertical size={15} />
            </span>
            <strong>{blockLabel(block.type)}</strong>
            <span>{block.title || block.content || block.type}</span>
            <button onClick={(event) => {
              event.preventDefault();
              onChange(blocks.filter((item) => item.id !== block.id));
            }} type="button"><Trash2 size={15} /></button>
          </summary>
          <EmailBlockFields block={block} onChange={(patch) => onChange(blocks.map((item) => item.id === block.id ? { ...item, ...patch } : item))} />
        </details>
      ))}
      {blocks.length ? null : <p className={styles.emailBlockHint}>Add a block above, or drag one here.</p>}
    </div>
  );
}

function EmailBlockFields({ block, onChange }: { block: ApiEmailLayoutBlock; onChange: (patch: Partial<ApiEmailLayoutBlock>) => void }) {
  if (block.type === "divider") {
    return <div className={styles.lineEditor} />;
  }
  if (block.type === "button" || block.type === "link") {
    return (
      <div className={styles.lineEditor}>
        <label>{block.type === "link" ? "Link text" : "Label"}<input value={block.content ?? ""} onChange={(event) => onChange({ content: event.target.value })} /></label>
        <label>URL<input value={block.href ?? ""} onChange={(event) => onChange({ href: event.target.value })} /></label>
      </div>
    );
  }
  if (block.type === "invoiceTable") {
    return (
      <div className={styles.lineEditor}>
        <label>Title<input value={block.title ?? ""} onChange={(event) => onChange({ title: event.target.value })} /></label>
        <label>Columns<input value={(block.columns ?? []).join(", ")} onChange={(event) => onChange({ columns: splitCommaText(event.target.value) })} /></label>
        <label>Rows<textarea value={rowsToText(block.rows)} onChange={(event) => onChange({ rows: textToCellRows(event.target.value) })} rows={5} /></label>
      </div>
    );
  }
  if (block.type === "keyValueTable") {
    return (
      <div className={styles.lineEditor}>
        <label>Title<input value={block.title ?? ""} onChange={(event) => onChange({ title: event.target.value })} /></label>
        <label>Rows<textarea value={keyRowsToText(block.rows)} onChange={(event) => onChange({ rows: textToKeyRows(event.target.value) })} rows={6} /></label>
      </div>
    );
  }
  return (
    <div className={styles.lineEditor}>
      {block.type === "notice" ? <label>Tone<select value={block.tone ?? "default"} onChange={(event) => onChange({ tone: event.target.value as ApiEmailLayoutBlock["tone"] })}><option value="default">Default</option><option value="success">Success</option><option value="warning">Warning</option><option value="danger">Danger</option></select></label> : null}
      <label>Content<textarea value={block.content ?? ""} onChange={(event) => onChange({ content: event.target.value })} rows={6} /></label>
    </div>
  );
}

function PlaceholderTray({ placeholders }: { placeholders: EmailPlaceholder[] }) {
  return (
    <div className={styles.placeholderTray}>
      <span className={styles.placeholderHint}>Drag a shortcode into any text field, or click to copy.</span>
      <div className={styles.placeholderTags}>
        {placeholders.map((placeholder) => (
          <button
            className={`${styles.placeholderTag} ${PLACEHOLDER_GROUP_CLASS[placeholder.group ?? "general"] ?? ""}`}
            draggable
            key={placeholder.key}
            onClick={() => { void navigator.clipboard?.writeText(`{{${placeholder.key}}}`).catch(() => undefined); }}
            onDragStart={(event) => event.dataTransfer.setData("text/plain", `{{${placeholder.key}}}`)}
            title={placeholder.description}
            type="button"
          >
            {`{{${placeholder.key}}}`}
          </button>
        ))}
      </div>
    </div>
  );
}

function EmailPreviewFrames({ html }: { html: string }) {
  return (
    <div className={styles.templatePreview}>
      <div>
        <strong>Desktop</strong>
        <iframe className={styles.frameDesktop} srcDoc={html} title="Desktop email preview" />
      </div>
      <div>
        <strong>Mobile</strong>
        <iframe className={styles.frameMobile} srcDoc={html} title="Mobile email preview" />
      </div>
    </div>
  );
}

function EmailLogsTable({ logs, timezone = "UTC" }: { logs: ApiEmailLog[]; timezone?: string }) {
  return (
    <div className={styles.form}>
      <table className="table">
        <thead><tr><th>Time ({timezone})</th><th>Event</th><th>From</th><th>To</th><th>Recipient</th><th>Subject</th><th>Status</th><th>SMTP</th></tr></thead>
        <tbody>
          {logs.length ? logs.map((log) => (
            <tr key={log.id}>
              <td>{dateTimeLabel(log.createdAt, timezone)}</td>
              <td>{log.template ?? "-"}</td>
              <td>{log.payload?.from ?? "-"}</td>
              <td>{log.to}</td>
              <td>{log.payload?.recipientType ?? "-"}</td>
              <td>{log.subject}</td>
              <td>{log.status}</td>
              <td>{log.payload?.smtpDelivery?.error ?? log.payload?.smtpDelivery?.response ?? log.payload?.smtpDelivery?.mode ?? "-"}</td>
            </tr>
          )) : <tr><td colSpan={8}>No email logs yet.</td></tr>}
        </tbody>
      </table>
    </div>
  );
}

const DEFAULT_BLOCK_LIBRARY: NonNullable<ApiEmailAdminSettings["blockLibrary"]> = [
  { description: "", label: "Text", type: "text" },
  { description: "", label: "Key/value table", type: "keyValueTable" },
  { description: "", label: "Invoice table", type: "invoiceTable" },
  { description: "", label: "Button", type: "button" },
  { description: "", label: "Link", type: "link" },
  { description: "", label: "Notice", type: "notice" },
  { description: "", label: "Divider", type: "divider" }
];

function createBlock(type: ApiEmailLayoutBlock["type"]): ApiEmailLayoutBlock {
  const id = `${type}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  if (type === "keyValueTable") {
    return { id, rows: [{ label: "Label", value: "{{customer_name}}" }], title: "Details", type };
  }
  if (type === "invoiceTable") {
    return { columns: ["Description", "Amount"], id, rows: [{ cells: ["{{service}}", "{{invoice_total_amount}}"] }], title: "Items", type };
  }
  if (type === "button") {
    return { content: "Open", href: "{{invoice_link}}", id, type };
  }
  if (type === "link") {
    return { content: "Open link", href: "{{invoice_link}}", id, type };
  }
  if (type === "notice") {
    return { content: "Important account information.", id, tone: "default", type };
  }
  if (type === "divider") {
    return { id, type };
  }
  return { content: "Hello {{customer_name}},", id, type };
}

function renderEmailPreview(template: string, blocks: ApiEmailLayoutBlock[], subject: string, variables: Record<string, unknown>) {
  const context = Object.fromEntries(Object.entries({
    brand_name: "Dezhost",
    current_date: new Intl.DateTimeFormat("de-DE", { dateStyle: "medium" }).format(new Date()),
    subject,
    ...variables
  }).map(([key, value]) => [key, value === undefined || value === null ? "" : String(value)]));
  const content = renderBlocks(blocks, context);
  return template
    .replace(/\{\{\s*content\s*\}\}/g, content)
    .replace(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g, (_, key: string) => escapeHtml(String(context[key] ?? "")));
}

function renderBlocks(blocks: ApiEmailLayoutBlock[], context: Record<string, string>) {
  return blocks.map((block) => {
    if (block.type === "divider") {
      return `<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin:24px 0;"><tr><td style="border-top:1px solid #dde5ef;font-size:0;line-height:0;">&nbsp;</td></tr></table>`;
    }
    if (block.type === "button") {
      return `<table role="presentation" cellspacing="0" cellpadding="0" style="margin:24px 0;"><tr><td style="border-radius:6px;background:#b11226;"><a href="${renderInline(block.href || "#", context)}" style="display:inline-block;padding:13px 18px;color:#ffffff;font-size:15px;font-weight:700;text-decoration:none;">${renderInline(block.content || "Open", context)}</a></td></tr></table>`;
    }
    if (block.type === "link") {
      return `<div style="margin:0 0 18px;color:#172033;font-size:16px;line-height:1.65;"><a href="${renderInline(block.href || "#", context)}" style="color:#0b3d91;font-weight:600;text-decoration:underline;">${renderInline(block.content || block.href || "Link", context)}</a></div>`;
    }
    if (block.type === "invoiceTable") {
      return renderDataTable(block, context);
    }
    if (block.type === "keyValueTable") {
      return renderKeyValueTable(block, context);
    }
    if (block.type === "notice") {
      const colors = block.tone === "danger" ? ["#fff5f5", "#fecaca", "#7f1d1d"] : block.tone === "success" ? ["#f0fdf4", "#bbf7d0", "#14532d"] : block.tone === "warning" ? ["#fffbeb", "#fde68a", "#713f12"] : ["#f8fafc", "#dde5ef", "#334155"];
      return `<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin:20px 0;border:1px solid ${colors[1]};border-radius:8px;background:${colors[0]};"><tr><td style="padding:14px 16px;color:${colors[2]};font-size:14px;line-height:1.6;">${renderInline(block.content || "", context)}</td></tr></table>`;
    }
    return `<div style="margin:0 0 18px;color:#172033;font-size:16px;line-height:1.65;">${renderInline(block.content || "", context)}</div>`;
  }).join("");
}

function renderKeyValueTable(block: ApiEmailLayoutBlock, context: Record<string, string>) {
  const rows = (block.rows ?? []).map((row) => `<tr><td style="padding:12px 14px;color:#5b6575;font-size:13px;border-top:1px solid #e6edf5;">${renderInline(row.label || "", context)}</td><td align="right" style="padding:12px 14px;color:#172033;font-size:14px;font-weight:700;border-top:1px solid #e6edf5;">${renderInline(row.value || "", context)}</td></tr>`).join("");
  return `<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin:22px 0;border:1px solid #dde5ef;border-radius:8px;border-collapse:separate;border-spacing:0;overflow:hidden;"><tr><td colspan="2" style="padding:14px;background:#f8fafc;color:#172033;font-size:15px;font-weight:700;">${renderInline(block.title || "Details", context)}</td></tr>${rows}</table>`;
}

function renderDataTable(block: ApiEmailLayoutBlock, context: Record<string, string>) {
  const columns = block.columns?.length ? block.columns : ["Description", "Amount"];
  const heading = `<tr>${columns.map((column) => `<th align="left" style="padding:12px 14px;background:#f8fafc;color:#5b6575;font-size:12px;text-transform:uppercase;">${renderInline(column, context)}</th>`).join("")}</tr>`;
  const rows = (block.rows ?? []).map((row) => `<tr>${(row.cells ?? []).map((cell) => `<td style="padding:13px 14px;color:#172033;font-size:14px;border-top:1px solid #e6edf5;">${renderInline(cell, context)}</td>`).join("")}</tr>`).join("");
  return `<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin:22px 0;border:1px solid #dde5ef;border-radius:8px;border-collapse:separate;border-spacing:0;overflow:hidden;"><caption style="padding:0 0 8px;text-align:left;color:#172033;font-size:15px;font-weight:700;">${renderInline(block.title || "Items", context)}</caption>${heading}${rows}</table>`;
}

function renderInline(value: string, context: Record<string, string>) {
  return value.replace(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g, (_, key: string) => escapeHtml(context[key] ?? "").replace(/\n/g, "<br />"));
}

function blockLabel(type: ApiEmailLayoutBlock["type"]) {
  return DEFAULT_BLOCK_LIBRARY.find((item) => item.type === type)?.label ?? type;
}

function toggleRecipient(recipients: Array<"admin" | "client">, type: "admin" | "client", checked: boolean) {
  const next = new Set(recipients);
  if (checked) {
    next.add(type);
  } else {
    next.delete(type);
  }
  return [...next];
}

function rowsToText(rows: ApiEmailLayoutBlock["rows"] = []) {
  return rows.map((row) => (row.cells ?? []).join(" | ")).join("\n");
}

function textToCellRows(value: string) {
  return value.split(/\r?\n/).filter(Boolean).map((line) => ({ cells: line.split("|").map((cell) => cell.trim()) }));
}

function keyRowsToText(rows: ApiEmailLayoutBlock["rows"] = []) {
  return rows.map((row) => `${row.label ?? ""} | ${row.value ?? ""}`).join("\n");
}

function textToKeyRows(value: string) {
  return value.split(/\r?\n/).filter(Boolean).map((line) => {
    const [label, ...valueParts] = line.split("|");
    return { label: label?.trim() ?? "", value: valueParts.join("|").trim() };
  });
}

function splitComma(value: FormDataEntryValue | null) {
  return String(value ?? "").split(",").map((item) => item.trim()).filter(Boolean);
}

function splitCommaText(value: string) {
  return value.split(",").map((item) => item.trim()).filter(Boolean);
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function dateTimeLabel(value?: string | null, timezone = "UTC") {
  return value ? new Intl.DateTimeFormat("de-DE", { dateStyle: "medium", timeStyle: "short", timeZone: timezone }).format(new Date(value)) : "-";
}
