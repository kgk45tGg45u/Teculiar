"use client";

import { Bell, CreditCard, Save } from "lucide-react";
import { useEffect, useState } from "react";
import { API_BASE_URL, authHeaders } from "../../lib/api";
import { Button } from "../ui/button";
import styles from "./admin-dashboard.module.css";

export function AnnouncementForm() {
  const [message, setMessage] = useState("");

  async function submit(formData: FormData) {
    const title = String(formData.get("title") ?? "");
    const body = String(formData.get("content") ?? "");
    const response = await fetch(`${API_BASE_URL}/cms/admin/dev/announcements`, {
      body: JSON.stringify({
        content: { body },
        excerpt: String(formData.get("excerpt") ?? ""),
        locale: "de",
        slug: String(formData.get("slug") ?? title.toLowerCase().replace(/[^a-z0-9]+/g, "-")),
        title,
        type: "POST"
      }),
      headers: { "Content-Type": "application/json", ...authHeaders() },
      method: "POST"
    });

    setMessage(response.ok ? "Announcement published." : "Announcement failed.");
  }

  return (
    <form action={submit} className={styles.form}>
      <label>Title<input name="title" placeholder="Maintenance window" required /></label>
      <label>Slug<input name="slug" placeholder="maintenance-window" required /></label>
      <label>Excerpt<input name="excerpt" placeholder="Short portal message" /></label>
      <label>Content<textarea name="content" rows={5} placeholder="Full announcement" required /></label>
      <Button icon={Bell} type="submit">Publish</Button>
      {message ? <p>{message}</p> : null}
    </form>
  );
}

export function SettingsForm() {
  const [message, setMessage] = useState("");
  const [settings, setSettings] = useState({
    invoiceDaysAhead: 7,
    invoiceFooterLine1: "",
    invoiceFooterLine2: "",
    invoiceFooterLine3: "",
    ticketAutoCloseHours: 24,
    vatPercent: 19
  });

  useEffect(() => {
    void fetch(`${API_BASE_URL}/admin/dev/billing/settings`, { headers: authHeaders() })
      .then((response) => response.json())
      .then((payload) => setSettings({
        invoiceDaysAhead: payload.invoiceDaysAhead ?? 7,
        invoiceFooterLine1: payload.invoiceFooterLine1 ?? "",
        invoiceFooterLine2: payload.invoiceFooterLine2 ?? "",
        invoiceFooterLine3: payload.invoiceFooterLine3 ?? "",
        ticketAutoCloseHours: payload.ticketAutoCloseHours ?? 24,
        vatPercent: payload.vatPercent ?? 19
      }))
      .catch(() => undefined);
  }, []);

  async function submit(formData: FormData) {
    const response = await fetch(`${API_BASE_URL}/admin/dev/billing/settings`, {
      body: JSON.stringify({
        invoiceDaysAhead: Number(formData.get("invoiceDaysAhead") ?? 7),
        invoiceFooterLine1: String(formData.get("invoiceFooterLine1") ?? ""),
        invoiceFooterLine2: String(formData.get("invoiceFooterLine2") ?? ""),
        invoiceFooterLine3: String(formData.get("invoiceFooterLine3") ?? ""),
        ticketAutoCloseHours: Number(formData.get("ticketAutoCloseHours") ?? 24),
        vatPercent: Number(formData.get("vatPercent") ?? 19)
      }),
      headers: { "Content-Type": "application/json", ...authHeaders() },
      method: "PATCH"
    });

    setMessage(response.ok ? "Settings saved." : "Settings failed.");
  }

  return (
    <form action={submit} className={styles.form}>
      <label>Generate invoices days before due date<input value={settings.invoiceDaysAhead} onChange={(event) => setSettings({ ...settings, invoiceDaysAhead: Number(event.target.value) })} name="invoiceDaysAhead" type="number" /></label>
      <label>Close answered tickets after hours<input value={settings.ticketAutoCloseHours} onChange={(event) => setSettings({ ...settings, ticketAutoCloseHours: Number(event.target.value) })} name="ticketAutoCloseHours" type="number" /></label>
      <label>VAT percent<input min="0" step="0.01" value={settings.vatPercent} onChange={(event) => setSettings({ ...settings, vatPercent: Number(event.target.value) })} name="vatPercent" type="number" /></label>
      <label>Invoice footer line 1<input value={settings.invoiceFooterLine1} onChange={(event) => setSettings({ ...settings, invoiceFooterLine1: event.target.value })} name="invoiceFooterLine1" /></label>
      <label>Invoice footer line 2<input value={settings.invoiceFooterLine2} onChange={(event) => setSettings({ ...settings, invoiceFooterLine2: event.target.value })} name="invoiceFooterLine2" /></label>
      <label>Invoice footer line 3<input value={settings.invoiceFooterLine3} onChange={(event) => setSettings({ ...settings, invoiceFooterLine3: event.target.value })} name="invoiceFooterLine3" /></label>
      <p>Admin dashboard runs maintenance on open: close answered tickets, create upcoming invoices, mark overdue invoices, suspend services with overdue unpaid invoices.</p>
      <Button icon={CreditCard} type="submit">Save Settings</Button>
      {message ? <p>{message}</p> : null}
    </form>
  );
}

