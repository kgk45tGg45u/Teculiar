import { pickField } from "./virtualmin-normalize";
import type { VirtualminEntry, VirtualminFields, VirtualminFormState, VirtualminReport } from "./virtualmin-types";

interface PageState {
  form: VirtualminFormState;
  notice?: string;
  report?: VirtualminReport;
}

export function renderVirtualminPage(state: PageState): string {
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Virtualmin Client</title>
  <style>${styles()}</style>
</head>
<body>
  <main>
    <h1>Virtualmin Client</h1>
    ${state.notice ? `<p class="notice">${escapeHtml(state.notice)}</p>` : ""}
    ${connectionForm(state.form)}
    ${state.report ? reportHtml(state.report, state.form) : ""}
  </main>
</body>
</html>`;
}

function connectionForm(form: VirtualminFormState): string {
  return `<section>
    <h2>Connect</h2>
    <form method="post">
      <input type="hidden" name="intent" value="view" />
      <label>Virtualmin API URL <input name="endpoint" value="${attr(form.endpoint)}" placeholder="https://panel.example.com:10000" /></label>
      <label>Domain <input name="domain" value="${attr(form.domain)}" placeholder="example.com" /></label>
      <label>Username <input name="username" value="${attr(form.username)}" autocomplete="username" /></label>
      <label>Password <input name="password" type="password" value="${attr(form.password)}" autocomplete="current-password" /></label>
      <label class="check"><input name="allowSelfSigned" type="checkbox" value="1" ${form.allowSelfSigned ? "checked" : ""} /> Allow self-signed TLS</label>
      <button type="submit">Load account</button>
    </form>
  </section>`;
}

function reportHtml(report: VirtualminReport, form: VirtualminFormState): string {
  return `<section>
    <h2>${escapeHtml(report.domain)}</h2>
    <p><a href="${attr(report.webmailUrl)}" target="_blank" rel="noreferrer">Open webmail</a></p>
    ${report.errors.map((error) => `<p class="error">${escapeHtml(error)}</p>`).join("")}
    ${quickFacts(report)}
    ${fieldTable("Virtual server information", report.domainFields)}
    ${entryTable("Mailboxes", report.mailboxes)}
    ${entryTable("Databases", report.databases)}
    ${entryTable("Bandwidth", report.bandwidth)}
    ${actionForms(form)}
  </section>`;
}

function quickFacts(report: VirtualminReport): string {
  const fields = report.domainFields;
  const rows: Array<[string, string | undefined]> = [
    ["IP address", pickField(fields, ["IP address", "IPv4 address", "Address", "IP"])],
    ["Disk usage", pickField(fields, ["Disk usage", "Server disk usage", "Used disk space"])],
    ["Disk limit", pickField(fields, ["Disk quota", "Disk limit", "Quota"])],
    ["Bandwidth limit", pickField(fields, ["Bandwidth limit", "Transfer limit"])],
    ["Database username", pickField(fields, ["User", "Username", "Owner"])],
    ["Database password", "Not returned by Virtualmin API"]
  ];

  return `<section class="panel"><h3>Quick facts</h3><table><tbody>${rows
    .map(([key, value]) => `<tr><th>${escapeHtml(key)}</th><td>${escapeHtml(value ?? "Unknown")}</td></tr>`)
    .join("")}</tbody></table></section>`;
}

function fieldTable(title: string, fields: VirtualminFields): string {
  const rows = Object.entries(fields);

  if (rows.length === 0) {
    return `<section class="panel"><h3>${escapeHtml(title)}</h3><p>No data returned.</p></section>`;
  }

  return `<section class="panel"><h3>${escapeHtml(title)}</h3><table><tbody>${rows
    .map(([key, value]) => `<tr><th>${escapeHtml(key)}</th><td>${escapeHtml(value)}</td></tr>`)
    .join("")}</tbody></table></section>`;
}

function entryTable(title: string, entries: VirtualminEntry[]): string {
  const columns = Array.from(new Set(entries.flatMap((entry) => Object.keys(entry.fields))));

  if (entries.length === 0) {
    return `<section class="panel"><h3>${escapeHtml(title)}</h3><p>No data returned.</p></section>`;
  }

  return `<section class="panel"><h3>${escapeHtml(title)}</h3><table><thead><tr><th>Name</th>${columns
    .map((column) => `<th>${escapeHtml(column)}</th>`)
    .join("")}</tr></thead><tbody>${entries
    .map((entry) => `<tr><td>${escapeHtml(entry.name)}</td>${columns
      .map((column) => `<td>${escapeHtml(entry.fields[column] ?? "")}</td>`)
      .join("")}</tr>`)
    .join("")}</tbody></table></section>`;
}

function actionForms(form: VirtualminFormState): string {
  return `<section class="panel actions"><h3>Actions</h3>
    ${emailForm("add-email", "Add email", form)}
    ${emailForm("remove-email", "Remove email", form)}
    ${emailForm("change-email-password", "Change email password", form)}
    ${databaseForm("add-database", "Add database", form)}
    ${databaseForm("remove-database", "Remove database", form)}
    ${databasePasswordForm(form)}
  </section>`;
}

function emailForm(intent: string, label: string, form: VirtualminFormState): string {
  const password =
    intent === "add-email" || intent === "change-email-password"
      ? '<input name="mailPassword" type="password" placeholder="new mailbox password" />'
      : "";
  const quota = intent === "add-email" ? '<input name="mailQuotaMb" placeholder="quota MB" />' : "";
  return `<form method="post">${hiddenSession(form)}${actionPassword()}<input type="hidden" name="intent" value="${attr(intent)}" />
    <input name="mailUser" placeholder="mailbox user" />${password}${quota}<button type="submit">${escapeHtml(label)}</button></form>`;
}

function databaseForm(intent: string, label: string, form: VirtualminFormState): string {
  return `<form method="post">${hiddenSession(form)}${actionPassword()}<input type="hidden" name="intent" value="${attr(intent)}" />
    <input name="databaseName" placeholder="database name" /><select name="databaseType"><option value="mysql">MySQL</option><option value="postgres">PostgreSQL</option></select>
    <button type="submit">${escapeHtml(label)}</button></form>`;
}

function databasePasswordForm(form: VirtualminFormState): string {
  return `<form method="post">${hiddenSession(form)}${actionPassword()}<input type="hidden" name="intent" value="change-database-password" />
    <select name="databaseType"><option value="mysql">MySQL</option><option value="postgres">PostgreSQL</option></select>
    <input name="databasePassword" type="password" placeholder="new database password" />
    <button type="submit">Change database password</button></form>`;
}

function hiddenSession(form: VirtualminFormState): string {
  return `<input type="hidden" name="endpoint" value="${attr(form.endpoint)}" />
    <input type="hidden" name="domain" value="${attr(form.domain)}" />
    <input type="hidden" name="username" value="${attr(form.username)}" />
    ${form.allowSelfSigned ? '<input type="hidden" name="allowSelfSigned" value="1" />' : ""}`;
}

function actionPassword(): string {
  return '<input name="password" type="password" placeholder="account password" autocomplete="current-password" />';
}

function styles(): string {
  return `body{font-family:Arial,sans-serif;margin:0;background:#f6f8fa;color:#18202a}main{max-width:1180px;margin:auto;padding:32px}section{margin:0 0 24px}h1,h2,h3{margin:0 0 12px}form{display:grid;gap:10px;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));align-items:end;margin:12px 0}label{display:grid;gap:6px;font-weight:700}.check{display:flex;gap:8px;align-items:center}input,select,button{font:inherit;padding:10px;border:1px solid #c9d2dc;border-radius:6px}button{background:#17324d;color:white;border-color:#17324d;cursor:pointer}.panel{background:white;border:1px solid #d8e0e8;border-radius:8px;padding:16px;overflow:auto}table{width:100%;border-collapse:collapse;font-size:14px}th,td{text-align:left;border-bottom:1px solid #e6ebf0;padding:8px;vertical-align:top}th{color:#44546a;width:220px}.notice{background:#e9f5ff;border:1px solid #afd7ff;padding:12px;border-radius:6px}.error{background:#fff0f0;border:1px solid #ffc7c7;padding:12px;border-radius:6px}.actions form{grid-template-columns:repeat(auto-fit,minmax(150px,1fr))}@media(max-width:680px){main{padding:18px}th{width:auto}}`;
}

function attr(value: string | undefined): string {
  return escapeHtml(value ?? "").replace(/"/g, "&quot;");
}

function escapeHtml(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
