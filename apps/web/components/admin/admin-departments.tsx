"use client";

import { useEffect, useRef, useState } from "react";
import { Plus, Send, Trash2, UploadCloud } from "lucide-react";
import { API_BASE_URL, authHeaders, type ApiAdminUser, type ApiDepartment } from "../../lib/api";
import { Button } from "../ui/button";
import { notifyResponse } from "../ui/toast-provider";
import styles from "./admin-dashboard.module.css";

// ── Departments management ─────────────────────────────────────────────────────

export function AdminDepartmentsPanel() {
  const [departments, setDepartments] = useState<ApiDepartment[]>([]);
  const [admins, setAdmins] = useState<ApiAdminUser[]>([]);
  const [routing, setRouting] = useState<{ contactFormDepartmentId: string | null; inquiryFormDepartmentId: string | null }>({ contactFormDepartmentId: null, inquiryFormDepartmentId: null });
  const [message, setMessage] = useState("");

  async function load() {
    const [deps, adminList, route] = await Promise.all([
      fetch(`${API_BASE_URL}/admin/dev/departments`, { headers: authHeaders("admin") }).then((r) => (r.ok ? r.json() : [])).catch(() => []),
      fetch(`${API_BASE_URL}/admin/dev/admins`, { headers: authHeaders("admin") }).then((r) => (r.ok ? r.json() : [])).catch(() => []),
      fetch(`${API_BASE_URL}/admin/dev/departments/routing`, { headers: authHeaders("admin") }).then((r) => (r.ok ? r.json() : {})).catch(() => ({}))
    ]);
    const routeConfig = (route ?? {}) as { contactFormDepartmentId?: string | null; inquiryFormDepartmentId?: string | null };
    setDepartments(Array.isArray(deps) ? deps : []);
    setAdmins(Array.isArray(adminList) ? adminList : []);
    setRouting({ contactFormDepartmentId: routeConfig.contactFormDepartmentId ?? null, inquiryFormDepartmentId: routeConfig.inquiryFormDepartmentId ?? null });
  }

  useEffect(() => { void load(); }, []);

  async function createDepartment(formData: FormData) {
    const response = await fetch(`${API_BASE_URL}/admin/dev/departments`, {
      body: JSON.stringify({
        name: String(formData.get("name") ?? ""),
        email: String(formData.get("email") ?? "") || undefined,
        color: String(formData.get("color") ?? "") || undefined,
        isDefault: formData.get("isDefault") === "on"
      }),
      headers: { "Content-Type": "application/json", ...authHeaders("admin") },
      method: "POST"
    });
    setMessage(await notifyResponse(response, "Department created.", "Could not create department."));
    if (response.ok) await load();
  }

  async function updateDepartment(id: string, patch: Record<string, unknown>) {
    const response = await fetch(`${API_BASE_URL}/admin/dev/departments/${id}`, {
      body: JSON.stringify(patch),
      headers: { "Content-Type": "application/json", ...authHeaders("admin") },
      method: "PATCH"
    });
    if (response.ok) await load();
    else setMessage(await notifyResponse(response, "", "Update failed."));
  }

  async function removeDepartment(id: string) {
    const response = await fetch(`${API_BASE_URL}/admin/dev/departments/${id}`, { headers: authHeaders("admin"), method: "DELETE" });
    setMessage(await notifyResponse(response, "Department deleted.", "Could not delete department."));
    if (response.ok) await load();
  }

  async function addMember(departmentId: string, userId: string) {
    if (!userId) return;
    const response = await fetch(`${API_BASE_URL}/admin/dev/departments/${departmentId}/members`, {
      body: JSON.stringify({ userId }),
      headers: { "Content-Type": "application/json", ...authHeaders("admin") },
      method: "POST"
    });
    if (response.ok) await load();
  }

  async function removeMember(departmentId: string, userId: string) {
    const response = await fetch(`${API_BASE_URL}/admin/dev/departments/${departmentId}/members/${userId}`, { headers: authHeaders("admin"), method: "DELETE" });
    if (response.ok) await load();
  }

  async function saveRouting() {
    const response = await fetch(`${API_BASE_URL}/admin/dev/departments/routing`, {
      body: JSON.stringify(routing),
      headers: { "Content-Type": "application/json", ...authHeaders("admin") },
      method: "PUT"
    });
    setMessage(await notifyResponse(response, "Form routing saved.", "Could not save routing."));
  }

  return (
    <>
      <section className={styles.panel}>
        <div className={styles.panelHeader}>
          <div><span className="eyebrow">Support</span><h2>Departments</h2></div>
        </div>

        <form action={createDepartment} className={styles.form}>
          <div className={styles.inlineForm}>
            <label>Name<input name="name" placeholder="e.g. Billing" required /></label>
            <label>Inbox email<input name="email" placeholder="billing@dezhost.com" type="email" /></label>
            <label>Colour<input defaultValue="#0077b6" name="color" type="color" /></label>
            <label className={styles.inlineForm}><input name="isDefault" type="checkbox" /> Default</label>
          </div>
          <Button icon={Plus} type="submit">Add Department</Button>
        </form>

        <div className={styles.departmentList}>
          {departments.map((department) => (
            <div className={styles.departmentCard} key={department.id}>
              <div className={styles.departmentHead}>
                <span className={styles.departmentDot} style={{ background: department.color ?? "var(--accent)" }} />
                <strong>{department.name}</strong>
                {department.isDefault ? <span className={styles.departmentTag}>Default</span> : null}
                {!department.active ? <span className={styles.departmentTag}>Inactive</span> : null}
                <span className={styles.departmentEmail}>{department.email ?? "—"}</span>
                <div className={styles.departmentActions}>
                  {!department.isDefault ? <button className={styles.linkBtn} onClick={() => void updateDepartment(department.id, { isDefault: true })} type="button">Make default</button> : null}
                  <button className={styles.linkBtn} onClick={() => void updateDepartment(department.id, { active: !department.active })} type="button">{department.active ? "Deactivate" : "Activate"}</button>
                  <button className={styles.dangerLinkBtn} onClick={() => void removeDepartment(department.id)} type="button"><Trash2 size={14} /></button>
                </div>
              </div>

              <div className={styles.memberRow}>
                {(department.members ?? []).map((member) => (
                  <span className={styles.memberChip} key={member.id}>
                    <MemberAvatar name={member.user.name} url={member.user.avatarUrl} />
                    {member.user.name}
                    <button aria-label="Remove" className={styles.chipRemove} onClick={() => void removeMember(department.id, member.user.id)} type="button">×</button>
                  </span>
                ))}
                <select defaultValue="" onChange={(event) => { void addMember(department.id, event.target.value); event.target.value = ""; }}>
                  <option value="">+ Add staff…</option>
                  {admins.filter((admin) => !(department.members ?? []).some((member) => member.user.id === admin.id)).map((admin) => (
                    <option key={admin.id} value={admin.id}>{admin.name}</option>
                  ))}
                </select>
              </div>
            </div>
          ))}
        </div>
        {message ? <p>{message}</p> : null}
      </section>

      <section className={styles.panel}>
        <div className={styles.panelHeader}><div><span className="eyebrow">Website</span><h2>Form routing</h2></div></div>
        <p className={styles.ticketFileHint}>Choose which department receives messages from the public contact and enquiry forms.</p>
        <div className={styles.inlineForm}>
          <label>Contact form →
            <select value={routing.contactFormDepartmentId ?? ""} onChange={(event) => setRouting((current) => ({ ...current, contactFormDepartmentId: event.target.value }))}>
              <option value="">Default department</option>
              {departments.map((department) => <option key={department.id} value={department.id}>{department.name}</option>)}
            </select>
          </label>
          <label>Enquiry form →
            <select value={routing.inquiryFormDepartmentId ?? ""} onChange={(event) => setRouting((current) => ({ ...current, inquiryFormDepartmentId: event.target.value }))}>
              <option value="">Default department</option>
              {departments.map((department) => <option key={department.id} value={department.id}>{department.name}</option>)}
            </select>
          </label>
          <Button type="button" onClick={() => void saveRouting()}>Save routing</Button>
        </div>
      </section>

      <StaffAvatarsPanel admins={admins} onChange={load} />
    </>
  );
}