export function DomainPriceForm() {
  const [message, setMessage] = useState("");

  async function submit(formData: FormData) {
    const response = await fetch(`${API_BASE_URL}/orders/admin/domain-prices`, {
      body: JSON.stringify({
        action: String(formData.get("action") ?? "register"),
        amountCents: Math.round(Number(formData.get("amount") ?? 0) * 100),
        manual: formData.get("manual") === "on",
        suggested: formData.get("suggested") === "on",
        tld: String(formData.get("tld") ?? ""),
        years: Number(formData.get("years") ?? 1)
      }),
      headers: { "Content-Type": "application/json", ...authHeaders() },
      method: "POST"
    });

    setMessage(response.ok ? "Domain price saved." : "Domain price failed.");
  }

  return (
    <form action={submit} className={styles.form}>
      <label>TLD<input name="tld" placeholder="de" required /></label>
      <label>Action
        <select name="action">
          <option value="register">Register</option>
          <option value="transfer">Transfer</option>
          <option value="renew">Renew</option>
        </select>
      </label>
      <label>Years<input defaultValue="1" min="1" name="years" type="number" /></label>
      <label>Price EUR<input name="amount" placeholder="12.90" required step="0.01" type="number" /></label>
      <label><input defaultChecked name="manual" type="checkbox" /> Manual price</label>
      <label><input name="suggested" type="checkbox" /> Suggested TLD</label>
      <Button icon={Save} type="submit">Save Price</Button>
      {message ? <p>{message}</p> : null}
    </form>
  );
}

export function OrderStatusForm({ orderId, status }: { orderId: string; status: string }) {
  const [message, setMessage] = useState("");
  const [value, setValue] = useState(statusLabelValue(status));

  async function submit(formData: FormData) {
    const response = await fetch(`${API_BASE_URL}/orders/${orderId}/status`, {
      body: JSON.stringify({ status: String(formData.get("status") ?? value) }),
      headers: { "Content-Type": "application/json", ...authHeaders() },
      method: "PATCH"
    });

    setMessage(response.ok ? "Order status saved." : "Order status failed.");
  }

  return (
    <form action={submit} className={styles.inlineForm}>
      <select name="status" value={value} onChange={(event) => setValue(event.target.value)}>
        <option value="completed">completed</option>
        <option value="in_progress">In Progress</option>
        <option value="canceled">Canceled</option>
      </select>
      <Button type="submit" variant="secondary">Save</Button>
      {message ? <span>{message}</span> : null}
    </form>
  );
}

function statusLabelValue(status: string) {
  if (status === "COMPLETE") {
    return "completed";
  }
  if (status === "CANCELLED") {
    return "canceled";
  }
  return "in_progress";
}
