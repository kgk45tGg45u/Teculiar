"use client";

import LinkExtension from "@tiptap/extension-link";
import Placeholder from "@tiptap/extension-placeholder";
import { EditorContent, useEditor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { Bell, Bold, CreditCard, Eye, EyeOff, FileText, Heading2, Italic, LinkIcon, List, Package, Plus, Redo2, RefreshCw, Save, Trash2, Undo2 } from "lucide-react";
import { useEffect, useState } from "react";
import { API_BASE_URL, authHeaders, cycleLabel, formatCustomerNumber, money, type ApiAnnouncement, type ApiBlogPost, type ApiClient, type ApiInvoice, type ApiProduct } from "../../lib/api";
import type { Locale } from "../../lib/i18n";
import { serviceStatusLabel } from "../../lib/status-labels";
import { Button } from "../ui/button";
import { ImageUploader } from "../ui/image-uploader";
import { notify, notifyResponse } from "../ui/toast-provider";
import styles from "./admin-dashboard.module.css";

export function ClientManager({ clients, locale }: { clients: ApiClient[]; locale: Locale; products: ApiProduct[] }) {
  return (
    <div className={styles.clientList}>
      {clients.length ? clients.map((client) => (
        <a className={styles.clientRow} href={`/admin/clients/${client.id}`} key={client.id}>
          <div>
            <strong>{client.name}</strong>
            <span>{formatCustomerNumber(client.customerNumber)}</span>
          </div>
          <span>{client.email}</span>
          <span>{client.services?.filter((s) => s.status === "ACTIVE").length ?? 0} active</span>
          <span>{client.domainRecords?.length ?? 0} domains</span>
          <span>{client.invoices?.filter((i) => i.status !== "PAID").length ?? 0} unpaid inv.</span>
          <span>{money(client.invoices?.filter((i) => i.status === "PAID").reduce((sum, i) => sum + i.totalCents, 0) ?? 0, "EUR", locale)}</span>
        </a>
      )) : <p style={{ padding: "16px", color: "var(--muted)", fontSize: "0.9rem" }}>No clients yet.</p>}
    </div>
  );
}

function generatePassword() {
  const uppercase = "ABCDEFGHJKLMNPQRSTUVWXYZ";
  const lowercase = "abcdefghijkmnopqrstuvwxyz";
  const numbers = "23456789";
  const specials = "~*!@$#%_+.?:,{}";
  const all = `${uppercase}${lowercase}${numbers}${specials}`;
  const chars = [pickChar(uppercase), pickChar(lowercase), pickChar(numbers), pickChar(specials), ...Array.from({ length: 8 }, () => pickChar(all))];
  return shuffleChars(chars).join("");
}

function pickChar(source: string) {
  const arr = new Uint32Array(1);
  crypto.getRandomValues(arr);
  return source[(arr[0] ?? 0) % source.length] ?? source[0] ?? "A";
}

function shuffleChars(values: string[]) {
  return values
    .map((value) => { const arr = new Uint32Array(1); crypto.getRandomValues(arr); return { sort: arr[0] ?? 0, value }; })
    .sort((a, b) => a.sort - b.sort)
    .map((item) => item.value);
}

export function AddClientForm() {
  const [message, setMessage] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);

  async function createClient(formData: FormData) {
    const response = await fetch(`${API_BASE_URL}/users`, {
      body: JSON.stringify({
        address: {
          city: String(formData.get("city") ?? ""),
          line1: String(formData.get("address") ?? ""),
          postalCode: String(formData.get("postalCode") ?? ""),
          state: String(formData.get("state") ?? "")
        },
        countryCode: String(formData.get("countryCode") ?? "DE"),
        customerType: String(formData.get("customerType") ?? "INDIVIDUAL"),
        email: String(formData.get("email") ?? ""),
        name: String(formData.get("name") ?? ""),
        password: String(formData.get("password") ?? ""),
        phone: String(formData.get("phone") ?? "") || undefined,
        vatId: String(formData.get("vatId") ?? "") || undefined
      }),
      headers: { "Content-Type": "application/json", ...authHeaders() },
      method: "POST"
    });
    if (response.ok) {
      const payload = await response.json().catch(() => ({})) as { id?: string };
      if (payload.id) {
        window.location.assign(`/admin/clients/${payload.id}`);
        return;
      }
    }
    setMessage(await notifyResponse(response, "Client created.", "Client creation failed."));
  }

  return (
    <form action={createClient} className={styles.form}>
      <div className={styles.formGrid}>
        <label>Name<input name="name" required placeholder="Max Mustermann" /></label>
        <label>Email<input name="email" required type="email" placeholder="max@example.com" /></label>
        <label className={styles.formSpan2}>
          Password *
          <div className={styles.passwordControl}>
            <div className={styles.passwordInputWrap}>
              <input
                autoComplete="new-password"
                maxLength={16}
                minLength={9}
                name="password"
                onChange={(e) => setPassword(e.target.value)}
                required
                type={showPassword ? "text" : "password"}
                value={password}
              />
              <button
                aria-label={showPassword ? "Hide password" : "Show password"}
                className={styles.passwordToggle}
                onClick={() => setShowPassword((v) => !v)}
                type="button"
              >
                {showPassword ? <EyeOff aria-hidden size={16} /> : <Eye aria-hidden size={16} />}
              </button>
            </div>
            <button
              className={styles.generateButton}
              onClick={() => { setPassword(generatePassword()); setShowPassword(true); }}
              type="button"
            >
              Generate
            </button>
          </div>
        </label>
        <label>Customer type<select name="customerType"><option value="INDIVIDUAL">Individual</option><option value="BUSINESS">Business</option></select></label>
        <label>Country<input defaultValue="DE" name="countryCode" placeholder="DE" /></label>
        <label>VAT ID<input name="vatId" placeholder="DE123456789" /></label>
        <label>
          Phone (international format)
          <input name="phone" type="tel" placeholder="+49 1234567890" />
          <span className={styles.fieldHint}>Use +CC format (e.g. +49 …). Required for domain registrations.</span>
        </label>
        <label>Address<input name="address" placeholder="Musterstraße 1" /></label>
        <label>ZIP<input name="postalCode" placeholder="12345" /></label>
        <label>City<input name="city" placeholder="Berlin" /></label>
        <label className={styles.formSpan2}>State / Region<input name="state" placeholder="Berlin" /></label>
      </div>
      <div className={styles.formActions}>
        <Button icon={Save} type="submit">Create Client</Button>
      </div>
      {message ? <p className={styles.formMessage}>{message}</p> : null}
    </form>
  );
}

function ClientRow({ client, products }: { client: ApiClient; products: ApiProduct[] }) {
  const [message, setMessage] = useState("");
  const contact = client.contacts?.[0];
  const address = contact?.address ?? {};
  const defaultProduct = products.find((product) => product.type !== "DOMAIN") ?? products[0];
  const defaultDomainProduct = products.find((product) => product.type === "DOMAIN");

  async function saveClient(formData: FormData) {
    const response = await fetch(`${API_BASE_URL}/users/${client.id}`, {
      body: JSON.stringify({
        address: {
          city: String(formData.get("city") ?? ""),
          line1: String(formData.get("address") ?? ""),
          postalCode: String(formData.get("postalCode") ?? ""),
          state: String(formData.get("state") ?? "")
        },
        countryCode: String(formData.get("countryCode") ?? "DE"),
        customerType: String(formData.get("customerType") ?? "INDIVIDUAL"),
        email: String(formData.get("email") ?? ""),
        name: String(formData.get("name") ?? ""),
        phone: String(formData.get("phone") ?? ""),
        segment: String(formData.get("segment") ?? "standard"),
        vatId: String(formData.get("vatId") ?? "")
      }),
      headers: { "Content-Type": "application/json", ...authHeaders() },
      method: "PATCH"
    });
    setMessage(await notifyResponse(response, "Client saved.", "Client save failed."));
  }

  async function deleteClient() {
    const response = await fetch(`${API_BASE_URL}/users/${client.id}`, { headers: authHeaders(), method: "DELETE" });
    setMessage(await notifyResponse(response, "Client deleted. Refresh to update list.", "Client delete failed."));
  }

  async function createInvoice(formData: FormData) {
    const response = await fetch(`${API_BASE_URL}/billing/invoices`, {
      body: JSON.stringify({
        buyerCountryCode: client.countryCode ?? "DE",
        buyerVatId: client.vatId ?? undefined,
        customerSnapshot: {
          address,
          countryCode: client.countryCode,
          customerNumber: client.customerNumber,
          customerType: client.customerType,
          email: client.email,
          name: client.name,
          phone: contact?.phone,
          vatId: client.vatId
        },
        dueAt: new Date(Date.now() + 7 * 86400_000).toISOString(),
        isBusinessCustomer: client.customerType === "BUSINESS",
        lines: [{
          billingCycle: "ONE_TIME",
          description: String(formData.get("description") ?? "Manual invoice"),
          quantity: Number(formData.get("quantity") ?? 1),
          type: "CUSTOM",
          unitAmountCents: Math.round(Number(formData.get("amount") ?? 0) * 100),
          vatRate: Number(formData.get("vatRate") ?? 19)
        }],
        status: "UNPAID",
        userId: client.id
      }),
      headers: { "Content-Type": "application/json", ...authHeaders() },
      method: "POST"
    });
    setMessage(await notifyResponse(response, "Invoice created.", "Invoice creation failed."));
  }

  async function createOrder(formData: FormData) {
    const productId = String(formData.get("productId") ?? defaultProduct?.id ?? "");
    const product = products.find((candidate) => candidate.id === productId);
    const price = product?.prices.find((candidate) => candidate.id === String(formData.get("productPriceId"))) ?? product?.prices[0];
    const addDomain = formData.get("addDomain") === "on" && defaultDomainProduct;
    const items = [
      {
        configuration: {
          apiModule: String(formData.get("apiModule") ?? product?.provisioningModule ?? ""),
          domainName: String(formData.get("domainName") ?? "")
        },
        productId,
        productPriceId: price?.id,
        quantity: 1
      }
    ];
    if (addDomain) {
      items.push({
        configuration: { domainAction: String(formData.get("domainAction") ?? "register") },
        domainName: String(formData.get("domainName") ?? ""),
        productId: defaultDomainProduct.id,
        productPriceId: defaultDomainProduct.prices[0]?.id,
        quantity: 1
      } as never);
    }
    const placedAtRaw = String(formData.get("placedAt") ?? "");
    const response = await fetch(`${API_BASE_URL}/orders/admin`, {
      body: JSON.stringify({
        items,
        notes: String(formData.get("notes") ?? ""),
        placedAt: placedAtRaw ? new Date(placedAtRaw).toISOString() : undefined,
        userId: client.id
      }),
      headers: { "Content-Type": "application/json", ...authHeaders() },
      method: "POST"
    });
    setMessage(await notifyResponse(response, "Order created with unpaid invoice and pending items.", "Order creation failed."));
  }

  return (
    <details className={styles.clientRow}>
      <summary>
        <strong>{client.name}</strong>
        <a href={`/admin/clients/${client.id}`}>Open</a>
        <span>Kundennummer {formatCustomerNumber(client.customerNumber)}</span>
        <span>{client.email}</span>
        <span>{client.services?.filter((service) => service.status === "ACTIVE").length ?? 0} active services</span>
        <span>{client.domainRecords?.length ?? 0} domains</span>
        <span>{client.invoices?.filter((invoice) => invoice.status !== "PAID").length ?? 0} unpaid invoices</span>
        <span>{money(client.invoices?.filter((invoice) => invoice.status === "PAID").reduce((sum, invoice) => sum + invoice.totalCents, 0) ?? 0)}</span>
      </summary>
      <form action={saveClient} className={styles.form}>
        <h3>Edit Client</h3>
        <label>Name<input defaultValue={client.name} name="name" required /></label>
        <label>Email<input defaultValue={client.email} name="email" required type="email" /></label>
        <label>Segment<input defaultValue={client.segment} name="segment" /></label>
        <label>Customer type<select defaultValue={client.customerType} name="customerType"><option value="INDIVIDUAL">Individual</option><option value="BUSINESS">Business</option></select></label>
        <label>Country<input defaultValue={client.countryCode} name="countryCode" /></label>
        <label>VAT ID<input defaultValue={client.vatId ?? ""} name="vatId" /></label>
        <label>Phone<input defaultValue={contact?.phone ?? ""} name="phone" /></label>
        <label>Address<input defaultValue={address.line1 ?? ""} name="address" /></label>
        <label>ZIP<input defaultValue={address.postalCode ?? ""} name="postalCode" /></label>
        <label>City<input defaultValue={address.city ?? ""} name="city" /></label>
        <label>State<input defaultValue={address.state ?? ""} name="state" /></label>
        <div className={styles.inlineForm}>
          <Button icon={Save} type="submit">Save Client</Button>
          <Button icon={Trash2} type="button" variant="secondary" onClick={deleteClient}>Delete</Button>
        </div>
      </form>
      <form action={createOrder} className={styles.form}>
        <h3>Create Order</h3>
        <label>Product<select name="productId" defaultValue={defaultProduct?.id}>{products.map((product) => <option key={product.id} value={product.id}>{product.name}</option>)}</select></label>
        <label>Price<select name="productPriceId" defaultValue={defaultProduct?.prices[0]?.id}>{products.flatMap((product) => product.prices.map((price) => <option key={price.id} value={price.id}>{product.name} {price.billingCycle} {money(price.amountCents, price.currency)}</option>))}</select></label>
        <label>Domain name<input name="domainName" placeholder="example.com" /></label>
        <label>Domain action<select name="domainAction"><option value="register">Register</option><option value="transfer">Transfer</option></select></label>
        <label>API module<input defaultValue={defaultProduct?.provisioningModule ?? "virtualmin"} name="apiModule" /></label>
        <label><span><input name="addDomain" type="checkbox" /> Add domain item too</span></label>
        <label>Order date<input defaultValue={datetimeLocal(new Date().toISOString())} name="placedAt" type="datetime-local" /></label>
        <label>Notes<textarea name="notes" rows={2} /></label>
        <Button icon={Package} type="submit">Create Order</Button>
      </form>
      <form action={createInvoice} className={styles.form}>
        <h3>Create Invoice</h3>
        <label>Description<input defaultValue="Manual service" name="description" /></label>
        <label>Quantity<input defaultValue="1" min="1" name="quantity" type="number" /></label>
        <label>Amount EUR<input defaultValue="10" min="0" name="amount" step="0.01" type="number" /></label>
        <label>VAT rate<input defaultValue="19" min="0" name="vatRate" step="0.01" type="number" /></label>
        <Button icon={FileText} type="submit">Create Invoice</Button>
      </form>
      {message ? <p>{message}</p> : null}
    </details>
  );
}