function StaffAvatarsPanel({ admins, onChange }: { admins: ApiAdminUser[]; onChange: () => void }) {
  return (
    <section className={styles.panel}>
      <div className={styles.panelHeader}><div><span className="eyebrow">Support</span><h2>Staff avatars</h2></div></div>
      <p className={styles.ticketFileHint}>Upload a profile image for each staff member — shown on their ticket replies (PNG, JPG, WebP · max 4 MB).</p>
      <div className={styles.memberRow}>
        {admins.map((admin) => <StaffAvatarRow admin={admin} key={admin.id} onChange={onChange} />)}
      </div>
    </section>
  );
}

function StaffAvatarRow({ admin, onChange }: { admin: ApiAdminUser; onChange: () => void }) {
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);

  async function upload(file: File) {
    setBusy(true);
    const form = new FormData();
    form.append("files", file);
    await fetch(`${API_BASE_URL}/admin/dev/admins/${admin.id}/avatar`, { body: form, headers: authHeaders("admin"), method: "POST" }).catch(() => undefined);
    setBusy(false);
    onChange();
  }

  return (
    <span className={styles.memberChip}>
      <MemberAvatar name={admin.name} url={admin.avatarUrl} />
      {admin.name}
      <button className={styles.linkBtn} disabled={busy} onClick={() => input.current?.click()} type="button"><UploadCloud size={13} /> {busy ? "…" : "Upload"}</button>
      <input accept="image/png,image/jpeg,image/webp" hidden ref={input} type="file" onChange={(event) => { const file = event.target.files?.[0]; if (file) void upload(file); }} />
    </span>
  );
}

