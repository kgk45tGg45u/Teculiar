"use client";

import { Bell, CreditCard, Save } from "lucide-react";
import { useEffect, useState } from "react";
import { API_BASE_URL, authHeaders, type ApiBlogPost } from "../../lib/api";
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
    vatPercent: 19,
    sellerName: "",
    sellerAddressLine1: "",
    sellerPostalCode: "",
    sellerCity: "",
    sellerCountryCode: "DE",
    sellerVatId: "",
    sellerEmail: "",
    sellerPhone: ""
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
        vatPercent: payload.vatPercent ?? 19,
        sellerName: payload.sellerName ?? "",
        sellerAddressLine1: payload.sellerAddressLine1 ?? "",
        sellerPostalCode: payload.sellerPostalCode ?? "",
        sellerCity: payload.sellerCity ?? "",
        sellerCountryCode: payload.sellerCountryCode ?? "DE",
        sellerVatId: payload.sellerVatId ?? "",
        sellerEmail: payload.sellerEmail ?? "",
        sellerPhone: payload.sellerPhone ?? ""
      }))
      .catch(() => undefined);
  }, []);

  function set(key: keyof typeof settings, value: string | number) {
    setSettings((prev) => ({ ...prev, [key]: value }));
  }

  async function submit(formData: FormData) {
    const response = await fetch(`${API_BASE_URL}/admin/dev/billing/settings`, {
      body: JSON.stringify({
        invoiceDaysAhead: Number(formData.get("invoiceDaysAhead") ?? 7),
        invoiceFooterLine1: String(formData.get("invoiceFooterLine1") ?? ""),
        invoiceFooterLine2: String(formData.get("invoiceFooterLine2") ?? ""),
        invoiceFooterLine3: String(formData.get("invoiceFooterLine3") ?? ""),
        ticketAutoCloseHours: Number(formData.get("ticketAutoCloseHours") ?? 24),
        vatPercent: Number(formData.get("vatPercent") ?? 19),
        sellerName: String(formData.get("sellerName") ?? ""),
        sellerAddressLine1: String(formData.get("sellerAddressLine1") ?? ""),
        sellerPostalCode: String(formData.get("sellerPostalCode") ?? ""),
        sellerCity: String(formData.get("sellerCity") ?? ""),
        sellerCountryCode: String(formData.get("sellerCountryCode") ?? "DE"),
        sellerVatId: String(formData.get("sellerVatId") ?? ""),
        sellerEmail: String(formData.get("sellerEmail") ?? ""),
        sellerPhone: String(formData.get("sellerPhone") ?? "")
      }),
      headers: { "Content-Type": "application/json", ...authHeaders() },
      method: "PATCH"
    });

    setMessage(response.ok ? "Settings saved." : "Settings failed.");
  }

  return (
    <form action={submit} className={styles.form}>
      <h3 style={{ margin: "0 0 4px" }}>Seller / Dezhost address (shown on invoices)</h3>
      <p style={{ margin: "0 0 12px", color: "var(--muted)", fontSize: "0.9rem" }}>
        This information is frozen into each invoice at creation time (German standard: seller address top-left).
      </p>
      <label>Company name<input value={settings.sellerName} onChange={(e) => set("sellerName", e.target.value)} name="sellerName" placeholder="Dezhost GmbH" /></label>
      <label>Address line 1<input value={settings.sellerAddressLine1} onChange={(e) => set("sellerAddressLine1", e.target.value)} name="sellerAddressLine1" placeholder="Musterstraße 1" /></label>
      <label>Postal code<input value={settings.sellerPostalCode} onChange={(e) => set("sellerPostalCode", e.target.value)} name="sellerPostalCode" placeholder="10115" /></label>
      <label>City<input value={settings.sellerCity} onChange={(e) => set("sellerCity", e.target.value)} name="sellerCity" placeholder="Berlin" /></label>
      <label>Country code<input value={settings.sellerCountryCode} onChange={(e) => set("sellerCountryCode", e.target.value)} name="sellerCountryCode" placeholder="DE" /></label>
      <label>VAT ID (USt-IdNr.)<input value={settings.sellerVatId} onChange={(e) => set("sellerVatId", e.target.value)} name="sellerVatId" placeholder="DE123456789" /></label>
      <label>Contact email<input value={settings.sellerEmail} onChange={(e) => set("sellerEmail", e.target.value)} name="sellerEmail" placeholder="billing@dezhost.de" /></label>
      <label>Phone<input value={settings.sellerPhone} onChange={(e) => set("sellerPhone", e.target.value)} name="sellerPhone" placeholder="+49 30 12345678" /></label>

      <h3 style={{ margin: "16px 0 4px" }}>Billing automation</h3>
      <label>Generate invoices days before due date<input value={settings.invoiceDaysAhead} onChange={(event) => set("invoiceDaysAhead", Number(event.target.value))} name="invoiceDaysAhead" type="number" /></label>
      <label>Close answered tickets after hours<input value={settings.ticketAutoCloseHours} onChange={(event) => set("ticketAutoCloseHours", Number(event.target.value))} name="ticketAutoCloseHours" type="number" /></label>
      <label>VAT percent<input min="0" step="0.01" value={settings.vatPercent} onChange={(event) => set("vatPercent", Number(event.target.value))} name="vatPercent" type="number" /></label>

      <h3 style={{ margin: "16px 0 4px" }}>Invoice footer</h3>
      <label>Footer line 1<input value={settings.invoiceFooterLine1} onChange={(event) => set("invoiceFooterLine1", event.target.value)} name="invoiceFooterLine1" /></label>
      <label>Footer line 2<input value={settings.invoiceFooterLine2} onChange={(event) => set("invoiceFooterLine2", event.target.value)} name="invoiceFooterLine2" /></label>
      <label>Footer line 3<input value={settings.invoiceFooterLine3} onChange={(event) => set("invoiceFooterLine3", event.target.value)} name="invoiceFooterLine3" /></label>
      <p>Admin dashboard runs maintenance on open: close answered tickets, create upcoming invoices, mark overdue invoices, suspend services with overdue unpaid invoices.</p>
      <Button icon={CreditCard} type="submit">Save Settings</Button>
      {message ? <p>{message}</p> : null}
    </form>
  );
}