export function AdminClientEditForm({ client }: { client: ApiClient }) {
  const [message, setMessage] = useState("");
  const [pwMessage, setPwMessage] = useState("");
  const contact = client.contacts?.[0];
  const address = contact?.address ?? {};

  async function saveProfile(formData: FormData) {
    const response = await fetch(`${API_BASE_URL}/users/${client.id}`, {
      body: JSON.stringify({
        address: {
          city: String(formData.get("city") ?? ""),
          line1: String(formData.get("address") ?? ""),
          postalCode: String(formData.get("postalCode") ?? ""),
          state: String(formData.get("state") ?? "")
        },
        countryCode: String(formData.get("countryCode") ?? "DE"),
        customerType: String(formData.get("customerType") ?? "INDIVIDUAL"),
        email: String(formData.get("email") ?? ""),
        name: String(formData.get("name") ?? ""),
        phone: String(formData.get("phone") ?? ""),
        vatId: String(formData.get("vatId") ?? "") || null
      }),
      headers: { "Content-Type": "application/json", ...authHeaders() },
      method: "PATCH"
    });
    setMessage(await notifyResponse(response, "Client profile saved.", "Profile save failed."));
  }

  async function changePassword(formData: FormData) {
    const newPassword = String(formData.get("newPassword") ?? "");
    const confirmPassword = String(formData.get("confirmPassword") ?? "");
    if (newPassword !== confirmPassword) {
      setPwMessage("Passwords do not match.");
      return;
    }
    const response = await fetch(`${API_BASE_URL}/users/${client.id}`, {
      body: JSON.stringify({ newPassword }),
      headers: { "Content-Type": "application/json", ...authHeaders() },
      method: "PATCH"
    });
    setPwMessage(await notifyResponse(response, "Password changed.", "Password change failed."));
  }

  return (
    <div>
      <form action={saveProfile} className={styles.form}>
        <h3>Edit Profile</h3>
        <div className={styles.formGrid}>
          <label>Name<input defaultValue={client.name} name="name" required /></label>
          <label>Email<input defaultValue={client.email} name="email" required type="email" /></label>
          <label>Customer type
            <select defaultValue={client.customerType} name="customerType">
              <option value="INDIVIDUAL">Individual</option>
              <option value="BUSINESS">Business</option>
            </select>
          </label>
          <label>Country<input defaultValue={client.countryCode ?? "DE"} name="countryCode" placeholder="DE" /></label>
          <label>VAT ID<input defaultValue={client.vatId ?? ""} name="vatId" placeholder="DE123456789" /></label>
          <label>Phone<input defaultValue={contact?.phone ?? ""} name="phone" /></label>
          <label>Address<input defaultValue={address.line1 ?? ""} name="address" /></label>
          <label>ZIP<input defaultValue={address.postalCode ?? ""} name="postalCode" /></label>
          <label>City<input defaultValue={address.city ?? ""} name="city" /></label>
          <label className={styles.formSpan2}>State / Region<input defaultValue={address.state ?? ""} name="state" /></label>
        </div>
        <div className={styles.formActions}>
          <Button icon={Save} type="submit">Save Profile</Button>
        </div>
        {message ? <p className={styles.formMessage}>{message}</p> : null}
      </form>
      <hr style={{ margin: "0 16px", border: "none", borderTop: "1px solid var(--border)" }} />
      <form action={changePassword} className={styles.form}>
        <h3>Change Password</h3>
        <div className={styles.formGrid}>
          <label>New password<input name="newPassword" required type="password" placeholder="New password" /></label>
          <label>Confirm password<input name="confirmPassword" required type="password" placeholder="Confirm password" /></label>
        </div>
        <div className={styles.formActions}>
          <Button icon={Save} type="submit">Set Password</Button>
        </div>
        {pwMessage ? <p className={styles.formMessage}>{pwMessage}</p> : null}
      </form>
    </div>
  );
}

export function AdminClientDeleteButton({ clientId, clientName }: { clientId: string; clientName: string }) {
  const [message, setMessage] = useState("");

  async function handleDelete() {
    const confirmed = window.confirm(
      `Are you sure you want to delete client "${clientName}"?\n\n` +
      `WARNING: All invoices for this client will also be permanently deleted.\n` +
      `Please make sure to download and back up any invoice data before proceeding.\n\n` +
      `This action cannot be undone.`
    );
    if (!confirmed) return;
    const response = await fetch(`${API_BASE_URL}/users/${clientId}`, { headers: authHeaders(), method: "DELETE" });
    const ok = response.ok;
    setMessage(await notifyResponse(response, "Client deleted.", "Client delete failed."));
    if (ok) {
      window.location.assign("/admin/clients");
    }
  }

  return (
    <div className={styles.formActions}>
      <Button icon={Trash2} type="button" variant="ghost" onClick={handleDelete}>Delete Client</Button>
      {message ? <span style={{ fontSize: "0.85rem", color: "var(--muted)" }}>{message}</span> : null}
    </div>
  );
}

export function AdminCreateInvoicePanel({ client }: { client: ApiClient }) {
  const [message, setMessage] = useState("");
  const contact = client.contacts?.[0];
  const address = contact?.address ?? {};

  async function createInvoice(formData: FormData) {
    const descriptions = formData.getAll("description").map(String).filter(Boolean);
    const lines = descriptions.map((description, index) => ({
      billingCycle: String(formData.getAll("billingCycle")[index] ?? "ONE_TIME"),
      description,
      quantity: Number(formData.getAll("quantity")[index] ?? 1),
      type: "CUSTOM",
      unitAmountCents: Math.round(Number(formData.getAll("amount")[index] ?? 0) * 100),
      vatRate: Number(formData.getAll("vatRate")[index] ?? 19)
    }));
    const response = await fetch(`${API_BASE_URL}/billing/invoices`, {
      body: JSON.stringify({
        buyerCountryCode: client.countryCode ?? "DE",
        buyerVatId: client.vatId ?? undefined,
        customerSnapshot: { address, countryCode: client.countryCode, customerNumber: client.customerNumber, customerType: client.customerType, email: client.email, name: client.name, phone: contact?.phone, vatId: client.vatId },
        dueAt: new Date(Date.now() + 7 * 86400_000).toISOString(),
        isBusinessCustomer: client.customerType === "BUSINESS",
        lines,
        status: "UNPAID",
        userId: client.id
      }),
      headers: { "Content-Type": "application/json", ...authHeaders() },
      method: "POST"
    });
    setMessage(await notifyResponse(response, "Invoice created.", "Invoice creation failed."));
  }

  return (
    <form action={createInvoice} className={styles.form}>
      <div className={styles.formGrid}>
        {[0, 1, 2].map((index) => (
          <fieldset className={`${styles.lineEditor} ${styles.formSpan2}`} key={index}>
            <legend>Line {index + 1}</legend>
            <label>Description<input defaultValue={index === 0 ? "Manual service" : ""} name="description" /></label>
            <label>Billing cycle
              <select defaultValue="ONE_TIME" name="billingCycle">
                <option value="ONE_TIME">One time</option>
                <option value="MONTHLY">Monthly</option>
                <option value="YEAR_1">Annually</option>
              </select>
            </label>
            <label>Quantity<input defaultValue="1" min="1" name="quantity" type="number" /></label>
            <label>Amount EUR<input defaultValue={index === 0 ? "10" : "0"} min="0" name="amount" step="0.01" type="number" /></label>
            <label>VAT rate %<input defaultValue="19" min="0" name="vatRate" step="0.01" type="number" /></label>
          </fieldset>
        ))}
      </div>
      <div className={styles.formActions}>
        <Button icon={FileText} type="submit">Create Invoice</Button>
      </div>
      {message ? <p className={styles.formMessage}>{message}</p> : null}
    </form>
  );
}

export function ClientDetailModals({ client, products }: { client: ApiClient; products: ApiProduct[] }) {
  const [open, setOpen] = useState<"order" | "invoice" | null>(null);
  const [message, setMessage] = useState("");
  const contact = client.contacts?.[0];
  const address = contact?.address ?? {};
  const defaultProduct = products.find((product) => product.type !== "DOMAIN") ?? products[0];
  const defaultDomainProduct = products.find((product) => product.type === "DOMAIN");

  async function createOrder(formData: FormData) {
    const productId = String(formData.get("productId") ?? defaultProduct?.id ?? "");
    const product = products.find((candidate) => candidate.id === productId);
    const price = product?.prices.find((candidate) => candidate.id === String(formData.get("productPriceId"))) ?? product?.prices[0];
    const domainName = String(formData.get("domainName") ?? "");
    const items: Array<Record<string, unknown>> = [{
      configuration: { apiModule: String(formData.get("apiModule") ?? product?.provisioningModule ?? ""), domainName },
      productId,
      productPriceId: price?.id,
      quantity: 1
    }];
    if (formData.get("addDomain") === "on" && defaultDomainProduct) {
      items.push({
        configuration: { domainAction: String(formData.get("domainAction") ?? "register") },
        domainName,
        productId: defaultDomainProduct.id,
        productPriceId: defaultDomainProduct.prices[0]?.id,
        quantity: 1
      });
    }
    const response = await fetch(`${API_BASE_URL}/orders/admin`, {
      body: JSON.stringify({ items, notes: String(formData.get("notes") ?? ""), userId: client.id }),
      headers: { "Content-Type": "application/json", ...authHeaders() },
      method: "POST"
    });
    setMessage(await notifyResponse(response, "Order created.", "Order creation failed."));
  }

  async function createInvoice(formData: FormData) {
    const descriptions = formData.getAll("description").map(String).filter(Boolean);
    const lines = descriptions.map((description, index) => ({
      billingCycle: String(formData.getAll("billingCycle")[index] ?? "ONE_TIME"),
      description,
      quantity: Number(formData.getAll("quantity")[index] ?? 1),
      type: "CUSTOM",
      unitAmountCents: Math.round(Number(formData.getAll("amount")[index] ?? 0) * 100),
      vatRate: Number(formData.getAll("vatRate")[index] ?? 19)
    }));
    const response = await fetch(`${API_BASE_URL}/billing/invoices`, {
      body: JSON.stringify({
        buyerCountryCode: client.countryCode ?? "DE",
        buyerVatId: client.vatId ?? undefined,
        customerSnapshot: { address, countryCode: client.countryCode, customerNumber: client.customerNumber, customerType: client.customerType, email: client.email, name: client.name, phone: contact?.phone, vatId: client.vatId },
        dueAt: new Date(Date.now() + 7 * 86400_000).toISOString(),
        isBusinessCustomer: client.customerType === "BUSINESS",
        lines,
        status: "UNPAID",
        userId: client.id
      }),
      headers: { "Content-Type": "application/json", ...authHeaders() },
      method: "POST"
    });
    setMessage(await notifyResponse(response, "Invoice created.", "Invoice creation failed."));
  }

  return (
    <div className={styles.inlineForm}>
      <Button icon={Package} type="button" onClick={() => setOpen("order")}>Create Order</Button>
      <Button icon={FileText} type="button" variant="secondary" onClick={() => setOpen("invoice")}>Create Invoice</Button>
      {message ? <span>{message}</span> : null}

      <dialog className={styles.modal} open={open === "order"}>
        <form action={createOrder} className={styles.form}>
          <h3>Create Order</h3>
          <label>Product<select name="productId" defaultValue={defaultProduct?.id}>{products.map((product) => <option key={product.id} value={product.id}>{product.name}</option>)}</select></label>
          <label>Price<select name="productPriceId" defaultValue={defaultProduct?.prices[0]?.id}>{products.flatMap((product) => product.prices.map((price) => <option key={price.id} value={price.id}>{product.name} {price.billingCycle} {money(price.amountCents, price.currency)}</option>))}</select></label>
          <label>Domain name<input name="domainName" placeholder="example.com" /></label>
          <label>Domain action<select name="domainAction"><option value="register">Register</option><option value="transfer">Transfer</option></select></label>
          <label>API module<input defaultValue={defaultProduct?.provisioningModule ?? "virtualmin"} name="apiModule" /></label>
          <label><span><input name="addDomain" type="checkbox" /> Add domain item too</span></label>
          <label>Notes<textarea name="notes" rows={2} /></label>
          <div className={styles.inlineForm}>
            <Button icon={Plus} type="submit">Create</Button>
            <Button type="button" variant="secondary" onClick={() => setOpen(null)}>Close</Button>
          </div>
        </form>
      </dialog>

      <dialog className={styles.modal} open={open === "invoice"}>
        <form action={createInvoice} className={styles.form}>
          <h3>Create Invoice</h3>
          {[0, 1, 2].map((index) => (
            <fieldset className={styles.lineEditor} key={index}>
              <legend>Line {index + 1}</legend>
              <label>Description<input defaultValue={index === 0 ? "Manual service" : ""} name="description" /></label>
              <label>Billing cycle<select defaultValue="ONE_TIME" name="billingCycle"><option value="ONE_TIME">One time</option><option value="MONTHLY">Monthly</option><option value="YEAR_1">Annually</option></select></label>
              <label>Quantity<input defaultValue="1" min="1" name="quantity" type="number" /></label>
              <label>Amount EUR<input defaultValue={index === 0 ? "10" : "0"} min="0" name="amount" step="0.01" type="number" /></label>
              <label>VAT rate<input defaultValue="19" min="0" name="vatRate" step="0.01" type="number" /></label>
            </fieldset>
          ))}
          <div className={styles.inlineForm}>
            <Button icon={FileText} type="submit">Create</Button>
            <Button type="button" variant="secondary" onClick={() => setOpen(null)}>Close</Button>
          </div>
        </form>
      </dialog>
    </div>
  );
}