function MemberAvatar({ name, url }: { name: string; url?: string | null }) {
  if (url) {
    return <span className={styles.avatarSmall}><img alt={name} src={url} /></span>;
  }
  return <span className={styles.avatarSmall} style={{ background: "var(--accent)" }}>{(name.trim()[0] ?? "?").toUpperCase()}</span>;
}

// ── Admin new ticket ───────────────────────────────────────────────────────────

export function AdminNewTicketPanel() {
  const [clients, setClients] = useState<Array<{ id: string; name: string; email: string }>>([]);
  const [departments, setDepartments] = useState<Array<{ id: string; name: string }>>([]);
  const [mode, setMode] = useState<"client" | "guest">("client");
  const [message, setMessage] = useState("");

  useEffect(() => {
    void Promise.all([
      fetch(`${API_BASE_URL}/users`, { headers: authHeaders("admin") }).then((r) => (r.ok ? r.json() : [])).catch(() => []),
      fetch(`${API_BASE_URL}/admin/dev/departments`, { headers: authHeaders("admin") }).then((r) => (r.ok ? r.json() : [])).catch(() => [])
    ]).then(([clientList, deps]) => {
      setClients(Array.isArray(clientList) ? clientList : []);
      setDepartments((Array.isArray(deps) ? deps : []).filter((d: ApiDepartment) => d.active));
    });
  }, []);

  async function submit(formData: FormData) {
    const payload: Record<string, unknown> = {
      subject: String(formData.get("subject") ?? ""),
      body: String(formData.get("body") ?? ""),
      departmentId: String(formData.get("departmentId") ?? ""),
      priority: String(formData.get("priority") ?? "NORMAL")
    };
    if (mode === "client") {
      payload.userId = String(formData.get("userId") ?? "");
    } else {
      payload.name = String(formData.get("name") ?? "");
      payload.email = String(formData.get("email") ?? "");
    }
    const response = await fetch(`${API_BASE_URL}/admin/dev/tickets`, {
      body: JSON.stringify(payload),
      headers: { "Content-Type": "application/json", ...authHeaders("admin") },
      method: "POST"
    });
    const ticket = await response.clone().json().catch(() => undefined) as { id?: string } | undefined;
    if (response.ok && ticket?.id) {
      window.location.assign(`/admin/tickets/${ticket.id}`);
      return;
    }
    setMessage(await notifyResponse(response, "Ticket created.", "Could not create ticket."));
  }

  return (
    <section className={styles.panel}>
      <div className={styles.panelHeader}><div><span className="eyebrow">Support</span><h2>New ticket</h2></div></div>
      <form action={submit} className={styles.form}>
        <div className={styles.inlineForm}>
          <label className={styles.inlineForm}><input checked={mode === "client"} onChange={() => setMode("client")} type="radio" /> Existing client</label>
          <label className={styles.inlineForm}><input checked={mode === "guest"} onChange={() => setMode("guest")} type="radio" /> New recipient (email)</label>
        </div>

        {mode === "client" ? (
          <label>Client<select name="userId" required>{clients.map((client) => <option key={client.id} value={client.id}>{client.name} — {client.email}</option>)}</select></label>
        ) : (
          <div className={styles.inlineForm}>
            <label>Name<input name="name" placeholder="Recipient name" required /></label>
            <label>Email<input name="email" placeholder="person@example.com" required type="email" /></label>
          </div>
        )}

        <div className={styles.inlineForm}>
          <label>Department<select name="departmentId" required>{departments.map((department) => <option key={department.id} value={department.id}>{department.name}</option>)}</select></label>
          <label>Priority<select name="priority"><option value="NORMAL">Normal</option><option value="LOW">Low</option><option value="HIGH">High</option></select></label>
        </div>
        <label>Subject<input name="subject" placeholder="Short subject" required /></label>
        <label>Message<textarea name="body" required rows={6} /></label>
        <Button icon={Send} type="submit">Start conversation</Button>
        {message ? <p>{message}</p> : null}
      </form>
    </section>
  );
}