type Gateway = { config?: Record<string, unknown>; enabled: boolean; method: string };

export function PaymentGatewayForm() {
  const [gateways, setGateways] = useState<Gateway[]>([]);
  const [message, setMessage] = useState("");

  useEffect(() => {
    void fetch(`${API_BASE_URL}/admin/dev/billing/payment-gateways`, { headers: authHeaders() })
      .then((response) => response.json())
      .then((payload) => setGateways(Array.isArray(payload) ? payload : []))
      .catch(() => undefined);
  }, []);

  async function submit(formData: FormData) {
    const next = gateways.map((gateway) => ({
      config: {
        apiKey: String(formData.get(`${gateway.method}_apiKey`) ?? ""),
        provider: String(formData.get(`${gateway.method}_provider`) ?? "")
      },
      enabled: formData.get(`${gateway.method}_enabled`) === "on",
      method: gateway.method
    }));
    const response = await fetch(`${API_BASE_URL}/admin/dev/billing/payment-gateways`, {
      body: JSON.stringify({ gateways: next }),
      headers: { "Content-Type": "application/json", ...authHeaders() },
      method: "PATCH"
    });

    setMessage(response.ok ? "Payment gateways saved." : "Payment gateways failed.");
  }

  return (
    <form action={submit} className={styles.form}>
      {gateways.map((gateway) => (
        <fieldset className={styles.form} key={gateway.method}>
          <label><input defaultChecked={gateway.enabled} name={`${gateway.method}_enabled`} type="checkbox" /> {gatewayTitle(gateway.method)}</label>
          <label>Gateway/provider<input defaultValue={String(gateway.config?.provider ?? "")} name={`${gateway.method}_provider`} placeholder="stripe, paypal, sepa-provider" /></label>
          <label>API key / config token<input defaultValue={String(gateway.config?.apiKey ?? "")} name={`${gateway.method}_apiKey`} /></label>
        </fieldset>
      ))}
      <Button icon={CreditCard} type="submit">Save Payment Gateways</Button>
      {message ? <p>{message}</p> : null}
    </form>
  );
}