export function AdminInvoiceActions({ invoice }: { invoice: ApiInvoice }) {
  const [message, setMessage] = useState("");
  const [showMarkPaid, setShowMarkPaid] = useState(false);
  const isPermanent = !!(invoice.finalInvoiceNumber ?? (invoice.status === "PAID" && invoice.invoiceNumber));

  async function handleMarkPaid(formData: FormData) {
    const paidAtValue = String(formData.get("paidAt") ?? "");
    const transactionId = String(formData.get("transactionId") ?? "").trim() || undefined;
    const skipModules = formData.get("skipModules") === "on";
    const response = await fetch(`${API_BASE_URL}/billing/invoices/${invoice.id}/mark-paid`, {
      body: JSON.stringify({
        paidAt: paidAtValue ? new Date(paidAtValue).toISOString() : undefined,
        skipModules,
        transactionId
      }),
      headers: { "Content-Type": "application/json", ...authHeaders() },
      method: "POST"
    });
    setMessage(await notifyResponse(response, "Marked paid. Refresh to see changes.", "Mark paid failed."));
    if (response.ok) setShowMarkPaid(false);
  }

  async function markUnpaid() {
    const response = await fetch(`${API_BASE_URL}/billing/invoices/${invoice.id}/mark-unpaid`, {
      body: JSON.stringify({ reason: "Admin manual change" }),
      headers: { "Content-Type": "application/json", ...authHeaders() },
      method: "POST"
    });
    setMessage(await notifyResponse(response, "Marked unpaid. Services were not terminated.", "Mark unpaid failed."));
  }

  async function refundInvoice() {
    const response = await fetch(`${API_BASE_URL}/billing/invoices/${invoice.id}/refund`, {
      body: JSON.stringify({ reason: "Admin refund" }),
      headers: { "Content-Type": "application/json", ...authHeaders() },
      method: "POST"
    });
    setMessage(await notifyResponse(response, "Invoice refunded. Refresh to update status.", "Refund failed."));
  }

  async function deleteInvoice() {
    if (isPermanent) {
      const confirmed = window.confirm(
        `Warning: This is a permanent invoice (${invoice.finalInvoiceNumber ?? invoice.invoiceNumber}).\n\n` +
        `Deleting a permanent invoice is irreversible. All associated data will be lost.\n\n` +
        `Are you sure you want to permanently delete this invoice?`
      );
      if (!confirmed) return;
    }
    const response = await fetch(`${API_BASE_URL}/billing/invoices/${invoice.id}`, {
      headers: authHeaders(),
      method: "DELETE"
    });
    setMessage(await notifyResponse(response, "Invoice deleted.", "Invoice delete failed."));
  }

  return (
    <div className={styles.form} style={{ gap: 12 }}>
      <div className={styles.inlineForm}>
        {invoice.status !== "PAID" ? (
          <Button icon={CreditCard} type="button" onClick={() => setShowMarkPaid((v) => !v)}>
            {showMarkPaid ? "Cancel" : "Mark Paid"}
          </Button>
        ) : null}
        {invoice.status === "PAID" ? <Button icon={CreditCard} type="button" variant="secondary" onClick={markUnpaid}>Mark Unpaid</Button> : null}
        {invoice.status === "PAID" ? <Button icon={CreditCard} type="button" variant="secondary" onClick={refundInvoice}>Refund</Button> : null}
        <Button icon={Trash2} type="button" variant="ghost" onClick={deleteInvoice}>Delete</Button>
      </div>

      {showMarkPaid && invoice.status !== "PAID" ? (
        <form action={handleMarkPaid} className={styles.form} style={{ padding: 0 }}>
          <div className={styles.formGrid}>
            <label>
              Payment date
              <input defaultValue={datetimeLocal(new Date().toISOString())} name="paidAt" type="datetime-local" />
            </label>
            <label>
              Transaction ID (optional)
              <input name="transactionId" placeholder="e.g. PAY-12345" />
            </label>
            <label className={styles.formSpan2}>
              <span><input name="skipModules" type="checkbox" /> Skip module provisioning (do not activate services)</span>
            </label>
          </div>
          <div className={styles.formActions}>
            <Button icon={CreditCard} type="submit">Confirm Mark Paid</Button>
          </div>
        </form>
      ) : null}

      {message ? <small style={{ padding: "0 16px", color: "var(--muted)" }}>{message}</small> : null}
    </div>
  );
}

export function AdminServiceStatusForm({ serviceId, status }: { serviceId: string; status: string }) {
  const [message, setMessage] = useState("");
  async function submit(formData: FormData) {
    const response = await fetch(`${API_BASE_URL}/admin/dev/services/${serviceId}/status`, {
      body: JSON.stringify({ status: String(formData.get("status") ?? status) }),
      headers: { "Content-Type": "application/json", ...authHeaders() },
      method: "PATCH"
    });
    setMessage(await notifyResponse(response, "Service status saved.", "Service status failed."));
  }

  const statusOptions: Array<[string, string]> = [
    ["PENDING", "Pending"],
    ["ORDERED", "Ordered"],
    ["PROVISIONING", "Provisioning"],
    ["ACTIVE", "Active"],
    ["SUSPENDED", "Suspended"],
    ["CANCELLED", "Cancelled"],
    ["TERMINATED", "Terminated"],
    ["FAILED", "Failed"]
  ];
  return (
    <form action={submit} className={styles.inlineForm}>
      <select defaultValue={status} name="status">
        {statusOptions.map(([value, label]) => (
          <option key={value} value={value}>{label}</option>
        ))}
      </select>
      <Button icon={Save} type="submit">Save Status</Button>
      {message ? <span>{message}</span> : null}
    </form>
  );
}

export function AdminServiceDueDateForm({ renewsAt, serviceId }: { renewsAt?: string | null; serviceId: string }) {
  const [message, setMessage] = useState("");

  async function submit(formData: FormData) {
    const value = String(formData.get("renewsAt") ?? "");
    const response = await fetch(`${API_BASE_URL}/admin/dev/services/${serviceId}`, {
      body: JSON.stringify({ renewsAt: value ? new Date(value).toISOString() : null }),
      headers: { "Content-Type": "application/json", ...authHeaders() },
      method: "PATCH"
    });
    setMessage(await notifyResponse(response, "Due date updated.", "Due date update failed."));
  }

  return (
    <form action={submit} className={styles.inlineForm}>
      <label style={{ display: "flex", alignItems: "center", gap: 8 }}>
        Next due
        <input defaultValue={dateInputValue(renewsAt)} name="renewsAt" type="date" />
      </label>
      <Button icon={Save} type="submit">Update Due Date</Button>
      {message ? <span>{message}</span> : null}
    </form>
  );
}

function dateInputValue(value?: string | null) {
  return value ? new Date(value).toISOString().slice(0, 10) : "";
}

export function AnnouncementForm() {
  const [announcements, setAnnouncements] = useState<ApiAnnouncement[]>([]);
  const [editing, setEditing] = useState<ApiAnnouncement>();
  const [message, setMessage] = useState("");

  useEffect(() => {
    void refresh();
  }, []);

  async function refresh() {
    const response = await fetch(`${API_BASE_URL}/cms/admin/dev/announcements`, { headers: authHeaders() });
    const payload = await response.json().catch(() => []);
    setAnnouncements(Array.isArray(payload) ? payload : []);
  }

  async function submit(formData: FormData) {
    const title = String(formData.get("title") ?? "");
    const publishedAt = String(formData.get("publishedAt") ?? "");
    const response = await fetch(`${API_BASE_URL}/cms/admin/dev/announcements${editing ? `/${editing.id}` : ""}`, {
      body: JSON.stringify({
        body: String(formData.get("body") ?? ""),
        excerpt: String(formData.get("excerpt") ?? ""),
        locale: String(formData.get("locale") ?? "de"),
        publishedAt: publishedAt ? new Date(publishedAt).toISOString() : new Date().toISOString(),
        title
      }),
      headers: { "Content-Type": "application/json", ...authHeaders() },
      method: editing ? "PATCH" : "POST"
    });

    setMessage(await notifyResponse(response, editing ? "Announcement saved." : "Announcement published.", "Announcement failed."));
    if (response.ok) {
      setEditing(undefined);
      await refresh();
    }
  }

  async function remove(announcement: ApiAnnouncement) {
    const response = await fetch(`${API_BASE_URL}/cms/admin/dev/announcements/${announcement.id}`, { headers: authHeaders(), method: "DELETE" });
    setMessage(await notifyResponse(response, "Announcement deleted.", "Delete failed."));
    if (response.ok) {
      await refresh();
    }
  }

  return (
    <div className={styles.form}>
      <div className={styles.blogList}>
        {announcements.map((announcement) => (
          <article key={announcement.id}>
            <div>
              <strong>{announcement.title}</strong>
              <span>{announcement.locale ?? "de"} / {dateTimeLabel(announcement.publishedAt ?? announcement.createdAt)}</span>
            </div>
            <Button type="button" variant="secondary" onClick={() => setEditing(announcement)}>Edit</Button>
            <Button type="button" variant="ghost" onClick={() => remove(announcement)}>Delete</Button>
          </article>
        ))}
      </div>
      <form action={submit} className={styles.form} key={editing?.id ?? "new-announcement"}>
        <label>Title<input defaultValue={editing?.title ?? ""} name="title" placeholder="Maintenance window" required /></label>
        <label>Locale<select defaultValue={editing?.locale ?? "de"} name="locale"><option value="de">German</option><option value="en">English</option></select></label>
        <label>Date and time<input defaultValue={datetimeLocal(editing?.publishedAt)} name="publishedAt" type="datetime-local" /></label>
        <label>Excerpt<input defaultValue={editing?.excerpt ?? ""} name="excerpt" placeholder="Short portal message" /></label>
        <label>Content<textarea defaultValue={editing?.body ?? ""} name="body" rows={5} placeholder="Short announcement" required /></label>
        <Button icon={Bell} type="submit">{editing ? "Save Announcement" : "Publish Announcement"}</Button>
        {editing ? <Button type="button" variant="secondary" onClick={() => setEditing(undefined)}>New Announcement</Button> : null}
        {message ? <p>{message}</p> : null}
      </form>
    </div>
  );
}

