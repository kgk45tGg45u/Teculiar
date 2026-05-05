"use client";

import { Bell, CreditCard } from "lucide-react";
import { useState } from "react";
import { API_BASE_URL } from "../../lib/api";
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
      headers: { "Content-Type": "application/json" },
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

  async function submit(formData: FormData) {
    const response = await fetch(`${API_BASE_URL}/admin/dev/billing/settings`, {
      body: JSON.stringify({
        invoiceDaysAhead: Number(formData.get("invoiceDaysAhead") ?? 7),
        ticketAutoCloseHours: Number(formData.get("ticketAutoCloseHours") ?? 24)
      }),
      headers: { "Content-Type": "application/json" },
      method: "PATCH"
    });

    setMessage(response.ok ? "Settings saved." : "Settings failed.");
  }

  return (
    <form action={submit} className={styles.form}>
      <label>Generate invoices days before due date<input defaultValue="7" name="invoiceDaysAhead" type="number" /></label>
      <label>Close answered tickets after hours<input defaultValue="24" name="ticketAutoCloseHours" type="number" /></label>
      <p>Admin dashboard runs maintenance on open: close answered tickets, create upcoming invoices, mark overdue invoices, suspend services with overdue unpaid invoices.</p>
      <Button icon={CreditCard} type="submit">Save Settings</Button>
      {message ? <p>{message}</p> : null}
    </form>
  );
}