export function BlogManager() {
  const [editing, setEditing] = useState<ApiBlogPost>();
  const [message, setMessage] = useState("");
  const [posts, setPosts] = useState<ApiBlogPost[]>([]);

  useEffect(() => {
    void refresh();
  }, []);

  async function refresh() {
    const response = await fetch(`${API_BASE_URL}/cms/admin/dev/posts`, { headers: authHeaders() });
    const payload = await response.json().catch(() => []);
    setPosts(Array.isArray(payload) ? payload : []);
  }

  async function submit(formData: FormData) {
    const title = String(formData.get("title") ?? "");
    const body = String(formData.get("content") ?? "");
    const content = {
      aiBrief: {
        audience: String(formData.get("aiAudience") ?? ""),
        goal: String(formData.get("aiGoal") ?? ""),
        internalLinks: String(formData.get("aiInternalLinks") ?? ""),
        tone: String(formData.get("aiTone") ?? ""),
        topics: String(formData.get("aiTopics") ?? "")
      },
      body,
      images: splitLines(formData.get("images")),
      keywords: splitComma(formData.get("keywords")),
      published: formData.get("published") === "on"
    };
    const response = await fetch(`${API_BASE_URL}/cms/${editing ? `pages/${editing.id}` : "posts"}`, {
      body: JSON.stringify({
        content,
        excerpt: String(formData.get("excerpt") ?? ""),
        locale: String(formData.get("locale") ?? "de"),
        seoDescription: String(formData.get("seoDescription") ?? ""),
        seoTitle: String(formData.get("seoTitle") ?? title),
        slug: String(formData.get("slug") ?? slugify(title)),
        title,
        type: "POST"
      }),
      headers: { "Content-Type": "application/json", ...authHeaders() },
      method: editing ? "PATCH" : "POST"
    });

    setMessage(response.ok ? "Blog article saved." : "Blog article failed.");
    if (response.ok) {
      setEditing(undefined);
      await refresh();
    }
  }

  async function remove(post: ApiBlogPost) {
    const response = await fetch(`${API_BASE_URL}/cms/pages/${post.id}`, { headers: authHeaders(), method: "DELETE" });
    setMessage(response.ok ? "Blog article deleted." : "Delete failed.");
    if (response.ok) {
      await refresh();
    }
  }

  return (
    <div className={styles.form}>
      <div className={styles.blogList}>
        {posts.map((post) => (
          <article key={post.id}>
            <div>
              <strong>{post.title}</strong>
              <span>{post.locale} / {post.slug} / {post.publishedAt ? "published" : "draft"}</span>
            </div>
            <Button type="button" variant="secondary" onClick={() => setEditing(post)}>Edit</Button>
            <Button type="button" variant="ghost" onClick={() => remove(post)}>Delete</Button>
          </article>
        ))}
      </div>
      <form action={submit} className={styles.form} key={editing?.id ?? "new-blog"}>
        <label>Title<input defaultValue={editing?.title ?? ""} name="title" required /></label>
        <label>Slug<input defaultValue={editing?.slug ?? ""} name="slug" placeholder="managed-hosting-security" /></label>
        <label>Locale<select defaultValue={editing?.locale ?? "de"} name="locale"><option value="de">German</option><option value="en">English</option></select></label>
        <label>Keywords<input defaultValue={editing?.content?.keywords?.join(", ") ?? ""} name="keywords" placeholder="hosting, email, security" /></label>
        <label><input defaultChecked={Boolean(editing?.publishedAt ?? editing?.content?.published)} name="published" type="checkbox" /> Published</label>
        <label>Excerpt<input defaultValue={editing?.excerpt ?? ""} name="excerpt" /></label>
        <label>Images<textarea defaultValue={editing?.content?.images?.join("\n") ?? ""} name="images" placeholder="https://..." rows={3} /></label>
        <RichTextEditor initialValue={editing?.content?.body ?? ""} />
        <section className={styles.aiBox}>
          <h3>AI article brief</h3>
          <p>Planned AI fields for automatic articles: target area, audience, tone, SEO keywords, internal links, article length, publishing status, image direction, review owner, and schedule.</p>
          <label>Topics / areas<input defaultValue={String(editing?.content?.aiBrief?.topics ?? "")} name="aiTopics" placeholder="hosting security, email setup, domains" /></label>
          <label>Goal<input defaultValue={String(editing?.content?.aiBrief?.goal ?? "")} name="aiGoal" placeholder="educate, sell, compare, announce" /></label>
          <label>Audience<input defaultValue={String(editing?.content?.aiBrief?.audience ?? "")} name="aiAudience" placeholder="small business owners" /></label>
          <label>Tone<input defaultValue={String(editing?.content?.aiBrief?.tone ?? "")} name="aiTone" placeholder="clear, expert, friendly" /></label>
          <label>Internal links<input defaultValue={String(editing?.content?.aiBrief?.internalLinks ?? "")} name="aiInternalLinks" placeholder="/de/hosting, /de/domains" /></label>
        </section>
        <Button icon={Save} type="submit">{editing ? "Update Article" : "Create Article"}</Button>
        {message ? <p>{message}</p> : null}
      </form>
    </div>
  );
}

function RichTextEditor({ initialValue }: { initialValue: string }) {
  const [value, setValue] = useState(initialValue);

  useEffect(() => {
    setValue(initialValue);
  }, [initialValue]);

  function command(name: string, argument?: string) {
    document.execCommand(name, false, argument);
    const editor = document.querySelector<HTMLElement>("[data-blog-editor]");
    setValue(editor?.innerHTML ?? "");
  }

  return (
    <label>
      Content
      <input name="content" type="hidden" value={value} />
      <div className={styles.editorShell}>
        <div className={styles.editorToolbar}>
          <button type="button" onClick={() => command("formatBlock", "h2")}>H2</button>
          <button type="button" onClick={() => command("bold")}>Bold</button>
          <button type="button" onClick={() => command("italic")}>Italic</button>
          <button type="button" onClick={() => command("insertUnorderedList")}>List</button>
          <button type="button" onClick={() => {
            const url = window.prompt("Link URL");
            if (url) {
              command("createLink", url);
            }
          }}>Link</button>
        </div>
        <div
          className={styles.editor}
          contentEditable
          data-blog-editor
          dangerouslySetInnerHTML={{ __html: value }}
          onInput={(event) => setValue(event.currentTarget.innerHTML)}
          suppressContentEditableWarning
        />
      </div>
    </label>
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

function gatewayTitle(method: string) {
  return {
    CREDIT_CARD: "Credit/debit card",
    PAYPAL: "Paypal",
    SEPA: "SEPA Lastschrift"
  }[method] ?? method;
}

function splitComma(value: FormDataEntryValue | null) {
  return String(value ?? "").split(",").map((item) => item.trim()).filter(Boolean);
}

function splitLines(value: FormDataEntryValue | null) {
  return String(value ?? "").split(/\r?\n/).map((item) => item.trim()).filter(Boolean);
}

function slugify(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}