export function CronSettingsForm() {
  const [message, setMessage] = useState("");
  const [lastCronRun, setLastCronRun] = useState("");
  const [s, setS] = useState({
    cronSecret: "",
    domainExpirationUpdateHours: 12,
    domainPriceUpdateHours: 24,
    domainStatusUpdateMinutes: 15,
    hostingStatusUpdateMinutes: 15,
    invoiceDaysAhead: 7,
    invoiceReminderDaysBeforeDue: 3,
    mailboxCheckMinutes: 5,
    salesImapEnabled: false,
    salesImapHost: "",
    salesImapMailbox: "INBOX",
    salesImapPassword: "",
    salesImapPort: 993,
    salesImapSecure: true,
    salesImapUsername: "",
    salesMailboxAddress: "sales@dezhost.com",
    supportImapEnabled: false,
    supportImapHost: "",
    supportImapMailbox: "INBOX",
    supportImapPassword: "",
    supportImapPort: 993,
    supportImapSecure: true,
    supportImapUsername: "",
    supportMailboxAddress: "support@dezhost.com",
    ticketAutoCloseHours: 24
  });

  useEffect(() => {
    void fetch(`${API_BASE_URL}/admin/dev/billing/settings`, { headers: authHeaders() })
      .then((r) => r.json())
      .then((p) => setS({
        cronSecret: p.cronSecret ?? "",
        domainExpirationUpdateHours: p.domainExpirationUpdateHours ?? 12,
        domainPriceUpdateHours: p.domainPriceUpdateHours ?? 24,
        domainStatusUpdateMinutes: p.domainStatusUpdateMinutes ?? 15,
        hostingStatusUpdateMinutes: p.hostingStatusUpdateMinutes ?? 15,
        invoiceDaysAhead: p.invoiceDaysAhead ?? 7,
        invoiceReminderDaysBeforeDue: p.invoiceReminderDaysBeforeDue ?? 3,
        mailboxCheckMinutes: p.mailboxCheckMinutes ?? 5,
        salesImapEnabled: Boolean(p.salesImapEnabled),
        salesImapHost: p.salesImapHost ?? "",
        salesImapMailbox: p.salesImapMailbox ?? "INBOX",
        salesImapPassword: p.salesImapPassword ?? "",
        salesImapPort: p.salesImapPort ?? 993,
        salesImapSecure: p.salesImapSecure !== false,
        salesImapUsername: p.salesImapUsername ?? "",
        salesMailboxAddress: p.salesMailboxAddress ?? "sales@dezhost.com",
        supportImapEnabled: Boolean(p.supportImapEnabled),
        supportImapHost: p.supportImapHost ?? "",
        supportImapMailbox: p.supportImapMailbox ?? "INBOX",
        supportImapPassword: p.supportImapPassword ?? "",
        supportImapPort: p.supportImapPort ?? 993,
        supportImapSecure: p.supportImapSecure !== false,
        supportImapUsername: p.supportImapUsername ?? "",
        supportMailboxAddress: p.supportMailboxAddress ?? "support@dezhost.com",
        ticketAutoCloseHours: p.ticketAutoCloseHours ?? 24
      }))
      .catch(() => undefined);
  }, []);

  async function submit(formData: FormData) {
    const response = await fetch(`${API_BASE_URL}/admin/dev/billing/settings`, {
      body: JSON.stringify({
        cronSecret: String(formData.get("cronSecret") ?? ""),
        domainExpirationUpdateHours: Number(formData.get("domainExpirationUpdateHours") ?? 12),
        domainPriceUpdateHours: Number(formData.get("domainPriceUpdateHours") ?? 24),
        domainStatusUpdateMinutes: Number(formData.get("domainStatusUpdateMinutes") ?? 15),
        hostingStatusUpdateMinutes: Number(formData.get("hostingStatusUpdateMinutes") ?? 15),
        invoiceDaysAhead: Number(formData.get("invoiceDaysAhead") ?? 7),
        invoiceReminderDaysBeforeDue: Number(formData.get("invoiceReminderDaysBeforeDue") ?? 3),
        mailboxCheckMinutes: Number(formData.get("mailboxCheckMinutes") ?? 5),
        salesImapEnabled: formData.get("salesImapEnabled") === "on",
        salesImapHost: String(formData.get("salesImapHost") ?? ""),
        salesImapMailbox: String(formData.get("salesImapMailbox") ?? "INBOX"),
        salesImapPassword: String(formData.get("salesImapPassword") ?? ""),
        salesImapPort: Number(formData.get("salesImapPort") ?? 993),
        salesImapSecure: formData.get("salesImapSecure") === "on",
        salesImapUsername: String(formData.get("salesImapUsername") ?? ""),
        salesMailboxAddress: String(formData.get("salesMailboxAddress") ?? "sales@dezhost.com"),
        supportImapEnabled: formData.get("supportImapEnabled") === "on",
        supportImapHost: String(formData.get("supportImapHost") ?? ""),
        supportImapMailbox: String(formData.get("supportImapMailbox") ?? "INBOX"),
        supportImapPassword: String(formData.get("supportImapPassword") ?? ""),
        supportImapPort: Number(formData.get("supportImapPort") ?? 993),
        supportImapSecure: formData.get("supportImapSecure") === "on",
        supportImapUsername: String(formData.get("supportImapUsername") ?? ""),
        supportMailboxAddress: String(formData.get("supportMailboxAddress") ?? "support@dezhost.com"),
        ticketAutoCloseHours: Number(formData.get("ticketAutoCloseHours") ?? 24)
      }),
      headers: { "Content-Type": "application/json", ...authHeaders() },
      method: "PATCH"
    });
    setMessage(await notifyResponse(response, "Cron settings saved.", "Save failed."));
  }

  async function runCron() {
    setLastCronRun("Running cron...");
    const response = await fetch(`${API_BASE_URL}/cron/admin/run`, { headers: authHeaders(), method: "POST" });
    const payload = (await response.json().catch(() => ({}))) as { ran?: unknown[]; skipped?: unknown[] };
    if (!response.ok) {
      setLastCronRun("Cron run failed.");
      notify.error("Cron run failed.");
      return;
    }
    const text = `Cron finished. Ran ${payload.ran?.length ?? 0}; skipped ${payload.skipped?.length ?? 0}.`;
    setLastCronRun(text);
    notify.success(text);
  }

  return (
    <form action={submit} className={styles.form}>
      <h3>Cron</h3>
      <Button icon={RefreshCw} type="button" variant="secondary" onClick={runCron}>Run Cron Now</Button>
      {lastCronRun ? <p>{lastCronRun}</p> : null}
      <label>Cron secret<input value={s.cronSecret} name="cronSecret" type="password" onChange={(e) => setS({ ...s, cronSecret: e.target.value })} /></label>
      <label>Update domain prices every (hours)<input min="1" value={s.domainPriceUpdateHours} name="domainPriceUpdateHours" type="number" onChange={(e) => setS({ ...s, domainPriceUpdateHours: Number(e.target.value) })} /></label>
      <label>Update domain expiration dates every (hours)<input min="1" value={s.domainExpirationUpdateHours} name="domainExpirationUpdateHours" type="number" onChange={(e) => setS({ ...s, domainExpirationUpdateHours: Number(e.target.value) })} /></label>
      <label>Update domain statuses every (minutes)<input min="1" value={s.domainStatusUpdateMinutes} name="domainStatusUpdateMinutes" type="number" onChange={(e) => setS({ ...s, domainStatusUpdateMinutes: Number(e.target.value) })} /></label>
      <label>Update hosting service statuses every (minutes)<input min="1" value={s.hostingStatusUpdateMinutes} name="hostingStatusUpdateMinutes" type="number" onChange={(e) => setS({ ...s, hostingStatusUpdateMinutes: Number(e.target.value) })} /></label>
      <label>Generate invoices days before due date<input value={s.invoiceDaysAhead} name="invoiceDaysAhead" type="number" onChange={(e) => setS({ ...s, invoiceDaysAhead: Number(e.target.value) })} /></label>
      <label>Create invoice reminders days before due date<input min="1" value={s.invoiceReminderDaysBeforeDue} name="invoiceReminderDaysBeforeDue" type="number" onChange={(e) => setS({ ...s, invoiceReminderDaysBeforeDue: Number(e.target.value) })} /></label>
      <label>Close answered tickets after (hours)<input value={s.ticketAutoCloseHours} name="ticketAutoCloseHours" type="number" onChange={(e) => setS({ ...s, ticketAutoCloseHours: Number(e.target.value) })} /></label>
      <label>Check mailboxes every (minutes)<input min="1" value={s.mailboxCheckMinutes} name="mailboxCheckMinutes" type="number" onChange={(e) => setS({ ...s, mailboxCheckMinutes: Number(e.target.value) })} /></label>
      <h3>Support mailbox IMAP</h3>
      <label><span><input checked={s.supportImapEnabled} name="supportImapEnabled" type="checkbox" onChange={(e) => setS({ ...s, supportImapEnabled: e.target.checked })} /> Enable support mailbox</span></label>
      <label>Support mailbox address<input value={s.supportMailboxAddress} name="supportMailboxAddress" type="email" onChange={(e) => setS({ ...s, supportMailboxAddress: e.target.value })} /></label>
      <label>Support IMAP host<input value={s.supportImapHost} name="supportImapHost" onChange={(e) => setS({ ...s, supportImapHost: e.target.value })} /></label>
      <label>Support IMAP port<input value={s.supportImapPort} name="supportImapPort" type="number" onChange={(e) => setS({ ...s, supportImapPort: Number(e.target.value) })} /></label>
      <label><span><input checked={s.supportImapSecure} name="supportImapSecure" type="checkbox" onChange={(e) => setS({ ...s, supportImapSecure: e.target.checked })} /> Support IMAP TLS/SSL</span></label>
      <label>Support IMAP username<input value={s.supportImapUsername} name="supportImapUsername" onChange={(e) => setS({ ...s, supportImapUsername: e.target.value })} /></label>
      <label>Support IMAP password<input value={s.supportImapPassword} name="supportImapPassword" type="password" onChange={(e) => setS({ ...s, supportImapPassword: e.target.value })} /></label>
      <label>Support IMAP mailbox<input value={s.supportImapMailbox} name="supportImapMailbox" onChange={(e) => setS({ ...s, supportImapMailbox: e.target.value })} /></label>
      <h3>Sales mailbox IMAP</h3>
      <label><span><input checked={s.salesImapEnabled} name="salesImapEnabled" type="checkbox" onChange={(e) => setS({ ...s, salesImapEnabled: e.target.checked })} /> Enable sales mailbox</span></label>
      <label>Sales mailbox address<input value={s.salesMailboxAddress} name="salesMailboxAddress" type="email" onChange={(e) => setS({ ...s, salesMailboxAddress: e.target.value })} /></label>
      <label>Sales IMAP host<input value={s.salesImapHost} name="salesImapHost" onChange={(e) => setS({ ...s, salesImapHost: e.target.value })} /></label>
      <label>Sales IMAP port<input value={s.salesImapPort} name="salesImapPort" type="number" onChange={(e) => setS({ ...s, salesImapPort: Number(e.target.value) })} /></label>
      <label><span><input checked={s.salesImapSecure} name="salesImapSecure" type="checkbox" onChange={(e) => setS({ ...s, salesImapSecure: e.target.checked })} /> Sales IMAP TLS/SSL</span></label>
      <label>Sales IMAP username<input value={s.salesImapUsername} name="salesImapUsername" onChange={(e) => setS({ ...s, salesImapUsername: e.target.value })} /></label>
      <label>Sales IMAP password<input value={s.salesImapPassword} name="salesImapPassword" type="password" onChange={(e) => setS({ ...s, salesImapPassword: e.target.value })} /></label>
      <label>Sales IMAP mailbox<input value={s.salesImapMailbox} name="salesImapMailbox" onChange={(e) => setS({ ...s, salesImapMailbox: e.target.value })} /></label>
      <Button icon={Save} type="submit">Save Cron Settings</Button>
      {message ? <p>{message}</p> : null}
    </form>
  );
}

export function SettingsForm() {
  const [message, setMessage] = useState("");
  const [s, setS] = useState({
    invoiceBankDetails: "",
    invoiceCompanyAddress: "",
    invoiceCompanyCity: "",
    invoiceCompanyCountry: "DE",
    invoiceCompanyEmail: "",
    invoiceCompanyName: "",
    invoiceCompanyPhone: "",
    invoiceCompanyZip: "",
    invoiceFooterLine1: "",
    invoiceFooterLine2: "",
    invoiceFooterLine3: "",
    invoicePaymentInstructions: "",
    invoiceVatNumber: "",
    siteLogoUrl: "",
    termsUrl: "",
    usdBufferCents: 0,
    usdExchangeRate: 1.0,
    vatPercent: 19
  });

  useEffect(() => {
    void fetch(`${API_BASE_URL}/admin/dev/billing/settings`, { headers: authHeaders() })
      .then((r) => r.json())
      .then((p) => setS({
        invoiceBankDetails: p.invoiceBankDetails ?? "",
        invoiceCompanyAddress: p.invoiceCompanyAddress ?? "",
        invoiceCompanyCity: p.invoiceCompanyCity ?? "",
        invoiceCompanyCountry: p.invoiceCompanyCountry ?? "DE",
        invoiceCompanyEmail: p.invoiceCompanyEmail ?? "",
        invoiceCompanyName: p.invoiceCompanyName ?? "",
        invoiceCompanyPhone: p.invoiceCompanyPhone ?? "",
        invoiceCompanyZip: p.invoiceCompanyZip ?? "",
        invoiceFooterLine1: p.invoiceFooterLine1 ?? "",
        invoiceFooterLine2: p.invoiceFooterLine2 ?? "",
        invoiceFooterLine3: p.invoiceFooterLine3 ?? "",
        invoicePaymentInstructions: p.invoicePaymentInstructions ?? "",
        invoiceVatNumber: p.invoiceVatNumber ?? "",
        siteLogoUrl: p.siteLogoUrl ?? "",
        termsUrl: p.termsUrl ?? "",
        usdBufferCents: p.usdBufferCents ?? 0,
        usdExchangeRate: p.usdExchangeRate ?? 1.0,
        vatPercent: p.vatPercent ?? 19
      }))
      .catch(() => undefined);
  }, []);

  async function submit(formData: FormData) {
    const response = await fetch(`${API_BASE_URL}/admin/dev/billing/settings`, {
      body: JSON.stringify({
        invoiceBankDetails: String(formData.get("invoiceBankDetails") ?? ""),
        invoiceCompanyAddress: String(formData.get("invoiceCompanyAddress") ?? ""),
        invoiceCompanyCity: String(formData.get("invoiceCompanyCity") ?? ""),
        invoiceCompanyCountry: String(formData.get("invoiceCompanyCountry") ?? "DE"),
        invoiceCompanyEmail: String(formData.get("invoiceCompanyEmail") ?? ""),
        invoiceCompanyName: String(formData.get("invoiceCompanyName") ?? ""),
        invoiceCompanyPhone: String(formData.get("invoiceCompanyPhone") ?? ""),
        invoiceCompanyZip: String(formData.get("invoiceCompanyZip") ?? ""),
        invoiceFooterLine1: String(formData.get("invoiceFooterLine1") ?? ""),
        invoiceFooterLine2: String(formData.get("invoiceFooterLine2") ?? ""),
        invoiceFooterLine3: String(formData.get("invoiceFooterLine3") ?? ""),
        invoicePaymentInstructions: String(formData.get("invoicePaymentInstructions") ?? ""),
        invoiceVatNumber: String(formData.get("invoiceVatNumber") ?? ""),
        siteLogoUrl: s.siteLogoUrl,
        termsUrl: String(formData.get("termsUrl") ?? ""),
        usdBufferCents: Number(formData.get("usdBufferCents") ?? 0),
        usdExchangeRate: Number(formData.get("usdExchangeRate") ?? 1.0),
        vatPercent: Number(formData.get("vatPercent") ?? 19)
      }),
      headers: { "Content-Type": "application/json", ...authHeaders() },
      method: "PATCH"
    });
    setMessage(await notifyResponse(response, "Settings saved.", "Settings failed."));
  }

  return (
    <form action={submit} className={styles.form}>
      <h3>Legal</h3>
      <label>AGB / Terms URL<input value={s.termsUrl} name="termsUrl" placeholder="/de/legal/agb" onChange={(e) => setS({ ...s, termsUrl: e.target.value })} /></label>
      <h3>Currency (USD)</h3>
      <p>Prices are stored in EUR. These settings control the EUR→USD conversion displayed to customers who select USD.</p>
      <label>EUR→USD exchange rate<input min="0.01" step="0.0001" value={s.usdExchangeRate} name="usdExchangeRate" type="number" onChange={(e) => setS({ ...s, usdExchangeRate: Number(e.target.value) })} /></label>
      <label>Buffer (extra cents added to USD price)<input min="0" step="1" value={s.usdBufferCents} name="usdBufferCents" type="number" onChange={(e) => setS({ ...s, usdBufferCents: Number(e.target.value) })} /></label>
      <h3>Invoice branding</h3>
      <label>VAT percent<input min="0" step="0.01" value={s.vatPercent} name="vatPercent" type="number" onChange={(e) => setS({ ...s, vatPercent: Number(e.target.value) })} /></label>
      <ImageUploader
        action={`${API_BASE_URL}/admin/dev/assets/logo`}
        headers={authHeaders()}
        label="Website logo"
        onUploaded={(payload) => setS({ ...s, siteLogoUrl: String(payload.logoUrl ?? "") })}
        previewUrl={s.siteLogoUrl}
      />
      <label>Company name<input value={s.invoiceCompanyName} name="invoiceCompanyName" onChange={(e) => setS({ ...s, invoiceCompanyName: e.target.value })} /></label>
      <label>Company address<input value={s.invoiceCompanyAddress} name="invoiceCompanyAddress" onChange={(e) => setS({ ...s, invoiceCompanyAddress: e.target.value })} /></label>
      <label>ZIP<input value={s.invoiceCompanyZip} name="invoiceCompanyZip" onChange={(e) => setS({ ...s, invoiceCompanyZip: e.target.value })} /></label>
      <label>City<input value={s.invoiceCompanyCity} name="invoiceCompanyCity" onChange={(e) => setS({ ...s, invoiceCompanyCity: e.target.value })} /></label>
      <label>Country<input value={s.invoiceCompanyCountry} name="invoiceCompanyCountry" onChange={(e) => setS({ ...s, invoiceCompanyCountry: e.target.value })} /></label>
      <label>Email<input value={s.invoiceCompanyEmail} name="invoiceCompanyEmail" type="email" onChange={(e) => setS({ ...s, invoiceCompanyEmail: e.target.value })} /></label>
      <label>Phone<input value={s.invoiceCompanyPhone} name="invoiceCompanyPhone" onChange={(e) => setS({ ...s, invoiceCompanyPhone: e.target.value })} /></label>
      <label>USt-IdNr<input value={s.invoiceVatNumber} name="invoiceVatNumber" onChange={(e) => setS({ ...s, invoiceVatNumber: e.target.value })} /></label>
      <label>Invoice footer line 1<input value={s.invoiceFooterLine1} name="invoiceFooterLine1" onChange={(e) => setS({ ...s, invoiceFooterLine1: e.target.value })} /></label>
      <label>Invoice footer line 2<input value={s.invoiceFooterLine2} name="invoiceFooterLine2" onChange={(e) => setS({ ...s, invoiceFooterLine2: e.target.value })} /></label>
      <label>Invoice footer line 3<input value={s.invoiceFooterLine3} name="invoiceFooterLine3" onChange={(e) => setS({ ...s, invoiceFooterLine3: e.target.value })} /></label>
      <label>Payment instructions<textarea value={s.invoicePaymentInstructions} name="invoicePaymentInstructions" rows={3} onChange={(e) => setS({ ...s, invoicePaymentInstructions: e.target.value })} /></label>
      <label>Bank details<textarea value={s.invoiceBankDetails} name="invoiceBankDetails" rows={3} onChange={(e) => setS({ ...s, invoiceBankDetails: e.target.value })} /></label>
      <Button icon={Save} type="submit">Save Settings</Button>
      {message ? <p>{message}</p> : null}
    </form>
  );
}

type Gateway = { config?: Record<string, unknown>; enabled: boolean; method: string; validation?: { message?: string; ok?: boolean } };

export function PaymentGatewayForm() {
  const [gateways, setGateways] = useState<Gateway[]>([]);
  const [saving, setSaving] = useState(false);
  const [results, setResults] = useState<Record<string, { message?: string; ok?: boolean }>>({});

  useEffect(() => {
    void fetch(`${API_BASE_URL}/admin/dev/billing/payment-gateways`, { headers: authHeaders() })
      .then((response) => response.json())
      .then((payload) => setGateways(Array.isArray(payload) ? payload : []))
      .catch(() => undefined);
  }, []);

  async function submit(formData: FormData) {
    setSaving(true);
    const next = gateways.map((gateway) => {
      const enabled = formData.get(`${gateway.method}_enabled`) === "on";
      if (gateway.method === "BANK_TRANSFER") {
        return {
          config: {
            accountHolder: String(formData.get(`${gateway.method}_accountHolder`) ?? ""),
            bankName: String(formData.get(`${gateway.method}_bankName`) ?? ""),
            bic: String(formData.get(`${gateway.method}_bic`) ?? ""),
            iban: String(formData.get(`${gateway.method}_iban`) ?? ""),
            referenceNote: String(formData.get(`${gateway.method}_referenceNote`) ?? "")
          },
          enabled,
          method: gateway.method
        };
      }
      return {
        config: {
          apiKey: String(formData.get(`${gateway.method}_apiKey`) ?? ""),
          clientId: String(formData.get(`${gateway.method}_clientId`) ?? ""),
          clientSecret: String(formData.get(`${gateway.method}_clientSecret`) ?? ""),
          mode: String(formData.get(`${gateway.method}_mode`) ?? "test"),
          provider: gatewayProvider(gateway.method)
        },
        enabled,
        method: gateway.method
      };
    });
    const response = await fetch(`${API_BASE_URL}/admin/dev/billing/payment-gateways`, {
      body: JSON.stringify({ gateways: next }),
      headers: { "Content-Type": "application/json", ...authHeaders() },
      method: "PATCH"
    });

    const payload = await response.clone().json().catch(() => undefined);
    setSaving(false);
    if (response.ok && Array.isArray(payload)) {
      setGateways(payload as Gateway[]);
      const resultMap: Record<string, { message?: string; ok?: boolean }> = {};
      for (const item of payload as Gateway[]) {
        resultMap[item.method] = item.validation ?? { ok: true };
      }
      setResults(resultMap);
      const allOk = Object.values(resultMap).every((r) => r.ok);
      if (allOk) {
        notify.success("Payment gateways saved and verified.");
      } else {
        notify.error("Some gateways could not be verified — check the details.");
      }
      return;
    }
    notifyResponse(response, "Saved.", "Save failed.").catch(() => undefined);
  }

  return (
    <form action={submit} className={styles.form}>
      <p style={{ color: "var(--muted)", fontSize: "0.88rem", margin: 0 }}>
        Enable and configure payment gateways. Credentials are verified on save. Sandbox mode uses test accounts only.
      </p>

      {gateways.map((gateway) => {
        const result = results[gateway.method];
        const verified = gateway.config?.verifiedAt;
        return (
          <fieldset className={styles.gatewayCard} key={gateway.method}>
            <div className={styles.gatewayCardHeader}>
              <label className={styles.gatewayToggle}>
                <input defaultChecked={gateway.enabled} name={`${gateway.method}_enabled`} type="checkbox" />
                <strong>{gatewayTitle(gateway.method)}</strong>
              </label>
              <span className={styles.gatewayBadge}>{gatewayProvider(gateway.method)}</span>
            </div>

            {gateway.method === "SANDBOX" ? (
              <p className={styles.gatewayHint}>Simulated gateway — no real payments. Use to test the checkout and client portal flow.</p>
            ) : gateway.method === "PAYPAL" ? (
              <div className={styles.gatewayFields}>
                <label>
                  Environment
                  <select defaultValue={String(gateway.config?.mode ?? "test")} name={`${gateway.method}_mode`}>
                    <option value="test">Sandbox (test)</option>
                    <option value="live">Live (production)</option>
                  </select>
                </label>
                <label>
                  Client ID
                  <input
                    autoComplete="off"
                    defaultValue={String(gateway.config?.clientId ?? "")}
                    name={`${gateway.method}_clientId`}
                    placeholder="AQriNUWPj..."
                    spellCheck={false}
                  />
                </label>
                <label>
                  Client Secret
                  <input
                    autoComplete="new-password"
                    defaultValue={String(gateway.config?.clientSecret ?? "")}
                    name={`${gateway.method}_clientSecret`}
                    placeholder="EIf2sU-Hg..."
                    type="password"
                  />
                </label>
                <p className={styles.gatewayHint}>
                  PayPal vault is enabled automatically — customers who pay once are saved for future automatic billing via cron.
                </p>
              </div>
            ) : gateway.method === "BANK_TRANSFER" ? (
              <div className={styles.gatewayFields}>
                <label>
                  Account holder name
                  <input
                    defaultValue={String(gateway.config?.accountHolder ?? "")}
                    name={`${gateway.method}_accountHolder`}
                    placeholder="Dezhost GmbH"
                  />
                </label>
                <label>
                  Bank name
                  <input
                    defaultValue={String(gateway.config?.bankName ?? "")}
                    name={`${gateway.method}_bankName`}
                    placeholder="Deutsche Bank"
                  />
                </label>
                <label>
                  IBAN
                  <input
                    defaultValue={String(gateway.config?.iban ?? "")}
                    name={`${gateway.method}_iban`}
                    placeholder="DE89 3704 0044 0532 0130 00"
                    spellCheck={false}
                  />
                </label>
                <label>
                  BIC / SWIFT
                  <input
                    defaultValue={String(gateway.config?.bic ?? "")}
                    name={`${gateway.method}_bic`}
                    placeholder="DEUTDEDB"
                    spellCheck={false}
                  />
                </label>
                <label>
                  Reference instructions (shown to customer)
                  <input
                    defaultValue={String(gateway.config?.referenceNote ?? "")}
                    name={`${gateway.method}_referenceNote`}
                    placeholder="Please include your invoice number as payment reference."
                  />
                </label>
                <p className={styles.gatewayHint}>
                  Manual gateway. The customer sees your bank details, wires the amount, and the admin marks the invoice as paid. A sales ticket is opened if provisioning doesn't complete.
                </p>
              </div>
            ) : (
              <div className={styles.gatewayFields}>
                <label>
                  Mollie API Key
                  <input
                    autoComplete="new-password"
                    defaultValue={String(gateway.config?.apiKey ?? "")}
                    name={`${gateway.method}_apiKey`}
                    placeholder={gateway.config?.mode === "live" ? "live_xxx" : "test_xxx"}
                    type="password"
                  />
                </label>
                <p className={styles.gatewayHint}>Use a <code>test_</code> key for sandbox mode, <code>live_</code> for production. One key covers both Credit Card and SEPA. A Mollie mandate is captured on first payment for automatic future billing.</p>
              </div>
            )}

            {result && (
              <div className={result.ok ? styles.gatewayVerified : styles.gatewayError}>
                {result.ok ? "✓" : "✗"} {result.message ?? (result.ok ? "Verified" : "Verification failed")}
              </div>
            )}
            {!result && verified ? (
              <div className={styles.gatewayVerified}>
                ✓ Last verified {new Date(String(verified)).toLocaleDateString("de-DE")}
              </div>
            ) : null}
          </fieldset>
        );
      })}

      <Button disabled={saving} icon={CreditCard} type="submit">{saving ? "Saving…" : "Save & Verify Gateways"}</Button>
    </form>
  );
}

export function BlogManager() {
  const [editing, setEditing] = useState<ApiBlogPost>();
  const [featureImage, setFeatureImage] = useState("");
  const [message, setMessage] = useState("");
  const [posts, setPosts] = useState<ApiBlogPost[]>([]);

  useEffect(() => {
    void refresh();
  }, []);

  useEffect(() => {
    setFeatureImage(editing?.featureImage ?? editing?.content?.featureImage ?? editing?.content?.images?.[0] ?? "");
  }, [editing]);

  async function refresh() {
    const response = await fetch(`${API_BASE_URL}/cms/admin/dev/posts`, { headers: authHeaders() });
    const payload = await response.json().catch(() => []);
    setPosts(Array.isArray(payload) ? payload : []);
  }

  async function submit(formData: FormData) {
    const title = String(formData.get("title") ?? "");
    const body = String(formData.get("content") ?? "");
    const uploadedImage = String(formData.get("featureImage") ?? "").trim();
    const content = {
      body,
      category: String(formData.get("category") ?? "").trim(),
      featureImage: uploadedImage,
      images: uploadedImage ? [uploadedImage] : [],
      postType: "manual",
      published: formData.get("published") === "on",
      tags: splitComma(formData.get("tags"))
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

    setMessage(await notifyResponse(response, "Blog article saved.", "Blog article failed."));
    if (response.ok) {
      setEditing(undefined);
      await refresh();
    }
  }

  async function remove(post: ApiBlogPost) {
    const response = await fetch(`${API_BASE_URL}/cms/pages/${post.id}`, { headers: authHeaders(), method: "DELETE" });
    setMessage(await notifyResponse(response, "Blog article deleted.", "Delete failed."));
    if (response.ok) {
      await refresh();
    }
  }

  const categories = Array.from(new Set(posts.map((post) => post.category ?? post.content?.category).filter(Boolean) as string[])).sort((a, b) => a.localeCompare(b));

  return (
    <div className={styles.form}>
      <div className={styles.blogList}>
        {posts.length ? posts.map((post) => (
          <article key={post.id}>
            <div>
              <a href={`/${post.locale}/blog/${post.slug}`}><strong>{post.title}</strong></a>
              <span>{post.locale} / {post.slug} / {post.category ?? post.content?.category ?? "uncategorized"} / {post.publishedAt ? "published" : "draft"}</span>
              {(post.tags ?? post.content?.tags ?? []).length ? <small>{(post.tags ?? post.content?.tags ?? []).join(", ")}</small> : null}
            </div>
            <Button type="button" variant="secondary" onClick={() => setEditing(post)}>Edit</Button>
            <Button type="button" variant="ghost" onClick={() => remove(post)}>Delete</Button>
          </article>
        )) : <p>No blog posts yet.</p>}
      </div>
      <form action={submit} className={styles.form} key={editing?.id ?? "new-blog"}>
        <label>Title<input defaultValue={editing?.title ?? ""} name="title" required /></label>
        <label>Slug<input defaultValue={editing?.slug ?? ""} name="slug" placeholder="managed-hosting-security" /></label>
        <label>Locale<select defaultValue={editing?.locale ?? "de"} name="locale"><option value="de">German</option><option value="en">English</option></select></label>
        <ImageUploader
          accept="image/png,image/jpeg,image/webp"
          action={`${API_BASE_URL}/cms/admin/dev/blog-assets`}
          headers={authHeaders()}
          label="Feature photo"
          onUploaded={(payload) => setFeatureImage(String(payload.imageUrl ?? ""))}
          previewUrl={featureImage}
        />
        <label>Feature photo URL<input name="featureImage" onChange={(event) => setFeatureImage(event.target.value)} required value={featureImage} /></label>
        <label>Category<input defaultValue={editing?.category ?? editing?.content?.category ?? ""} list="blog-categories" name="category" placeholder="Hosting" required /></label>
        <datalist id="blog-categories">
          {categories.map((category) => <option key={category} value={category} />)}
        </datalist>
        <label>Tags<input defaultValue={(editing?.tags ?? editing?.content?.tags ?? editing?.content?.keywords ?? []).join(", ")} name="tags" placeholder="hosting, email, security" /></label>
        <label><input defaultChecked={Boolean(editing?.publishedAt ?? editing?.content?.published)} name="published" type="checkbox" /> Published</label>
        <label>Excerpt<input defaultValue={editing?.excerpt ?? ""} name="excerpt" /></label>
        <RichTextEditor initialValue={editing?.content?.body ?? ""} />
        <Button icon={Save} type="submit">{editing ? "Update Article" : "Create Article"}</Button>
        {editing ? <Button type="button" variant="secondary" onClick={() => setEditing(undefined)}>New Post</Button> : null}
        {message ? <p>{message}</p> : null}
      </form>
    </div>
  );
}

function RichTextEditor({ initialValue }: { initialValue: string }) {
  const [value, setValue] = useState(initialValue);
  const editor = useEditor({
    content: initialValue || "",
    editorProps: {
      attributes: {
        class: styles.editor ?? "",
        dir: "ltr",
        lang: "de"
      }
    },
    extensions: [
      StarterKit.configure({
        heading: { levels: [2, 3] }
      }),
      LinkExtension.configure({
        autolink: true,
        defaultProtocol: "https",
        openOnClick: false
      }),
      Placeholder.configure({
        placeholder: "Write the blog article here."
      })
    ],
    immediatelyRender: false,
    onUpdate: ({ editor: currentEditor }) => setValue(currentEditor.getHTML())
  });

  useEffect(() => {
    setValue(initialValue);
    if (editor && editor.getHTML() !== initialValue) {
      editor.commands.setContent(initialValue || "", { emitUpdate: false });
    }
  }, [editor, initialValue]);

  function setLink() {
    if (!editor) {
      return;
    }
    const current = editor.getAttributes("link").href as string | undefined;
    const url = window.prompt("Link URL", current ?? "https://");
    if (url === null) {
      return;
    }
    if (!url.trim()) {
      editor.chain().focus().extendMarkRange("link").unsetLink().run();
      return;
    }
    editor.chain().focus().extendMarkRange("link").setLink({ href: url.trim() }).run();
  }

  return (
    <label>
      Content
      <input name="content" type="hidden" value={value} />
      <div className={styles.editorShell}>
        <div className={styles.editorToolbar}>
          <button aria-label="Heading" className={editor?.isActive("heading", { level: 2 }) ? styles.activeTool : ""} type="button" onClick={() => editor?.chain().focus().toggleHeading({ level: 2 }).run()}><Heading2 size={16} /></button>
          <button aria-label="Bold" className={editor?.isActive("bold") ? styles.activeTool : ""} type="button" onClick={() => editor?.chain().focus().toggleBold().run()}><Bold size={16} /></button>
          <button aria-label="Italic" className={editor?.isActive("italic") ? styles.activeTool : ""} type="button" onClick={() => editor?.chain().focus().toggleItalic().run()}><Italic size={16} /></button>
          <button aria-label="Bullet list" className={editor?.isActive("bulletList") ? styles.activeTool : ""} type="button" onClick={() => editor?.chain().focus().toggleBulletList().run()}><List size={16} /></button>
          <button aria-label="Link" className={editor?.isActive("link") ? styles.activeTool : ""} type="button" onClick={setLink}><LinkIcon size={16} /></button>
          <button aria-label="Undo" type="button" onClick={() => editor?.chain().focus().undo().run()}><Undo2 size={16} /></button>
          <button aria-label="Redo" type="button" onClick={() => editor?.chain().focus().redo().run()}><Redo2 size={16} /></button>
        </div>
        <EditorContent dir="ltr" editor={editor} />
      </div>
    </label>
  );
}

export function DomainPriceForm() {
  const [message, setMessage] = useState("");

  async function submit(formData: FormData) {
    const amount = String(formData.get("amount") ?? "").trim();
    const amountCents = amount ? Math.round(Number(amount) * 100) : undefined;
    const response = await fetch(`${API_BASE_URL}/orders/admin/domain-prices`, {
      body: JSON.stringify({
        action: String(formData.get("action") ?? "register"),
        ...(amountCents === undefined ? {} : { amountCents }),
        manual: amountCents === undefined ? false : formData.get("manual") === "on",
        suggested: formData.get("suggested") === "on",
        tld: String(formData.get("tld") ?? ""),
        years: Number(formData.get("years") ?? 1)
      }),
      headers: { "Content-Type": "application/json", ...authHeaders() },
      method: "POST"
    });

    setMessage(await notifyResponse(response, "Domain price saved.", "Domain price failed."));
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
      <label>Price EUR<input name="amount" placeholder="blank = Resell.biz price" step="0.01" type="number" /></label>
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

    setMessage(await notifyResponse(response, "Order status saved.", "Order status failed."));
  }

  return (
    <form action={submit} className={styles.inlineForm}>
      <select name="status" value={value} onChange={(event) => setValue(event.target.value)}>
        <option value="completed">completed</option>
        <option value="pending">Pending</option>
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
  return "pending";
}

function gatewayTitle(method: string) {
  return {
    CREDIT_CARD: "Credit/debit card",
    PAYPAL: "Paypal",
    SEPA: "SEPA Lastschrift"
  }[method] ?? method;
}

function gatewayProvider(method: string) {
  if (method === "SANDBOX") {
    return "sandbox";
  }
  return method === "PAYPAL" ? "paypal" : ["CREDIT_CARD", "SEPA"].includes(method) ? "mollie" : "sandbox";
}

export function NewOrderForm({ clients, locale, preselectedClientId, products, vatPercent = 19 }: { clients: ApiClient[]; locale: Locale; preselectedClientId?: string; products: ApiProduct[]; vatPercent?: number }) {
  const [message, setMessage] = useState("");
  const [selectedProductId, setSelectedProductId] = useState(products.find((p) => p.type !== "DOMAIN")?.id ?? products[0]?.id ?? "");
  const [selectedPriceId, setSelectedPriceId] = useState(products.find((p) => p.type !== "DOMAIN")?.prices[0]?.id ?? "");
  const [selectedClientId, setSelectedClientId] = useState(preselectedClientId ?? "");
  const [useCustomPricing, setUseCustomPricing] = useState(false);
  const [customAmountEur, setCustomAmountEur] = useState<number>(0);
  const [customBillingCycle, setCustomBillingCycle] = useState("MONTHLY");
  const [discountType, setDiscountType] = useState<"none" | "one-time" | "recurring">("none");
  const [discountAmountEur, setDiscountAmountEur] = useState<number>(0);
  const [addDomain, setAddDomain] = useState(false);
  const [domainNameInput, setDomainNameInput] = useState("");
  const [domainPriceLookup, setDomainPriceLookup] = useState<Map<string, number>>(new Map());
  const [domainPriceLoading, setDomainPriceLoading] = useState(false);
  const defaultDomainProduct = products.find((p) => p.type === "DOMAIN");

  useEffect(() => {
    fetch(`${API_BASE_URL}/orders/admin/domain-prices`, { headers: authHeaders() })
      .then((r) => r.json())
      .then((data: Array<{ action: string; amountCents: number; tld: string; years: number }>) => {
        if (Array.isArray(data)) {
          const map = new Map<string, number>();
          for (const row of data) {
            if (row.action === "register" && row.years === 1 && row.amountCents > 0) {
              map.set(row.tld.toLowerCase(), row.amountCents);
            }
          }
          setDomainPriceLookup(map);
        }
      })
      .catch(() => undefined);
  }, []);

  const selectedProduct = products.find((p) => p.id === selectedProductId);
  const selectedPrice = selectedProduct?.prices.find((p) => p.id === selectedPriceId) ?? selectedProduct?.prices[0];
  const selectedClient = clients.find((c) => c.id === selectedClientId);

  // Compute preview values
  const baseAmountCents = useCustomPricing ? Math.round(customAmountEur * 100) : (selectedPrice?.amountCents ?? 0);
  const billingCycle = useCustomPricing ? customBillingCycle : (selectedPrice?.billingCycle ?? "MONTHLY");
  const vatRate = vatPercent;
  const vatCents = Math.round(baseAmountCents * vatRate / 100);
  const subtotalCents = baseAmountCents;
  const discountCents = discountType !== "none" ? Math.round(discountAmountEur * 100) : 0;
  const domainTld = addDomain && domainNameInput.includes(".") ? domainNameInput.split(".").slice(1).join(".").toLowerCase() : "";
  const domainPriceCents = domainTld ? (domainPriceLookup.get(domainTld) ?? null) : null;
  const totalCents = subtotalCents + vatCents + (domainPriceCents ?? 0) - discountCents;

  async function submit(formData: FormData) {
    const clientId = String(formData.get("userId") ?? "");
    const productId = String(formData.get("productId") ?? "");
    const product = products.find((p) => p.id === productId);
    const priceId = String(formData.get("productPriceId") ?? product?.prices[0]?.id ?? "");
    const addDomain = formData.get("addDomain") === "on" && defaultDomainProduct;
    const placedAt = String(formData.get("placedAt") ?? "");
    const firstDueAt = String(formData.get("firstDueAt") ?? "");
    const customPricingOn = formData.get("useCustomPricing") === "on";
    const items: Array<Record<string, unknown>> = [{
      configuration: { domainName: String(formData.get("domainName") ?? "") },
      productId,
      productPriceId: customPricingOn ? undefined : priceId,
      quantity: 1,
      ...(customPricingOn ? {
        customAmountCents: Math.round(Number(formData.get("customAmountEur") ?? 0) * 100),
        customBillingCycle: String(formData.get("customBillingCycle") ?? "MONTHLY"),
        applyCustomToRenewals: formData.get("applyToRenewals") === "on"
      } : {})
    }];
    if (addDomain) {
      items.push({
        configuration: { domainAction: String(formData.get("domainAction") ?? "register") },
        domainName: String(formData.get("domainName") ?? ""),
        productId: defaultDomainProduct.id,
        productPriceId: defaultDomainProduct.prices[0]?.id,
        quantity: 1
      });
    }
    const response = await fetch(`${API_BASE_URL}/orders/admin`, {
      body: JSON.stringify({
        firstDueAt: firstDueAt ? new Date(firstDueAt).toISOString() : undefined,
        items,
        notes: String(formData.get("notes") ?? ""),
        placedAt: placedAt ? new Date(placedAt).toISOString() : undefined,
        runModules: formData.get("runModules") === "on",
        skipEmail: formData.get("skipEmail") === "on",
        userId: clientId
      }),
      headers: { "Content-Type": "application/json", ...authHeaders() },
      method: "POST"
    });
    if (response.ok) {
      notify.success("Order created.");
      window.location.assign("/admin/orders");
      return;
    }
    setMessage(await notifyResponse(response, "Order created.", "Order creation failed."));
  }

  return (
    <form action={submit} className={styles.form}>
      <div className={styles.newOrderLayout}>
        <div className={styles.formGrid}>
          <label className={styles.formSpan2}>
            Client
            <select defaultValue={preselectedClientId ?? ""} name="userId" required onChange={(e) => setSelectedClientId(e.target.value)}>
              <option value="">— select client —</option>
              {clients.map((client) => (
                <option key={client.id} value={client.id}>{client.name} ({client.email})</option>
              ))}
            </select>
          </label>
          <label className={styles.formSpan2}>
            Product
            <select name="productId" value={selectedProductId} onChange={(e) => {
              setSelectedProductId(e.target.value);
              const p = products.find((prod) => prod.id === e.target.value);
              setSelectedPriceId(p?.prices[0]?.id ?? "");
            }}>
              {products.filter((p) => p.type !== "DOMAIN").map((product) => (
                <option key={product.id} value={product.id}>{product.name}</option>
              ))}
            </select>
          </label>

          <label className={styles.formSpan2}>
            <span><input checked={useCustomPricing} name="useCustomPricing" type="checkbox" onChange={(e) => setUseCustomPricing(e.target.checked)} /> Use custom pricing (override product price)</span>
          </label>

          {!useCustomPricing ? (
            <label className={styles.formSpan2}>
              Pricing Plan
              <select name="productPriceId" value={selectedPriceId} onChange={(e) => setSelectedPriceId(e.target.value)}>
                {selectedProduct?.prices.map((price) => (
                  <option key={price.id} value={price.id}>
                    {cycleLabel(price.billingCycle, locale)} — {money(price.amountCents, price.currency, locale)}
                  </option>
                ))}
              </select>
            </label>
          ) : (
            <>
              <label>
                Custom price (EUR, excl. VAT)
                <input min="0" name="customAmountEur" placeholder="0.00" step="0.01" type="number" value={customAmountEur || ""} onChange={(e) => setCustomAmountEur(Number(e.target.value) || 0)} />
              </label>
              <label>
                Billing cycle
                <select name="customBillingCycle" value={customBillingCycle} onChange={(e) => setCustomBillingCycle(e.target.value)}>
                  {["MONTHLY", "QUARTERLY", "SEMI_ANNUAL", "YEAR_1", "ONE_TIME"].map((c) => (
                    <option key={c} value={c}>{cycleLabel(c, locale)}</option>
                  ))}
                </select>
              </label>
              <label className={styles.formSpan2}>
                <span><input defaultChecked name="applyToRenewals" type="checkbox" /> Apply custom price to all future renewal invoices</span>
              </label>
            </>
          )}

          <label>
            Domain Name
            <input name="domainName" placeholder="example.com" value={domainNameInput} onChange={(e) => setDomainNameInput(e.target.value)} />
          </label>
          <label>
            Domain Action
            <select name="domainAction">
              <option value="register">Register</option>
              <option value="transfer">Transfer</option>
            </select>
          </label>

          <label className={styles.formSpan2}>
            Order Date
            <input defaultValue={datetimeLocal(new Date().toISOString())} name="placedAt" type="datetime-local" />
          </label>
          <label className={styles.formSpan2}>
            First Invoice Due Date
            <input name="firstDueAt" type="date" defaultValue={new Date(Date.now() + 7 * 86400_000).toISOString().slice(0, 10)} />
          </label>

          <label className={styles.formSpan2}>
            Discount
            <select name="discountType" value={discountType} onChange={(e) => setDiscountType(e.target.value as "none" | "one-time" | "recurring")}>
              <option value="none">No discount</option>
              <option value="one-time">One-time discount (first invoice only)</option>
              <option value="recurring">Recurring discount (all invoices)</option>
            </select>
          </label>
          {discountType !== "none" ? (
            <label className={styles.formSpan2}>
              Discount amount (EUR)
              <input min="0" name="discountAmountEur" placeholder="0.00" step="0.01" type="number" value={discountAmountEur || ""} onChange={(e) => setDiscountAmountEur(Number(e.target.value) || 0)} />
            </label>
          ) : null}

          <label className={styles.formSpan2}>
            <span><input checked={addDomain} name="addDomain" type="checkbox" onChange={(e) => setAddDomain(e.target.checked)} /> Add domain item to this order</span>
          </label>
          <label className={styles.formSpan2}>
            Notes (internal)
            <textarea name="notes" rows={2} placeholder="Admin notes for this order..." />
          </label>
          <label className={styles.formSpan2}>
            <span><input name="skipEmail" type="checkbox" /> Disable new order email for this client</span>
          </label>
          <label className={styles.formSpan2}>
            <span><input name="runModules" type="checkbox" /> Run active modules upon order create (provisions services immediately)</span>
          </label>
        </div>

        {/* Order preview */}
        <div className={styles.orderPreview}>
          <h3>Order Preview</h3>
          {selectedClient ? <p className={styles.orderPreviewClient}>{selectedClient.name}<br /><span>{selectedClient.email}</span></p> : <p className={styles.orderPreviewClient}>No client selected</p>}
          {selectedProduct ? (
            <div className={styles.orderPreviewLines}>
              <div className={styles.orderPreviewRow}>
                <span>{selectedProduct.name}</span>
                <span>{cycleLabel(billingCycle, locale)}</span>
              </div>
              <div className={styles.orderPreviewRow}>
                <span>Base price</span>
                <strong>{money(baseAmountCents, "EUR", locale)}</strong>
              </div>
              {vatPercent > 0 ? <div className={styles.orderPreviewRow}><span>VAT ({vatPercent}%)</span><span>{money(vatCents, "EUR", locale)}</span></div> : null}
              {addDomain ? (
                <div className={styles.orderPreviewRow}>
                  <span>Domain (.{domainTld || "?"})</span>
                  {domainPriceLoading ? (
                    <span style={{ color: "var(--muted)", fontSize: "0.82rem" }}>…</span>
                  ) : domainPriceCents !== null ? (
                    <strong>{money(domainPriceCents, "EUR", locale)}</strong>
                  ) : (
                    <span style={{ color: "var(--muted)", fontSize: "0.82rem" }}>{domainTld ? "price unknown" : "enter domain"}</span>
                  )}
                </div>
              ) : null}
              {discountCents > 0 ? (
                <div className={styles.orderPreviewRow}>
                  <span>Discount {discountType === "recurring" ? "(recurring)" : "(once)"}</span>
                  <span>− {money(discountCents, "EUR", locale)}</span>
                </div>
              ) : null}
              <hr style={{ border: "none", borderTop: "1px solid var(--border)", margin: "6px 0" }} />
              <div className={styles.orderPreviewTotal}>
                <span>First invoice total</span>
                <strong>{money(Math.max(0, totalCents), "EUR", locale)}</strong>
              </div>
              {billingCycle !== "ONE_TIME" ? (
                <div className={styles.orderPreviewRenewal}>
                  <span>Next renewal</span>
                  <span>{money(subtotalCents + vatCents - (discountType === "recurring" ? discountCents : 0), "EUR", locale)} / {cycleLabel(billingCycle, locale)}</span>
                </div>
              ) : null}
            </div>
          ) : <p style={{ color: "var(--muted)", fontSize: "0.88rem" }}>Select a product to see preview</p>}
        </div>
      </div>

      <div className={styles.formActions}>
        <Button icon={Package} type="submit">Create Order</Button>
      </div>
      {message ? <p className={styles.formMessage}>{message}</p> : null}
    </form>
  );
}

export function AdminPdfDownloadButton({ invoiceId, invoiceNumber }: { invoiceId: string; invoiceNumber: string }) {
  async function download() {
    const response = await fetch(`${API_BASE_URL}/billing/invoices/${invoiceId}/pdf`, { headers: authHeaders() });
    if (!response.ok) {
      notify.error("PDF download failed.");
      return;
    }
    const blob = await response.blob();
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `invoice-${invoiceNumber}.pdf`;
    link.click();
    URL.revokeObjectURL(url);
    notify.success("PDF ready.");
  }
  return <Button type="button" variant="secondary" onClick={download}>Download PDF</Button>;
}

type LineItem = { id: number };

export function AdminClientActions({ client }: { client: ApiClient }) {
  const [open, setOpen] = useState<"profile" | "password" | "invoice" | "welcome-email" | "send-email" | null>(null);
  const [lines, setLines] = useState<LineItem[]>([{ id: 0 }]);
  const [profileMsg, setProfileMsg] = useState("");
  const [pwMsg, setPwMsg] = useState("");
  const [invoiceMsg, setInvoiceMsg] = useState("");
  const [emailMsg, setEmailMsg] = useState("");
  const [emailEvents, setEmailEvents] = useState<Array<{ key: string; subject: string }>>([]);
  const [selectedEventKey, setSelectedEventKey] = useState("welcome");
  const [customSubject, setCustomSubject] = useState("");
  const [customBody, setCustomBody] = useState("");
  const contact = client.contacts?.[0];
  const address = contact?.address ?? {};

  function closeModal() {
    setOpen(null);
    setProfileMsg("");
    setPwMsg("");
    setInvoiceMsg("");
    setEmailMsg("");
  }

  async function openSendEmail() {
    const response = await fetch(`${API_BASE_URL}/admin/dev/emails`, { headers: authHeaders() });
    if (response.ok) {
      const payload = await response.json().catch(() => ({}));
      const events: Array<{ key: string; subject: string }> = Array.isArray(payload.events) ? payload.events : [];
      setEmailEvents(events);
      if (events.length && !selectedEventKey && events[0]) setSelectedEventKey(events[0].key);
    }
    setOpen("send-email");
  }

  async function sendEventEmail() {
    const response = await fetch(`${API_BASE_URL}/admin/dev/emails/users/${client.id}/send-event`, {
      body: JSON.stringify({ eventKey: selectedEventKey }),
      headers: { "Content-Type": "application/json", ...authHeaders() },
      method: "POST"
    });
    const msg = await notifyResponse(response, "Email sent.", "Email send failed.");
    setEmailMsg(msg);
    if (response.ok) closeModal();
  }

  async function sendCustomEmail() {
    if (!customSubject.trim() || !customBody.trim()) {
      setEmailMsg("Subject and body are required.");
      return;
    }
    const response = await fetch(`${API_BASE_URL}/admin/dev/emails/users/${client.id}/send-custom`, {
      body: JSON.stringify({ body: customBody, subject: customSubject }),
      headers: { "Content-Type": "application/json", ...authHeaders() },
      method: "POST"
    });
    const msg = await notifyResponse(response, "Email sent.", "Email send failed.");
    setEmailMsg(msg);
    if (response.ok) closeModal();
  }

  async function sendWelcomeEmail() {
    const response = await fetch(`${API_BASE_URL}/admin/dev/emails/users/${client.id}/send-event`, {
      body: JSON.stringify({ eventKey: "welcome" }),
      headers: { "Content-Type": "application/json", ...authHeaders() },
      method: "POST"
    });
    const msg = await notifyResponse(response, "Welcome email sent.", "Welcome email failed.");
    setEmailMsg(msg);
    if (response.ok) closeModal();
  }

  async function saveProfile(formData: FormData) {
    const response = await fetch(`${API_BASE_URL}/users/${client.id}`, {
      body: JSON.stringify({
        address: {
          city: String(formData.get("city") ?? ""),
          line1: String(formData.get("address") ?? ""),
          postalCode: String(formData.get("postalCode") ?? ""),
          state: String(formData.get("state") ?? "")
        },
        countryCode: String(formData.get("countryCode") ?? "DE"),
        customerType: String(formData.get("customerType") ?? "INDIVIDUAL"),
        email: String(formData.get("email") ?? ""),
        name: String(formData.get("name") ?? ""),
        phone: String(formData.get("phone") ?? ""),
        vatId: String(formData.get("vatId") ?? "") || null
      }),
      headers: { "Content-Type": "application/json", ...authHeaders() },
      method: "PATCH"
    });
    const msg = await notifyResponse(response, "Profile saved.", "Profile save failed.");
    setProfileMsg(msg);
    if (response.ok) closeModal();
  }

  async function changePassword(formData: FormData) {
    const newPassword = String(formData.get("newPassword") ?? "");
    const confirmPassword = String(formData.get("confirmPassword") ?? "");
    if (newPassword !== confirmPassword) {
      setPwMsg("Passwords do not match.");
      return;
    }
    const response = await fetch(`${API_BASE_URL}/users/${client.id}`, {
      body: JSON.stringify({ newPassword }),
      headers: { "Content-Type": "application/json", ...authHeaders() },
      method: "PATCH"
    });
    const msg = await notifyResponse(response, "Password changed.", "Password change failed.");
    setPwMsg(msg);
    if (response.ok) closeModal();
  }

  async function createInvoice(formData: FormData) {
    const descriptions = formData.getAll("description").map(String).filter(Boolean);
    const invoiceLines = descriptions.map((description, index) => ({
      billingCycle: String(formData.getAll("billingCycle")[index] ?? "ONE_TIME"),
      description,
      quantity: Number(formData.getAll("quantity")[index] ?? 1),
      type: "CUSTOM",
      unitAmountCents: Math.round(Number(formData.getAll("amount")[index] ?? 0) * 100),
      vatRate: Number(formData.getAll("vatRate")[index] ?? 19)
    }));
    const dueAtStr = String(formData.get("dueAt") ?? "");
    const response = await fetch(`${API_BASE_URL}/billing/invoices`, {
      body: JSON.stringify({
        buyerCountryCode: client.countryCode ?? "DE",
        buyerVatId: client.vatId ?? undefined,
        customerSnapshot: { address, countryCode: client.countryCode, customerNumber: client.customerNumber, customerType: client.customerType, email: client.email, name: client.name, phone: contact?.phone, vatId: client.vatId },
        dueAt: dueAtStr ? new Date(dueAtStr).toISOString() : new Date(Date.now() + 7 * 86400_000).toISOString(),
        isBusinessCustomer: client.customerType === "BUSINESS",
        lines: invoiceLines,
        status: "UNPAID",
        userId: client.id
      }),
      headers: { "Content-Type": "application/json", ...authHeaders() },
      method: "POST"
    });
    if (response.ok) {
      notify.success("Invoice created.");
      window.location.reload();
      return;
    }
    setInvoiceMsg(await notifyResponse(response, "Invoice created.", "Invoice creation failed."));
  }

  async function handleDelete() {
    const confirmed = window.confirm(
      `Are you sure you want to delete client "${client.name}"?\n\n` +
      `WARNING: All invoices for this client will also be permanently deleted.\n` +
      `Please make sure to download and back up any invoice data before proceeding.\n\n` +
      `This action cannot be undone.`
    );
    if (!confirmed) return;
    const response = await fetch(`${API_BASE_URL}/users/${client.id}`, { headers: authHeaders(), method: "DELETE" });
    if (response.ok) {
      notify.success("Client deleted.");
      window.location.assign("/admin/clients");
    } else {
      notify.error("Client delete failed.");
    }
  }

  return (
    <>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <Button type="button" onClick={() => setOpen("profile")}>Edit Profile</Button>
        <Button type="button" variant="secondary" onClick={() => setOpen("password")}>Change Password</Button>
        <Button type="button" variant="secondary" onClick={() => setOpen("invoice")}>Create Invoice</Button>
        <Button type="button" variant="secondary" onClick={sendWelcomeEmail}>Send Welcome Email</Button>
        <Button type="button" variant="secondary" onClick={openSendEmail}>Send Email</Button>
        <Button icon={Trash2} type="button" variant="ghost" onClick={handleDelete}>Delete Client</Button>
      </div>

      {open ? (
        <div className={styles.modalBackdrop} onClick={(e) => e.target === e.currentTarget && closeModal()}>
          <div className={styles.modal}>
            <div className={styles.modalHead}>
              <strong>
                {open === "profile" ? "Edit Profile" : open === "password" ? "Change Password" : open === "invoice" ? "Create Invoice" : open === "welcome-email" ? "Send Welcome Email" : "Send Email"}
              </strong>
              <button className={styles.modalClose} type="button" onClick={closeModal}>✕</button>
            </div>

            {open === "profile" ? (
              <form action={saveProfile} className={styles.form}>
                <div className={styles.formGrid}>
                  <label>Name<input defaultValue={client.name} name="name" required /></label>
                  <label>Email<input defaultValue={client.email} name="email" required type="email" /></label>
                  <label>Customer type
                    <select defaultValue={client.customerType} name="customerType">
                      <option value="INDIVIDUAL">Individual</option>
                      <option value="BUSINESS">Business</option>
                    </select>
                  </label>
                  <label>Country<input defaultValue={client.countryCode ?? "DE"} name="countryCode" /></label>
                  <label>VAT ID<input defaultValue={client.vatId ?? ""} name="vatId" /></label>
                  <label>Phone<input defaultValue={contact?.phone ?? ""} name="phone" /></label>
                  <label>Address<input defaultValue={address.line1 ?? ""} name="address" /></label>
                  <label>ZIP<input defaultValue={address.postalCode ?? ""} name="postalCode" /></label>
                  <label>City<input defaultValue={address.city ?? ""} name="city" /></label>
                  <label className={styles.formSpan2}>State / Region<input defaultValue={address.state ?? ""} name="state" /></label>
                </div>
                <div className={styles.formActions}>
                  <Button icon={Save} type="submit">Save Profile</Button>
                  <Button type="button" variant="secondary" onClick={closeModal}>Cancel</Button>
                </div>
                {profileMsg ? <p className={styles.formMessage}>{profileMsg}</p> : null}
              </form>
            ) : null}

            {open === "password" ? (
              <form action={changePassword} className={styles.form}>
                <div className={styles.formGrid}>
                  <label>New password<input name="newPassword" required type="password" placeholder="New password" /></label>
                  <label>Confirm password<input name="confirmPassword" required type="password" placeholder="Confirm password" /></label>
                </div>
                <div className={styles.formActions}>
                  <Button icon={Save} type="submit">Set Password</Button>
                  <Button type="button" variant="secondary" onClick={closeModal}>Cancel</Button>
                </div>
                {pwMsg ? <p className={styles.formMessage}>{pwMsg}</p> : null}
              </form>
            ) : null}

            {open === "invoice" ? (
              <form action={createInvoice} className={styles.form}>
                <div className={styles.formGrid}>
                  <label className={styles.formSpan2}>
                    Due date
                    <input name="dueAt" type="date" defaultValue={new Date(Date.now() + 7 * 86400_000).toISOString().slice(0, 10)} />
                  </label>
                </div>
                {lines.map((line, index) => (
                  <fieldset className={`${styles.lineEditor} ${styles.formSpan2}`} key={line.id}>
                    <legend>Line {index + 1}</legend>
                    <div className={styles.formGrid}>
                      <label className={styles.formSpan2}>Description<input defaultValue={index === 0 ? "Manual service" : ""} name="description" required /></label>
                      <label>Billing cycle
                        <select defaultValue="ONE_TIME" name="billingCycle">
                          <option value="ONE_TIME">One time</option>
                          <option value="MONTHLY">Monthly</option>
                          <option value="YEAR_1">Annually</option>
                        </select>
                      </label>
                      <label>Quantity<input defaultValue="1" min="1" name="quantity" type="number" /></label>
                      <label>Amount EUR<input defaultValue="0" min="0" name="amount" step="0.01" type="number" /></label>
                      <label>VAT rate %<input defaultValue="19" min="0" name="vatRate" step="0.01" type="number" /></label>
                    </div>
                  </fieldset>
                ))}
                <button
                  className={styles.addLineLink}
                  type="button"
                  onClick={() => setLines((prev) => [...prev, { id: Date.now() }])}
                >
                  + Add another line
                </button>
                <div className={styles.formActions}>
                  <Button icon={FileText} type="submit">Create Invoice</Button>
                  <Button type="button" variant="secondary" onClick={closeModal}>Cancel</Button>
                </div>
                {invoiceMsg ? <p className={styles.formMessage}>{invoiceMsg}</p> : null}
              </form>
            ) : null}

            {open === "send-email" ? (
              <div className={styles.form}>
                <div className={styles.formGrid}>
                  <label className={styles.formSpan2}>
                    Template
                    <select value={selectedEventKey} onChange={(e) => {
                      const key = e.target.value;
                      setSelectedEventKey(key);
                      const event = emailEvents.find((ev) => ev.key === key);
                      if (event) setCustomSubject(event.subject);
                    }}>
                      {emailEvents.map((ev) => <option key={ev.key} value={ev.key}>{ev.key} — {ev.subject}</option>)}
                      {emailEvents.length === 0 && <option value="">Loading…</option>}
                    </select>
                  </label>
                  <label className={styles.formSpan2}>
                    Subject
                    <input value={customSubject} onChange={(e) => setCustomSubject(e.target.value)} placeholder="Subject line" />
                  </label>
                  <label className={styles.formSpan2}>
                    Body (HTML allowed)
                    <textarea value={customBody} onChange={(e) => setCustomBody(e.target.value)} rows={8} placeholder="Write your message here…" />
                  </label>
                </div>
                <div className={styles.formActions}>
                  <Button type="button" onClick={sendEventEmail}>Send Using Template</Button>
                  <Button type="button" variant="secondary" onClick={sendCustomEmail}>Send Custom (above subject+body)</Button>
                  <Button type="button" variant="secondary" onClick={closeModal}>Cancel</Button>
                </div>
                {emailMsg ? <p className={styles.formMessage}>{emailMsg}</p> : null}
              </div>
            ) : null}
          </div>
        </div>
      ) : null}
    </>
  );
}

function splitComma(value: FormDataEntryValue | null) {
  return String(value ?? "").split(",").map((item) => item.trim()).filter(Boolean);
}

function splitLines(value: FormDataEntryValue | null) {
  return String(value ?? "").split(/\r?\n/).map((item) => item.trim()).filter(Boolean);
}

function datetimeLocal(value?: string | null) {
  const date = value ? new Date(value) : new Date();
  return new Date(date.getTime() - date.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
}

function dateTimeLabel(value?: string | null) {
  return value ? new Intl.DateTimeFormat("de-DE", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value)) : "-";
}

function slugify(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

// ── Admin Management Panel ────────────────────────────────────────────────────

type AdminUser = {
  createdAt: string;
  email: string;
  id: string;
  name: string;
  userRoles: Array<{ role: { slug: string; name: string } }>;
};

const ADMIN_ROLES = [
  { slug: "super_admin", name: "Super Admin", description: "Full access including settings" },
  { slug: "support_agent", name: "Support Agent", description: "Support & abuse tickets, all client data" },
  { slug: "sales_agent", name: "Sales Agent", description: "Sales tickets, all client data" }
];

function adminRoleLabel(user: AdminUser) {
  const adminSlugs = ["admin", "super_admin", "support_agent", "sales_agent"];
  const role = user.userRoles.find((ur) => adminSlugs.includes(ur.role.slug));
  return role?.role.name ?? role?.role.slug ?? "Unknown";
}

export function AdminsPanel() {
  const [admins, setAdmins] = useState<AdminUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [editRole, setEditRole] = useState("");
  const [editPassword, setEditPassword] = useState("");

  async function reload() {
    setLoading(true);
    const res = await fetch(`${API_BASE_URL}/admin/dev/admins`, { headers: authHeaders("admin") });
    if (res.ok) {
      const data = await res.json() as AdminUser[];
      setAdmins(data);
    }
    setLoading(false);
  }

  useEffect(() => { void reload(); }, []);

  async function createAdmin(formData: FormData) {
    const res = await fetch(`${API_BASE_URL}/admin/dev/admins`, {
      method: "POST",
      headers: { ...authHeaders("admin"), "Content-Type": "application/json" },
      body: JSON.stringify({
        email: formData.get("email"),
        name: formData.get("name"),
        password: formData.get("password"),
        roleSlug: formData.get("roleSlug")
      })
    });
    if (res.ok) {
      notify.success("Admin account created");
      setShowAdd(false);
      void reload();
    } else {
      const data = await res.json().catch(() => ({})) as { message?: string };
      notify.error(data.message ?? "Failed to create admin");
    }
  }

  async function updateRole(id: string) {
    const res = await fetch(`${API_BASE_URL}/admin/dev/admins/${id}/role`, {
      method: "PATCH",
      headers: { ...authHeaders("admin"), "Content-Type": "application/json" },
      body: JSON.stringify({ roleSlug: editRole })
    });
    if (res.ok) {
      notify.success("Role updated");
      setEditId(null);
      void reload();
    } else {
      notify.error("Failed to update role");
    }
  }

  async function updatePassword(id: string) {
    if (editPassword.length < 12) {
      notify.error("Password must be at least 12 characters");
      return;
    }
    const res = await fetch(`${API_BASE_URL}/admin/dev/admins/${id}/password`, {
      method: "PATCH",
      headers: { ...authHeaders("admin"), "Content-Type": "application/json" },
      body: JSON.stringify({ password: editPassword })
    });
    if (res.ok) {
      notify.success("Password updated");
      setEditPassword("");
      void reload();
    } else {
      notify.error("Failed to update password");
    }
  }

  async function deleteAdmin(id: string, name: string) {
    if (!window.confirm(`Delete admin "${name}"? This cannot be undone.`)) return;
    const res = await fetch(`${API_BASE_URL}/admin/dev/admins/${id}`, {
      method: "DELETE",
      headers: authHeaders("admin")
    });
    if (res.ok) {
      notify.success("Admin deleted");
      void reload();
    } else {
      const data = await res.json().catch(() => ({})) as { message?: string };
      notify.error(data.message ?? "Failed to delete admin");
    }
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "24px" }}>
      {/* Role reference table */}
      <section className={styles.panel}>
        <div className={styles.panelHeader}>
          <div>
            <span className="eyebrow">Access Control</span>
            <h2>Admin Roles</h2>
          </div>
        </div>
        <table className="table">
          <thead>
            <tr>
              <th>Role</th>
              <th>Description</th>
              <th>Settings access</th>
              <th>Ticket access</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td><strong>Super Admin</strong></td>
              <td>Full platform access</td>
              <td>✓ Yes</td>
              <td>All departments</td>
            </tr>
            <tr>
              <td><strong>Support Agent</strong></td>
              <td>Support operations</td>
              <td>✕ No</td>
              <td>Support & Abuse</td>
            </tr>
            <tr>
              <td><strong>Sales Agent</strong></td>
              <td>Sales operations</td>
              <td>✕ No</td>
              <td>Sales only</td>
            </tr>
          </tbody>
        </table>
      </section>

      {/* Admin users */}
      <section className={styles.panel}>
        <div className={styles.panelHeader}>
          <div>
            <span className="eyebrow">Admins</span>
            <h2>Admin Accounts</h2>
          </div>
          <Button onClick={() => setShowAdd((v) => !v)} variant={showAdd ? "secondary" : "primary"}>
            {showAdd ? "Cancel" : "+ Add Admin"}
          </Button>
        </div>

        {showAdd ? (
          <form action={createAdmin} style={{ display: "flex", flexDirection: "column", gap: "12px", padding: "16px", background: "var(--surface-2)", borderRadius: "8px", marginBottom: "16px" }}>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
              <label style={{ display: "flex", flexDirection: "column", gap: "4px", fontSize: "0.875rem" }}>
                Name
                <input className="input" name="name" required placeholder="Full name" />
              </label>
              <label style={{ display: "flex", flexDirection: "column", gap: "4px", fontSize: "0.875rem" }}>
                Email
                <input className="input" name="email" required type="email" placeholder="admin@example.com" />
              </label>
              <label style={{ display: "flex", flexDirection: "column", gap: "4px", fontSize: "0.875rem" }}>
                Password (min. 12 chars)
                <input className="input" name="password" required type="password" minLength={12} />
              </label>
              <label style={{ display: "flex", flexDirection: "column", gap: "4px", fontSize: "0.875rem" }}>
                Role
                <select className="input" name="roleSlug" required>
                  {ADMIN_ROLES.map((r) => (
                    <option key={r.slug} value={r.slug}>{r.name} — {r.description}</option>
                  ))}
                </select>
              </label>
            </div>
            <Button type="submit">Create Admin</Button>
          </form>
        ) : null}

        {loading ? <p style={{ padding: "16px", color: "var(--muted)" }}>Loading…</p> : (
          <table className="table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Email</th>
                <th>Role</th>
                <th>Created</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {admins.map((admin) => (
                <tr key={admin.id}>
                  <td><strong>{admin.name}</strong></td>
                  <td>{admin.email}</td>
                  <td>
                    {editId === admin.id ? (
                      <select
                        className="input"
                        value={editRole}
                        onChange={(e) => setEditRole(e.target.value)}
                        style={{ fontSize: "0.85rem" }}
                      >
                        {ADMIN_ROLES.map((r) => <option key={r.slug} value={r.slug}>{r.name}</option>)}
                      </select>
                    ) : (
                      adminRoleLabel(admin)
                    )}
                  </td>
                  <td>{new Intl.DateTimeFormat("de-DE", { dateStyle: "short" }).format(new Date(admin.createdAt))}</td>
                  <td style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
                    {editId === admin.id ? (
                      <>
                        <Button size="sm" onClick={() => updateRole(admin.id)}>Save Role</Button>
                        <input
                          className="input"
                          type="password"
                          placeholder="New password"
                          value={editPassword}
                          onChange={(e) => setEditPassword(e.target.value)}
                          style={{ fontSize: "0.8rem", width: "140px" }}
                        />
                        <Button size="sm" variant="secondary" onClick={() => updatePassword(admin.id)}>Set PW</Button>
                        <Button size="sm" variant="secondary" onClick={() => { setEditId(null); setEditPassword(""); }}>Cancel</Button>
                      </>
                    ) : (
                      <>
                        <Button
                          size="sm"
                          variant="secondary"
                          onClick={() => {
                            setEditId(admin.id);
                            setEditRole(admin.userRoles.find((ur) => ["super_admin","support_agent","sales_agent"].includes(ur.role.slug))?.role.slug ?? "super_admin");
                          }}
                        >
                          Edit
                        </Button>
                        <Button size="sm" variant="secondary" onClick={() => deleteAdmin(admin.id, admin.name)}>
                          Delete
                        </Button>
                      </>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </div>
  );
}
