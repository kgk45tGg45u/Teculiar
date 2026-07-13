"use client";

import LinkExtension from "@tiptap/extension-link";
import Placeholder from "@tiptap/extension-placeholder";
import { EditorContent, useEditor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { Bell, Bold, CreditCard, Eye, EyeOff, FileText, Heading2, Italic, LinkIcon, List, Package, Plus, Redo2, RefreshCw, Save, Trash2, Undo2 } from "lucide-react";
import { useEffect, useState } from "react";
import { domainCycleFor } from "@teculiar/shared";
import { API_BASE_URL, authHeaders, cycleLabel, formatCustomerNumber, money, type ApiAnnouncement, type ApiBlogPost, type ApiClient, type ApiInvoice, type ApiProduct } from "@teculiar/web-core/lib/api";
import { getDictionary, type Dictionary } from "@teculiar/web-core/lib/dictionary";
import type { Locale } from "@teculiar/web-core/lib/i18n";
import { useLocale } from "@teculiar/web-core/components/layout/locale-provider";
import { serviceStatusLabel } from "@teculiar/web-core/lib/status-labels";
import { LanguageCurrencySettings, type CurrencyConfigValue, type LanguagesValue } from "./language-currency-settings";
import { TaxCountrySettings, type TaxCountriesValue } from "./tax-country-settings";
import { Button } from "@teculiar/web-core/components/ui/button";
import { ImageUploader } from "@teculiar/web-core/components/ui/image-uploader";
import { notify, notifyResponse } from "@teculiar/web-core/components/ui/toast-provider";
import styles from "./admin-dashboard.module.css";
import { useSurfaceHref } from "@teculiar/web-core/lib/use-surface-href";
import { surfaceHref } from "@teculiar/web-core/lib/surface";

export function ClientManager({ clients, locale }: { clients: ApiClient[]; locale: Locale; products: ApiProduct[] }) {
  const href = useSurfaceHref();
  const c = getDictionary(locale).admin.forms;
  return (
    <div className={styles.clientList}>
      {clients.length ? clients.map((client) => (
        <a className={styles.clientRow} href={href(`/admin/clients/${client.id}`)} key={client.id}>
          <div>
            <strong>{client.name}</strong>
            <span>{formatCustomerNumber(client.customerNumber)}</span>
          </div>
          <span>{client.email}</span>
          <span>{client.services?.filter((s) => s.status === "ACTIVE").length ?? 0} {c.active}</span>
          <span>{client.domainRecords?.length ?? 0} {c.domains}</span>
          <span>{client.invoices?.filter((i) => i.status !== "PAID").length ?? 0} {c.unpaidInv}</span>
          <span>{money(client.invoices?.filter((i) => i.status === "PAID").reduce((sum, i) => sum + i.totalCents, 0) ?? 0, "EUR", locale)}</span>
        </a>
      )) : <p style={{ padding: "16px", color: "var(--muted)", fontSize: "0.9rem" }}>{c.noClients}</p>}
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
  const c = getDictionary(useLocale()).admin.forms;
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
        window.location.assign(surfaceHref(window.location.pathname, `/admin/clients/${payload.id}`));
        return;
      }
    }
    setMessage(await notifyResponse(response, c.clientCreated, c.clientCreateFailed));
  }

  return (
    <form action={createClient} className={styles.form}>
      <div className={styles.formGrid}>
        <label>{c.name}<input name="name" required placeholder={c.namePlaceholder} /></label>
        <label>{c.email}<input name="email" required type="email" placeholder="max@example.com" /></label>
        <label className={styles.formSpan2}>
          {c.password} *
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
                aria-label={showPassword ? c.hidePassword : c.showPassword}
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
              {c.generate}
            </button>
          </div>
        </label>
        <label>{c.customerType}<select name="customerType"><option value="INDIVIDUAL">{c.individual}</option><option value="BUSINESS">{c.business}</option></select></label>
        <label>{c.country}<input defaultValue="DE" name="countryCode" placeholder="DE" /></label>
        <label>{c.vatId}<input name="vatId" placeholder="DE123456789" /></label>
        <label>
          {c.phoneIntl}
          <input name="phone" type="tel" placeholder="+49 1234567890" />
          <span className={styles.fieldHint}>{c.phoneHint}</span>
        </label>
        <label>{c.address}<input name="address" placeholder={c.streetPlaceholder} /></label>
        <label>{c.zip}<input name="postalCode" placeholder="12345" /></label>
        <label>{c.city}<input name="city" placeholder="Berlin" /></label>
        <label className={styles.formSpan2}>{c.stateRegion}<input name="state" placeholder="Berlin" /></label>
      </div>
      <div className={styles.formActions}>
        <Button icon={Save} type="submit">{c.createClient}</Button>
      </div>
      {message ? <p className={styles.formMessage}>{message}</p> : null}
    </form>
  );
}

function ClientRow({ client, products }: { client: ApiClient; products: ApiProduct[] }) {
  const href = useSurfaceHref();
  const locale = useLocale();
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
        status: "PENDING",
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
        <a href={href(`/admin/clients/${client.id}`)}>Open</a>
        <span>Kundennummer {formatCustomerNumber(client.customerNumber)}</span>
        <span>{client.email}</span>
        <span>{client.services?.filter((service) => service.status === "ACTIVE").length ?? 0} active services</span>
        <span>{client.domainRecords?.length ?? 0} domains</span>
        <span>{client.invoices?.filter((invoice) => invoice.status !== "PAID").length ?? 0} unpaid invoices</span>
        <span>{money(client.invoices?.filter((invoice) => invoice.status === "PAID").reduce((sum, invoice) => sum + invoice.totalCents, 0) ?? 0, undefined, locale)}</span>
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
        <label>Price<select name="productPriceId" defaultValue={defaultProduct?.prices[0]?.id}>{products.flatMap((product) => product.prices.map((price) => <option key={price.id} value={price.id}>{product.name} {cycleLabel(price.billingCycle, locale)} {money(price.amountCents, price.currency, locale)}</option>))}</select></label>
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
  const c = getDictionary(useLocale()).admin.forms;
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
    setMessage(await notifyResponse(response, c.clientProfileSaved, c.profileSaveFailed));
  }

  async function changePassword(formData: FormData) {
    const newPassword = String(formData.get("newPassword") ?? "");
    const confirmPassword = String(formData.get("confirmPassword") ?? "");
    if (newPassword !== confirmPassword) {
      setPwMessage(c.passwordsNoMatch);
      return;
    }
    const response = await fetch(`${API_BASE_URL}/users/${client.id}`, {
      body: JSON.stringify({ newPassword }),
      headers: { "Content-Type": "application/json", ...authHeaders() },
      method: "PATCH"
    });
    setPwMessage(await notifyResponse(response, c.passwordChanged, c.passwordChangeFailed));
  }

  return (
    <div>
      <form action={saveProfile} className={styles.form}>
        <h3>{c.editProfile}</h3>
        <div className={styles.formGrid}>
          <label>{c.name}<input defaultValue={client.name} name="name" required /></label>
          <label>{c.email}<input defaultValue={client.email} name="email" required type="email" /></label>
          <label>{c.customerType}
            <select defaultValue={client.customerType} name="customerType">
              <option value="INDIVIDUAL">{c.individual}</option>
              <option value="BUSINESS">{c.business}</option>
            </select>
          </label>
          <label>{c.country}<input defaultValue={client.countryCode ?? "DE"} name="countryCode" placeholder="DE" /></label>
          <label>{c.vatId}<input defaultValue={client.vatId ?? ""} name="vatId" placeholder="DE123456789" /></label>
          <label>{c.phone}<input defaultValue={contact?.phone ?? ""} name="phone" /></label>
          <label>{c.address}<input defaultValue={address.line1 ?? ""} name="address" /></label>
          <label>{c.zip}<input defaultValue={address.postalCode ?? ""} name="postalCode" /></label>
          <label>{c.city}<input defaultValue={address.city ?? ""} name="city" /></label>
          <label className={styles.formSpan2}>{c.stateRegion}<input defaultValue={address.state ?? ""} name="state" /></label>
        </div>
        <div className={styles.formActions}>
          <Button icon={Save} type="submit">{c.saveProfile}</Button>
        </div>
        {message ? <p className={styles.formMessage}>{message}</p> : null}
      </form>
      <hr style={{ margin: "0 16px", border: "none", borderTop: "1px solid var(--border)" }} />
      <form action={changePassword} className={styles.form}>
        <h3>{c.changePassword}</h3>
        <div className={styles.formGrid}>
          <label>{c.newPassword}<input name="newPassword" required type="password" placeholder={c.newPassword} /></label>
          <label>{c.confirmPassword}<input name="confirmPassword" required type="password" placeholder={c.confirmPassword} /></label>
        </div>
        <div className={styles.formActions}>
          <Button icon={Save} type="submit">{c.setPassword}</Button>
        </div>
        {pwMessage ? <p className={styles.formMessage}>{pwMessage}</p> : null}
      </form>
    </div>
  );
}

export function AdminClientDeleteButton({ clientId, clientName }: { clientId: string; clientName: string }) {
  const c = getDictionary(useLocale()).admin.forms;
  const [message, setMessage] = useState("");

  async function handleDelete() {
    const confirmed = window.confirm(c.deleteClientConfirm.replace("{name}", clientName));
    if (!confirmed) return;
    const response = await fetch(`${API_BASE_URL}/users/${clientId}`, { headers: authHeaders(), method: "DELETE" });
    const ok = response.ok;
    setMessage(await notifyResponse(response, c.clientDeleted, c.clientDeleteFailed));
    if (ok) {
      window.location.assign(surfaceHref(window.location.pathname, "/admin/clients"));
    }
  }

  return (
    <div className={styles.formActions}>
      <Button icon={Trash2} type="button" variant="ghost" onClick={handleDelete}>{c.deleteClient}</Button>
      {message ? <span style={{ fontSize: "0.85rem", color: "var(--muted)" }}>{message}</span> : null}
    </div>
  );
}

export function AdminCreateInvoicePanel({ client }: { client: ApiClient }) {
  const c = getDictionary(useLocale()).admin.forms;
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
        status: "PENDING",
        userId: client.id
      }),
      headers: { "Content-Type": "application/json", ...authHeaders() },
      method: "POST"
    });
    setMessage(await notifyResponse(response, c.invoiceCreated, c.invoiceCreateFailed));
  }

  return (
    <form action={createInvoice} className={styles.form}>
      <div className={styles.formGrid}>
        {[0, 1, 2].map((index) => (
          <fieldset className={`${styles.lineEditor} ${styles.formSpan2}`} key={index}>
            <legend>{c.line.replace("{n}", String(index + 1))}</legend>
            <label>{c.description}<input defaultValue={index === 0 ? c.manualService : ""} name="description" /></label>
            <label>{c.billingCycle}
              <select defaultValue="ONE_TIME" name="billingCycle">
                <option value="ONE_TIME">{c.cycleOneTime}</option>
                <option value="MONTHLY">{c.cycleMonthly}</option>
                <option value="YEAR_1">{c.cycleAnnually}</option>
              </select>
            </label>
            <label>{c.quantity}<input defaultValue="1" min="1" name="quantity" type="number" /></label>
            <label>{c.amountEur}<input defaultValue={index === 0 ? "10" : "0"} min="0" name="amount" step="0.01" type="number" /></label>
            <label>{c.vatRatePct}<input defaultValue="19" min="0" name="vatRate" step="0.01" type="number" /></label>
          </fieldset>
        ))}
      </div>
      <div className={styles.formActions}>
        <Button icon={FileText} type="submit">{c.createInvoice}</Button>
      </div>
      {message ? <p className={styles.formMessage}>{message}</p> : null}
    </form>
  );
}

export function ClientDetailModals({ client, products }: { client: ApiClient; products: ApiProduct[] }) {
  const locale = useLocale();
  const c = getDictionary(locale).admin.forms;
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
    setMessage(await notifyResponse(response, c.orderCreated, c.orderCreateFailed));
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
        status: "PENDING",
        userId: client.id
      }),
      headers: { "Content-Type": "application/json", ...authHeaders() },
      method: "POST"
    });
    setMessage(await notifyResponse(response, c.invoiceCreated, c.invoiceCreateFailed));
  }

  return (
    <div className={styles.inlineForm}>
      <Button icon={Package} type="button" onClick={() => setOpen("order")}>{c.createOrder}</Button>
      <Button icon={FileText} type="button" variant="secondary" onClick={() => setOpen("invoice")}>{c.createInvoice}</Button>
      {message ? <span>{message}</span> : null}

      <dialog className={styles.modal} open={open === "order"}>
        <form action={createOrder} className={styles.form}>
          <h3>{c.createOrder}</h3>
          <label>{c.product}<select name="productId" defaultValue={defaultProduct?.id}>{products.map((product) => <option key={product.id} value={product.id}>{product.name}</option>)}</select></label>
          <label>{c.price}<select name="productPriceId" defaultValue={defaultProduct?.prices[0]?.id}>{products.flatMap((product) => product.prices.map((price) => <option key={price.id} value={price.id}>{product.name} {cycleLabel(price.billingCycle, locale)} {money(price.amountCents, price.currency, locale)}</option>))}</select></label>
          <label>{c.domainName}<input name="domainName" placeholder="example.com" /></label>
          <label>{c.domainAction}<select name="domainAction"><option value="register">{c.register}</option><option value="transfer">{c.transfer}</option></select></label>
          <label>{c.apiModule}<input defaultValue={defaultProduct?.provisioningModule ?? "virtualmin"} name="apiModule" /></label>
          <label><span><input name="addDomain" type="checkbox" /> {c.addDomainItem}</span></label>
          <label>{c.notes}<textarea name="notes" rows={2} /></label>
          <div className={styles.inlineForm}>
            <Button icon={Plus} type="submit">{c.create}</Button>
            <Button type="button" variant="secondary" onClick={() => setOpen(null)}>{c.close}</Button>
          </div>
        </form>
      </dialog>

      <dialog className={styles.modal} open={open === "invoice"}>
        <form action={createInvoice} className={styles.form}>
          <h3>{c.createInvoice}</h3>
          {[0, 1, 2].map((index) => (
            <fieldset className={styles.lineEditor} key={index}>
              <legend>{c.line.replace("{n}", String(index + 1))}</legend>
              <label>{c.description}<input defaultValue={index === 0 ? c.manualService : ""} name="description" /></label>
              <label>{c.billingCycle}<select defaultValue="ONE_TIME" name="billingCycle"><option value="ONE_TIME">{c.cycleOneTime}</option><option value="MONTHLY">{c.cycleMonthly}</option><option value="YEAR_1">{c.cycleAnnually}</option></select></label>
              <label>{c.quantity}<input defaultValue="1" min="1" name="quantity" type="number" /></label>
              <label>{c.amountEur}<input defaultValue={index === 0 ? "10" : "0"} min="0" name="amount" step="0.01" type="number" /></label>
              <label>{c.vatRate}<input defaultValue="19" min="0" name="vatRate" step="0.01" type="number" /></label>
            </fieldset>
          ))}
          <div className={styles.inlineForm}>
            <Button icon={FileText} type="submit">{c.create}</Button>
            <Button type="button" variant="secondary" onClick={() => setOpen(null)}>{c.close}</Button>
          </div>
        </form>
      </dialog>
    </div>
  );
}

export function AdminInvoiceActions({ invoice }: { invoice: ApiInvoice }) {
  const c = getDictionary(useLocale()).admin.forms;
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
    setMessage(await notifyResponse(response, c.markedPaid, c.markPaidFailed));
    if (response.ok) setShowMarkPaid(false);
  }

  async function markUnpaid() {
    const response = await fetch(`${API_BASE_URL}/billing/invoices/${invoice.id}/mark-unpaid`, {
      body: JSON.stringify({ reason: "Admin manual change" }),
      headers: { "Content-Type": "application/json", ...authHeaders() },
      method: "POST"
    });
    setMessage(await notifyResponse(response, c.markedUnpaid, c.markUnpaidFailed));
  }

  async function refundInvoice() {
    const response = await fetch(`${API_BASE_URL}/billing/invoices/${invoice.id}/refund`, {
      body: JSON.stringify({ reason: "Admin refund" }),
      headers: { "Content-Type": "application/json", ...authHeaders() },
      method: "POST"
    });
    setMessage(await notifyResponse(response, c.invoiceRefunded, c.refundFailed));
  }

  async function deleteInvoice() {
    if (isPermanent) {
      const confirmed = window.confirm(c.deleteInvoiceConfirm.replace("{number}", String(invoice.finalInvoiceNumber ?? invoice.invoiceNumber)));
      if (!confirmed) return;
    }
    const response = await fetch(`${API_BASE_URL}/billing/invoices/${invoice.id}`, {
      headers: authHeaders(),
      method: "DELETE"
    });
    setMessage(await notifyResponse(response, c.invoiceDeleted, c.invoiceDeleteFailed));
  }

  return (
    <div className={styles.form} style={{ gap: 12 }}>
      <div className={styles.inlineForm}>
        {invoice.status !== "PAID" ? (
          <Button icon={CreditCard} type="button" onClick={() => setShowMarkPaid((v) => !v)}>
            {showMarkPaid ? c.cancel : c.markPaid}
          </Button>
        ) : null}
        {invoice.status === "PAID" ? <Button icon={CreditCard} type="button" variant="secondary" onClick={markUnpaid}>{c.markUnpaid}</Button> : null}
        {invoice.status === "PAID" ? <Button icon={CreditCard} type="button" variant="secondary" onClick={refundInvoice}>{c.refund}</Button> : null}
        <Button icon={Trash2} type="button" variant="ghost" onClick={deleteInvoice}>{c.delete}</Button>
      </div>

      {showMarkPaid && invoice.status !== "PAID" ? (
        <form action={handleMarkPaid} className={styles.form} style={{ padding: 0 }}>
          <div className={styles.formGrid}>
            <label>
              {c.paymentDate}
              <input defaultValue={datetimeLocal(new Date().toISOString())} name="paidAt" type="datetime-local" />
            </label>
            <label>
              {c.transactionId}
              <input name="transactionId" placeholder="e.g. PAY-12345" />
            </label>
            <label className={styles.formSpan2}>
              <span><input name="skipModules" type="checkbox" /> {c.skipModules}</span>
            </label>
          </div>
          <div className={styles.formActions}>
            <Button icon={CreditCard} type="submit">{c.confirmMarkPaid}</Button>
          </div>
        </form>
      ) : null}

      {message ? <small style={{ padding: "0 16px", color: "var(--muted)" }}>{message}</small> : null}
    </div>
  );
}

export function AdminServiceStatusForm({ serviceId, status }: { serviceId: string; status: string }) {
  const c = getDictionary(useLocale()).admin.forms;
  const [message, setMessage] = useState("");
  async function submit(formData: FormData) {
    const response = await fetch(`${API_BASE_URL}/admin/dev/services/${serviceId}/status`, {
      body: JSON.stringify({ status: String(formData.get("status") ?? status) }),
      headers: { "Content-Type": "application/json", ...authHeaders() },
      method: "PATCH"
    });
    setMessage(await notifyResponse(response, c.serviceStatusSaved, c.serviceStatusFailed));
  }

  const statusOptions: Array<[string, string]> = [
    ["PENDING", c.statusPending],
    ["PROVISIONING", c.statusProvisioning],
    ["ACTIVE", c.statusActive],
    ["SUSPENDED", c.statusSuspended],
    ["CANCELLED", c.statusCancelled],
    ["TERMINATED", c.statusTerminated],
    ["FAILED", c.statusFailed]
  ];
  return (
    <form action={submit} className={styles.inlineForm}>
      <select defaultValue={status} name="status">
        {statusOptions.map(([value, label]) => (
          <option key={value} value={value}>{label}</option>
        ))}
      </select>
      <Button icon={Save} type="submit">{c.saveStatus}</Button>
      {message ? <span>{message}</span> : null}
    </form>
  );
}

export function AdminServiceDueDateForm({ renewsAt, serviceId }: { renewsAt?: string | null; serviceId: string }) {
  const c = getDictionary(useLocale()).admin.forms;
  const [message, setMessage] = useState("");

  async function submit(formData: FormData) {
    const value = String(formData.get("renewsAt") ?? "");
    const response = await fetch(`${API_BASE_URL}/admin/dev/services/${serviceId}`, {
      body: JSON.stringify({ renewsAt: value ? new Date(value).toISOString() : null }),
      headers: { "Content-Type": "application/json", ...authHeaders() },
      method: "PATCH"
    });
    setMessage(await notifyResponse(response, c.dueDateUpdated, c.dueDateUpdateFailed));
  }

  return (
    <form action={submit} className={styles.inlineForm}>
      <label style={{ display: "flex", alignItems: "center", gap: 8 }}>
        {c.nextDue}
        <input defaultValue={dateInputValue(renewsAt)} name="renewsAt" type="date" />
      </label>
      <Button icon={Save} type="submit">{c.updateDueDate}</Button>
      {message ? <span>{message}</span> : null}
    </form>
  );
}

function dateInputValue(value?: string | null) {
  return value ? new Date(value).toISOString().slice(0, 10) : "";
}

export function AnnouncementForm() {
  const c = getDictionary(useLocale()).admin.forms;
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

    setMessage(await notifyResponse(response, editing ? c.announcementSaved : c.announcementPublished, c.announcementFailed));
    if (response.ok) {
      setEditing(undefined);
      await refresh();
    }
  }

  async function remove(announcement: ApiAnnouncement) {
    const response = await fetch(`${API_BASE_URL}/cms/admin/dev/announcements/${announcement.id}`, { headers: authHeaders(), method: "DELETE" });
    setMessage(await notifyResponse(response, c.announcementDeleted, c.deleteFailed));
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
            <Button type="button" variant="secondary" onClick={() => setEditing(announcement)}>{c.edit}</Button>
            <Button type="button" variant="ghost" onClick={() => remove(announcement)}>{c.delete}</Button>
          </article>
        ))}
      </div>
      <form action={submit} className={styles.form} key={editing?.id ?? "new-announcement"}>
        <label>{c.title}<input defaultValue={editing?.title ?? ""} name="title" placeholder={c.titlePlaceholder} required /></label>
        <label>{c.locale}<select defaultValue={editing?.locale ?? "de"} name="locale"><option value="de">{c.german}</option><option value="en">{c.english}</option></select></label>
        <label>{c.dateTime}<input defaultValue={datetimeLocal(editing?.publishedAt)} name="publishedAt" type="datetime-local" /></label>
        <label>{c.excerpt}<input defaultValue={editing?.excerpt ?? ""} name="excerpt" placeholder={c.excerptPlaceholder} /></label>
        <label>{c.content}<textarea defaultValue={editing?.body ?? ""} name="body" rows={5} placeholder={c.announcementPlaceholder} required /></label>
        <Button icon={Bell} type="submit">{editing ? c.saveAnnouncement : c.publishAnnouncement}</Button>
        {editing ? <Button type="button" variant="secondary" onClick={() => setEditing(undefined)}>{c.newAnnouncement}</Button> : null}
        {message ? <p>{message}</p> : null}
      </form>
    </div>
  );
}

export function CronSettingsForm() {
  const c = getDictionary(useLocale()).admin.settingsForm;
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
    salesMailboxAddress: "sales@teculiar.com",
    supportImapEnabled: false,
    supportImapHost: "",
    supportImapMailbox: "INBOX",
    supportImapPassword: "",
    supportImapPort: 993,
    supportImapSecure: true,
    supportImapUsername: "",
    supportMailboxAddress: "support@teculiar.com",
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
        salesMailboxAddress: p.salesMailboxAddress ?? "sales@teculiar.com",
        supportImapEnabled: Boolean(p.supportImapEnabled),
        supportImapHost: p.supportImapHost ?? "",
        supportImapMailbox: p.supportImapMailbox ?? "INBOX",
        supportImapPassword: p.supportImapPassword ?? "",
        supportImapPort: p.supportImapPort ?? 993,
        supportImapSecure: p.supportImapSecure !== false,
        supportImapUsername: p.supportImapUsername ?? "",
        supportMailboxAddress: p.supportMailboxAddress ?? "support@teculiar.com",
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
        salesMailboxAddress: String(formData.get("salesMailboxAddress") ?? "sales@teculiar.com"),
        supportImapEnabled: formData.get("supportImapEnabled") === "on",
        supportImapHost: String(formData.get("supportImapHost") ?? ""),
        supportImapMailbox: String(formData.get("supportImapMailbox") ?? "INBOX"),
        supportImapPassword: String(formData.get("supportImapPassword") ?? ""),
        supportImapPort: Number(formData.get("supportImapPort") ?? 993),
        supportImapSecure: formData.get("supportImapSecure") === "on",
        supportImapUsername: String(formData.get("supportImapUsername") ?? ""),
        supportMailboxAddress: String(formData.get("supportMailboxAddress") ?? "support@teculiar.com"),
        ticketAutoCloseHours: Number(formData.get("ticketAutoCloseHours") ?? 24)
      }),
      headers: { "Content-Type": "application/json", ...authHeaders() },
      method: "PATCH"
    });
    setMessage(await notifyResponse(response, c.cronSettingsSaved, c.saveFailed));
  }

  async function runCron() {
    setLastCronRun(c.runningCron);
    const response = await fetch(`${API_BASE_URL}/cron/admin/run`, { headers: authHeaders(), method: "POST" });
    const payload = (await response.json().catch(() => ({}))) as { ran?: unknown[]; skipped?: unknown[] };
    if (!response.ok) {
      setLastCronRun(c.cronRunFailed);
      notify.error(c.cronRunFailed);
      return;
    }
    const text = c.cronFinished.replace("{ran}", String(payload.ran?.length ?? 0)).replace("{skipped}", String(payload.skipped?.length ?? 0));
    setLastCronRun(text);
    notify.success(text);
  }

  return (
    <form action={submit} className={styles.form}>
      <h3>{c.cron}</h3>
      <Button icon={RefreshCw} type="button" variant="secondary" onClick={runCron}>{c.runCronNow}</Button>
      {lastCronRun ? <p>{lastCronRun}</p> : null}
      <label>{c.cronSecret}<input value={s.cronSecret} name="cronSecret" type="password" onChange={(e) => setS({ ...s, cronSecret: e.target.value })} /></label>
      <label>{c.domainPriceHours}<input min="1" value={s.domainPriceUpdateHours} name="domainPriceUpdateHours" type="number" onChange={(e) => setS({ ...s, domainPriceUpdateHours: Number(e.target.value) })} /></label>
      <label>{c.domainExpirationHours}<input min="1" value={s.domainExpirationUpdateHours} name="domainExpirationUpdateHours" type="number" onChange={(e) => setS({ ...s, domainExpirationUpdateHours: Number(e.target.value) })} /></label>
      <label>{c.domainStatusMinutes}<input min="1" value={s.domainStatusUpdateMinutes} name="domainStatusUpdateMinutes" type="number" onChange={(e) => setS({ ...s, domainStatusUpdateMinutes: Number(e.target.value) })} /></label>
      <label>{c.hostingStatusMinutes}<input min="1" value={s.hostingStatusUpdateMinutes} name="hostingStatusUpdateMinutes" type="number" onChange={(e) => setS({ ...s, hostingStatusUpdateMinutes: Number(e.target.value) })} /></label>
      <label>{c.invoiceDaysAhead}<input value={s.invoiceDaysAhead} name="invoiceDaysAhead" type="number" onChange={(e) => setS({ ...s, invoiceDaysAhead: Number(e.target.value) })} /></label>
      <label>{c.invoiceReminderDays}<input min="1" value={s.invoiceReminderDaysBeforeDue} name="invoiceReminderDaysBeforeDue" type="number" onChange={(e) => setS({ ...s, invoiceReminderDaysBeforeDue: Number(e.target.value) })} /></label>
      <label>{c.ticketAutoClose}<input value={s.ticketAutoCloseHours} name="ticketAutoCloseHours" type="number" onChange={(e) => setS({ ...s, ticketAutoCloseHours: Number(e.target.value) })} /></label>
      <label>{c.mailboxCheck}<input min="1" value={s.mailboxCheckMinutes} name="mailboxCheckMinutes" type="number" onChange={(e) => setS({ ...s, mailboxCheckMinutes: Number(e.target.value) })} /></label>
      <h3>{c.supportImap}</h3>
      <label><span><input checked={s.supportImapEnabled} name="supportImapEnabled" type="checkbox" onChange={(e) => setS({ ...s, supportImapEnabled: e.target.checked })} /> {c.enableSupportMailbox}</span></label>
      <label>{c.supportMailboxAddress}<input value={s.supportMailboxAddress} name="supportMailboxAddress" type="email" onChange={(e) => setS({ ...s, supportMailboxAddress: e.target.value })} /></label>
      <label>{c.supportImapHost}<input value={s.supportImapHost} name="supportImapHost" onChange={(e) => setS({ ...s, supportImapHost: e.target.value })} /></label>
      <label>{c.supportImapPort}<input value={s.supportImapPort} name="supportImapPort" type="number" onChange={(e) => setS({ ...s, supportImapPort: Number(e.target.value) })} /></label>
      <label><span><input checked={s.supportImapSecure} name="supportImapSecure" type="checkbox" onChange={(e) => setS({ ...s, supportImapSecure: e.target.checked })} /> {c.supportImapTls}</span></label>
      <label>{c.supportImapUsername}<input value={s.supportImapUsername} name="supportImapUsername" onChange={(e) => setS({ ...s, supportImapUsername: e.target.value })} /></label>
      <label>{c.supportImapPassword}<input value={s.supportImapPassword} name="supportImapPassword" type="password" onChange={(e) => setS({ ...s, supportImapPassword: e.target.value })} /></label>
      <label>{c.supportImapMailbox}<input value={s.supportImapMailbox} name="supportImapMailbox" onChange={(e) => setS({ ...s, supportImapMailbox: e.target.value })} /></label>
      <h3>{c.salesImap}</h3>
      <label><span><input checked={s.salesImapEnabled} name="salesImapEnabled" type="checkbox" onChange={(e) => setS({ ...s, salesImapEnabled: e.target.checked })} /> {c.enableSalesMailbox}</span></label>
      <label>{c.salesMailboxAddress}<input value={s.salesMailboxAddress} name="salesMailboxAddress" type="email" onChange={(e) => setS({ ...s, salesMailboxAddress: e.target.value })} /></label>
      <label>{c.salesImapHost}<input value={s.salesImapHost} name="salesImapHost" onChange={(e) => setS({ ...s, salesImapHost: e.target.value })} /></label>
      <label>{c.salesImapPort}<input value={s.salesImapPort} name="salesImapPort" type="number" onChange={(e) => setS({ ...s, salesImapPort: Number(e.target.value) })} /></label>
      <label><span><input checked={s.salesImapSecure} name="salesImapSecure" type="checkbox" onChange={(e) => setS({ ...s, salesImapSecure: e.target.checked })} /> {c.salesImapTls}</span></label>
      <label>{c.salesImapUsername}<input value={s.salesImapUsername} name="salesImapUsername" onChange={(e) => setS({ ...s, salesImapUsername: e.target.value })} /></label>
      <label>{c.salesImapPassword}<input value={s.salesImapPassword} name="salesImapPassword" type="password" onChange={(e) => setS({ ...s, salesImapPassword: e.target.value })} /></label>
      <label>{c.salesImapMailbox}<input value={s.salesImapMailbox} name="salesImapMailbox" onChange={(e) => setS({ ...s, salesImapMailbox: e.target.value })} /></label>
      <Button icon={Save} type="submit">{c.saveCronSettings}</Button>
      {message ? <p>{message}</p> : null}
    </form>
  );
}

const COMMON_TIMEZONES = [
  "UTC",
  "Europe/Berlin",
  "Europe/London",
  "Europe/Paris",
  "Europe/Madrid",
  "Europe/Rome",
  "Europe/Amsterdam",
  "Europe/Vienna",
  "Europe/Zurich",
  "Europe/Warsaw",
  "Europe/Istanbul",
  "Europe/Moscow",
  "America/New_York",
  "America/Chicago",
  "America/Denver",
  "America/Los_Angeles",
  "America/Sao_Paulo",
  "Asia/Dubai",
  "Asia/Kolkata",
  "Asia/Singapore",
  "Asia/Tokyo",
  "Australia/Sydney",
  "Pacific/Auckland"
];

export function SettingsForm() {
  const dict = getDictionary(useLocale()).admin;
  const c = dict.settingsForm;
  const f = dict.forms;
  const [message, setMessage] = useState("");
  const [s, setS] = useState({
    adminTimezone: "UTC",
    deepseekApiKey: "",
    faviconUrl: "",
    founderPhotoUrl: "",
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
    siteUrl: "",
    termsUrl: "",
    languages: { main: "de", others: ["en"] } as LanguagesValue,
    currencyConfig: { main: "EUR", others: ["USD"], rates: { USD: { rate: 1, buffer: 0, bufferEnabled: false } } } as CurrencyConfigValue,
    taxCountries: { enabled: true, default: "DE", rates: { DE: 19 } } as TaxCountriesValue
  });

  useEffect(() => {
    void fetch(`${API_BASE_URL}/admin/dev/billing/settings`, { headers: authHeaders() })
      .then((r) => r.json())
      .then((p) => setS({
        adminTimezone: p.adminTimezone ?? "UTC",
        deepseekApiKey: p.deepseekApiKey ?? "",
        faviconUrl: p.faviconUrl ?? "",
        founderPhotoUrl: p.founderPhotoUrl ?? "",
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
        siteUrl: p.siteUrl ?? "",
        termsUrl: p.termsUrl ?? "",
        languages: p.languages?.main ? p.languages : { main: "de", others: ["en"] },
        currencyConfig: p.currencyConfig?.main ? p.currencyConfig : { main: "EUR", others: ["USD"], rates: { USD: { rate: 1, buffer: 0, bufferEnabled: false } } },
        taxCountries: p.taxCountries?.rates ? p.taxCountries : { enabled: true, default: "DE", rates: { DE: p.vatPercent ?? 19 } }
      }))
      .catch(() => undefined);
  }, []);

  async function submit(formData: FormData) {
    const response = await fetch(`${API_BASE_URL}/admin/dev/billing/settings`, {
      body: JSON.stringify({
        adminTimezone: String(formData.get("adminTimezone") ?? "UTC"),
        deepseekApiKey: String(formData.get("deepseekApiKey") ?? ""),
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
        founderPhotoUrl: String(formData.get("founderPhotoUrl") ?? ""),
        siteLogoUrl: s.siteLogoUrl,
        siteUrl: String(formData.get("siteUrl") ?? ""),
        termsUrl: String(formData.get("termsUrl") ?? ""),
        // Keep the legacy flat vatPercent in sync with the default country's rate (0 when VAT is
        // switched off) for any consumer that still reads it; tax.countries is the source of truth.
        vatPercent: s.taxCountries.enabled ? Number(s.taxCountries.rates[s.taxCountries.default] ?? 19) : 0,
        languages: s.languages,
        currencyConfig: s.currencyConfig,
        taxCountries: s.taxCountries
      }),
      headers: { "Content-Type": "application/json", ...authHeaders() },
      method: "PATCH"
    });
    setMessage(await notifyResponse(response, c.settingsSaved, c.settingsFailed));
  }

  return (
    <form action={submit} className={styles.form}>
      <h3>{c.general}</h3>
      <label>
        {c.deepseekApiKey}
        <input
          value={s.deepseekApiKey ?? ""}
          name="deepseekApiKey"
          placeholder="sk-..."
          type="password"
          autoComplete="off"
          onChange={(e) => setS({ ...s, deepseekApiKey: e.target.value })}
        />
      </label>
      <p style={{ color: "var(--muted)", fontSize: "0.84rem", margin: "-8px 0 0" }}>
        {c.deepseekHint}
      </p>
      <label>
        {c.adminTimezone}
        <select value={s.adminTimezone} name="adminTimezone" onChange={(e) => setS({ ...s, adminTimezone: e.target.value })}>
          {COMMON_TIMEZONES.map((tz) => <option key={tz} value={tz}>{tz}</option>)}
          {!COMMON_TIMEZONES.includes(s.adminTimezone) && <option value={s.adminTimezone}>{s.adminTimezone}</option>}
        </select>
      </label>
      <label>
        {c.siteUrl}
        <input
          value={s.siteUrl}
          name="siteUrl"
          placeholder="https://teculiar.com"
          type="url"
          onChange={(e) => setS({ ...s, siteUrl: e.target.value })}
        />
      </label>
      <p style={{ color: "var(--muted)", fontSize: "0.84rem", margin: "-8px 0 0" }}>
        {c.siteUrlHint}
      </p>
      <h3>{c.aboutUs}</h3>
      <ImageUploader
        accept="image/png,image/jpeg,image/webp,image/svg+xml"
        action={`${API_BASE_URL}/admin/dev/assets/founder-photo`}
        headers={authHeaders()}
        label={c.founderPhoto}
        onUploaded={(payload) => setS({ ...s, founderPhotoUrl: String(payload.photoUrl ?? "") })}
        previewUrl={s.founderPhotoUrl}
      />
      <label>
        {c.founderPhotoUrl}
        <input
          value={s.founderPhotoUrl}
          name="founderPhotoUrl"
          placeholder="/uploads/founder-photo.jpg"
          onChange={(e) => setS({ ...s, founderPhotoUrl: e.target.value })}
        />
      </label>
      <p style={{ color: "var(--muted)", fontSize: "0.84rem", margin: "-8px 0 0" }}>
        {c.founderPhotoHint}
      </p>
      <h3>{c.legal}</h3>
      <label>{c.termsUrl}<input value={s.termsUrl} name="termsUrl" placeholder="/de/legal/agb" onChange={(e) => setS({ ...s, termsUrl: e.target.value })} /></label>
      <LanguageCurrencySettings
        languages={s.languages}
        currencyConfig={s.currencyConfig}
        onLanguages={(v) => setS({ ...s, languages: v })}
        onCurrencyConfig={(v) => setS({ ...s, currencyConfig: v })}
      />
      <TaxCountrySettings value={s.taxCountries} onChange={(v) => setS({ ...s, taxCountries: v })} />
      <h3>{c.invoiceBranding}</h3>
      <ImageUploader
        action={`${API_BASE_URL}/admin/dev/assets/logo`}
        headers={authHeaders()}
        label={c.websiteLogo}
        onUploaded={(payload) => setS({ ...s, siteLogoUrl: String(payload.logoUrl ?? "") })}
        previewUrl={s.siteLogoUrl}
      />
      <ImageUploader
        accept="image/png,image/x-icon,image/svg+xml,image/webp"
        action={`${API_BASE_URL}/admin/dev/assets/favicon`}
        headers={authHeaders()}
        label={c.favicon}
        onUploaded={(payload) => setS({ ...s, faviconUrl: String(payload.faviconUrl ?? "") })}
        previewUrl={s.faviconUrl}
      />
      <p style={{ color: "var(--muted)", fontSize: "0.84rem", margin: "-8px 0 0" }}>
        {c.faviconHint}
      </p>
      <label>{c.companyName}<input value={s.invoiceCompanyName} name="invoiceCompanyName" onChange={(e) => setS({ ...s, invoiceCompanyName: e.target.value })} /></label>
      <label>{c.companyAddress}<input value={s.invoiceCompanyAddress} name="invoiceCompanyAddress" onChange={(e) => setS({ ...s, invoiceCompanyAddress: e.target.value })} /></label>
      <label>{f.zip}<input value={s.invoiceCompanyZip} name="invoiceCompanyZip" onChange={(e) => setS({ ...s, invoiceCompanyZip: e.target.value })} /></label>
      <label>{f.city}<input value={s.invoiceCompanyCity} name="invoiceCompanyCity" onChange={(e) => setS({ ...s, invoiceCompanyCity: e.target.value })} /></label>
      <label>{f.country}<input value={s.invoiceCompanyCountry} name="invoiceCompanyCountry" onChange={(e) => setS({ ...s, invoiceCompanyCountry: e.target.value })} /></label>
      <label>{f.email}<input value={s.invoiceCompanyEmail} name="invoiceCompanyEmail" type="email" onChange={(e) => setS({ ...s, invoiceCompanyEmail: e.target.value })} /></label>
      <label>{f.phone}<input value={s.invoiceCompanyPhone} name="invoiceCompanyPhone" onChange={(e) => setS({ ...s, invoiceCompanyPhone: e.target.value })} /></label>
      <label>{c.ustId}<input value={s.invoiceVatNumber} name="invoiceVatNumber" onChange={(e) => setS({ ...s, invoiceVatNumber: e.target.value })} /></label>
      <label>{c.footerLine1}<input value={s.invoiceFooterLine1} name="invoiceFooterLine1" onChange={(e) => setS({ ...s, invoiceFooterLine1: e.target.value })} /></label>
      <label>{c.footerLine2}<input value={s.invoiceFooterLine2} name="invoiceFooterLine2" onChange={(e) => setS({ ...s, invoiceFooterLine2: e.target.value })} /></label>
      <label>{c.footerLine3}<input value={s.invoiceFooterLine3} name="invoiceFooterLine3" onChange={(e) => setS({ ...s, invoiceFooterLine3: e.target.value })} /></label>
      <label>{c.paymentInstructions}<textarea value={s.invoicePaymentInstructions} name="invoicePaymentInstructions" rows={3} onChange={(e) => setS({ ...s, invoicePaymentInstructions: e.target.value })} /></label>
      <label>{c.bankDetails}<textarea value={s.invoiceBankDetails} name="invoiceBankDetails" rows={3} onChange={(e) => setS({ ...s, invoiceBankDetails: e.target.value })} /></label>
      <Button icon={Save} type="submit">{c.saveSettings}</Button>
      {message ? <p>{message}</p> : null}
    </form>
  );
}

type Gateway = { config?: Record<string, unknown>; enabled: boolean; method: string; validation?: { message?: string; ok?: boolean } };

export function PaymentGatewayForm() {
  const c = getDictionary(useLocale()).admin.settingsForm;
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
      const displayName = String(formData.get(`${gateway.method}_displayName`) ?? "");
      if (gateway.method === "BANK_TRANSFER") {
        return {
          config: {
            accountHolder: String(formData.get(`${gateway.method}_accountHolder`) ?? ""),
            bankName: String(formData.get(`${gateway.method}_bankName`) ?? ""),
            bic: String(formData.get(`${gateway.method}_bic`) ?? ""),
            displayName,
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
          displayName,
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
        notify.success(c.gatewaysSavedVerified);
      } else {
        notify.error(c.gatewaysVerifyFailed);
      }
      return;
    }
    notifyResponse(response, c.saved, c.saveFailed).catch(() => undefined);
  }

  return (
    <form action={submit} className={styles.form}>
      <p style={{ color: "var(--muted)", fontSize: "0.88rem", margin: 0 }}>
        {c.gatewayIntro}
      </p>

      {gateways.map((gateway) => {
        const result = results[gateway.method];
        const verified = gateway.config?.verifiedAt;
        return (
          <fieldset className={styles.gatewayCard} key={gateway.method}>
            <div className={styles.gatewayCardHeader}>
              <label className={styles.gatewayToggle}>
                <input defaultChecked={gateway.enabled} name={`${gateway.method}_enabled`} type="checkbox" />
                <strong>{gatewayTitle(gateway.method, c)}</strong>
              </label>
              <span className={styles.gatewayBadge}>{gatewayProvider(gateway.method)}</span>
            </div>

            {gateway.method !== "SANDBOX" ? (
              <div className={styles.gatewayFields}>
                <label>
                  {c.nameOnInvoice}
                  <input
                    defaultValue={String(gateway.config?.displayName ?? "")}
                    name={`${gateway.method}_displayName`}
                    placeholder={gatewayTitle(gateway.method, c)}
                  />
                  <span className={styles.gatewayHint}>{c.nameOnInvoiceHint}</span>
                </label>
              </div>
            ) : null}

            {gateway.method === "SANDBOX" ? (
              <p className={styles.gatewayHint}>{c.sandboxHint}</p>
            ) : gateway.method === "PAYPAL" ? (
              <div className={styles.gatewayFields}>
                <label>
                  {c.environment}
                  <select defaultValue={String(gateway.config?.mode ?? "test")} name={`${gateway.method}_mode`}>
                    <option value="test">{c.envSandbox}</option>
                    <option value="live">{c.envLive}</option>
                  </select>
                </label>
                <label>
                  {c.clientIdLabel}
                  <input
                    autoComplete="off"
                    defaultValue={String(gateway.config?.clientId ?? "")}
                    name={`${gateway.method}_clientId`}
                    placeholder="AQriNUWPj..."
                    spellCheck={false}
                  />
                </label>
                <label>
                  {c.clientSecretLabel}
                  <input
                    autoComplete="new-password"
                    defaultValue={String(gateway.config?.clientSecret ?? "")}
                    name={`${gateway.method}_clientSecret`}
                    placeholder="EIf2sU-Hg..."
                    type="password"
                  />
                </label>
                <p className={styles.gatewayHint}>
                  {c.paypalHint}
                </p>
              </div>
            ) : gateway.method === "BANK_TRANSFER" ? (
              <div className={styles.gatewayFields}>
                <label>
                  {c.accountHolderName}
                  <input
                    defaultValue={String(gateway.config?.accountHolder ?? "")}
                    name={`${gateway.method}_accountHolder`}
                    placeholder="Teculiar GmbH"
                  />
                </label>
                <label>
                  {c.bankNameLabel}
                  <input
                    defaultValue={String(gateway.config?.bankName ?? "")}
                    name={`${gateway.method}_bankName`}
                    placeholder="Deutsche Bank"
                  />
                </label>
                <label>
                  {c.ibanLabel}
                  <input
                    defaultValue={String(gateway.config?.iban ?? "")}
                    name={`${gateway.method}_iban`}
                    placeholder="DE89 3704 0044 0532 0130 00"
                    spellCheck={false}
                  />
                </label>
                <label>
                  {c.bicLabel}
                  <input
                    defaultValue={String(gateway.config?.bic ?? "")}
                    name={`${gateway.method}_bic`}
                    placeholder="DEUTDEDB"
                    spellCheck={false}
                  />
                </label>
                <label>
                  {c.referenceInstructions}
                  <input
                    defaultValue={String(gateway.config?.referenceNote ?? "")}
                    name={`${gateway.method}_referenceNote`}
                    placeholder={c.referencePlaceholder}
                  />
                </label>
                <p className={styles.gatewayHint}>
                  {c.bankTransferHint}
                </p>
              </div>
            ) : (
              <div className={styles.gatewayFields}>
                <label>
                  {c.mollieApiKey}
                  <input
                    autoComplete="new-password"
                    defaultValue={String(gateway.config?.apiKey ?? "")}
                    name={`${gateway.method}_apiKey`}
                    placeholder={gateway.config?.mode === "live" ? "live_xxx" : "test_xxx"}
                    type="password"
                  />
                </label>
                <p className={styles.gatewayHint}>{c.mollieHint}</p>
              </div>
            )}

            {result && (
              <div className={result.ok ? styles.gatewayVerified : styles.gatewayError}>
                {result.ok ? "✓" : "✗"} {result.message ?? (result.ok ? c.verified : c.verificationFailed)}
              </div>
            )}
            {!result && verified ? (
              <div className={styles.gatewayVerified}>
                ✓ {c.lastVerified.replace("{date}", new Date(String(verified)).toLocaleDateString("de-DE"))}
              </div>
            ) : null}
          </fieldset>
        );
      })}

      <Button disabled={saving} icon={CreditCard} type="submit">{saving ? c.saving : c.saveVerifyGateways}</Button>
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
        <label>Feature photo URL (optional)<input name="featureImage" onChange={(event) => setFeatureImage(event.target.value)} value={featureImage} /></label>
        <label>Category<input defaultValue={editing?.category ?? editing?.content?.category ?? ""} list="blog-categories" name="category" placeholder="Hosting" required /></label>
        <datalist id="blog-categories">
          {categories.map((category) => <option key={category} value={category} />)}
        </datalist>
        <label>Tags<input defaultValue={(editing?.tags ?? editing?.content?.tags ?? editing?.content?.keywords ?? []).join(", ")} name="tags" placeholder="hosting, email, security" /></label>
        <label><input defaultChecked={editing ? Boolean(editing.publishedAt ?? editing.content?.published) : true} name="published" type="checkbox" /> Published</label>
        <label>Excerpt<input defaultValue={editing?.excerpt ?? ""} name="excerpt" /></label>
        <RichTextEditor initialValue={editing?.content?.body ?? ""} />
        <Button icon={Save} type="submit">{editing ? "Update Article" : "Create Article"}</Button>
        {editing ? <Button type="button" variant="secondary" onClick={() => setEditing(undefined)}>New Post</Button> : null}
        {message ? <p>{message}</p> : null}
      </form>
    </div>
  );
}

export function RichTextEditor({ initialValue }: { initialValue: string }) {
  const c = getDictionary(useLocale()).admin.forms;
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
        placeholder: c.editorPlaceholder
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
    const url = window.prompt(c.linkUrlPrompt, current ?? "https://");
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
      {c.editorContent}
      <input name="content" type="hidden" value={value} />
      <div className={styles.editorShell}>
        <div className={styles.editorToolbar}>
          <button aria-label={c.toolHeading} className={editor?.isActive("heading", { level: 2 }) ? styles.activeTool : ""} type="button" onClick={() => editor?.chain().focus().toggleHeading({ level: 2 }).run()}><Heading2 size={16} /></button>
          <button aria-label={c.toolBold} className={editor?.isActive("bold") ? styles.activeTool : ""} type="button" onClick={() => editor?.chain().focus().toggleBold().run()}><Bold size={16} /></button>
          <button aria-label={c.toolItalic} className={editor?.isActive("italic") ? styles.activeTool : ""} type="button" onClick={() => editor?.chain().focus().toggleItalic().run()}><Italic size={16} /></button>
          <button aria-label={c.toolBulletList} className={editor?.isActive("bulletList") ? styles.activeTool : ""} type="button" onClick={() => editor?.chain().focus().toggleBulletList().run()}><List size={16} /></button>
          <button aria-label={c.toolLink} className={editor?.isActive("link") ? styles.activeTool : ""} type="button" onClick={setLink}><LinkIcon size={16} /></button>
          <button aria-label={c.toolUndo} type="button" onClick={() => editor?.chain().focus().undo().run()}><Undo2 size={16} /></button>
          <button aria-label={c.toolRedo} type="button" onClick={() => editor?.chain().focus().redo().run()}><Redo2 size={16} /></button>
        </div>
        <EditorContent dir="ltr" editor={editor} />
      </div>
    </label>
  );
}

export function DomainPriceForm() {
  const c = getDictionary(useLocale()).admin.forms;
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

    setMessage(await notifyResponse(response, c.domainPriceSaved, c.domainPriceFailed));
  }

  return (
    <form action={submit} className={styles.form}>
      <label>{c.tld}<input name="tld" placeholder="de" required /></label>
      <label>{c.domainAction}
        <select name="action">
          <option value="register">{c.register}</option>
          <option value="transfer">{c.transfer}</option>
          <option value="renew">{c.renew}</option>
        </select>
      </label>
      <label>{c.years}<input defaultValue="1" min="1" name="years" type="number" /></label>
      <label>{c.priceEur}<input name="amount" placeholder={c.priceResellHint} step="0.01" type="number" /></label>
      <label><input defaultChecked name="manual" type="checkbox" /> {c.manualPrice}</label>
      <label><input name="suggested" type="checkbox" /> {c.suggestedTld}</label>
      <Button icon={Save} type="submit">{c.savePrice}</Button>
      {message ? <p>{message}</p> : null}
    </form>
  );
}

export function OrderStatusForm({ orderId, status }: { orderId: string; status: string }) {
  const c = getDictionary(useLocale()).admin.forms;
  const [message, setMessage] = useState("");
  const [value, setValue] = useState(statusLabelValue(status));

  async function submit(formData: FormData) {
    const response = await fetch(`${API_BASE_URL}/orders/${orderId}/status`, {
      body: JSON.stringify({ status: String(formData.get("status") ?? value) }),
      headers: { "Content-Type": "application/json", ...authHeaders() },
      method: "PATCH"
    });

    setMessage(await notifyResponse(response, c.orderStatusSaved, c.orderStatusFailed));
  }

  return (
    <form action={submit} className={styles.inlineForm}>
      <select name="status" value={value} onChange={(event) => setValue(event.target.value)}>
        <option value="completed">{c.statusCompleted}</option>
        <option value="pending">{c.statusPending}</option>
        <option value="canceled">{c.statusCanceled}</option>
      </select>
      <Button type="submit" variant="secondary">{c.save}</Button>
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

function gatewayTitle(method: string, c: Dictionary["admin"]["settingsForm"]) {
  return {
    CREDIT_CARD: c.gatewayCreditCard,
    PAYPAL: c.gatewayPaypal,
    SEPA: c.gatewaySepa
  }[method] ?? method;
}

function gatewayProvider(method: string) {
  if (method === "SANDBOX") {
    return "sandbox";
  }
  return method === "PAYPAL" ? "paypal" : ["CREDIT_CARD", "SEPA"].includes(method) ? "mollie" : "sandbox";
}

export function NewOrderForm({ clients, locale, preselectedClientId, products, vatPercent = 19 }: { clients: ApiClient[]; locale: Locale; preselectedClientId?: string; products: ApiProduct[]; vatPercent?: number }) {
  const c = getDictionary(locale).admin.forms;
  const [message, setMessage] = useState("");
  const [selectedProductId, setSelectedProductId] = useState(products.find((p) => p.type !== "DOMAIN")?.id ?? products[0]?.id ?? "");
  const [selectedPriceId, setSelectedPriceId] = useState(products.find((p) => p.type !== "DOMAIN")?.prices[0]?.id ?? "");
  const [selectedClientId, setSelectedClientId] = useState(preselectedClientId ?? "");
  const [useCustomPricing, setUseCustomPricing] = useState(false);
  const [customAmountEur, setCustomAmountEur] = useState<number>(0);
  const [customBillingCycle, setCustomBillingCycle] = useState("MONTHLY");
  const [applyToRenewals, setApplyToRenewals] = useState(true);
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

  // Compute preview values. All entered/looked-up prices are NET (VAT-excluded); VAT is added on top of
  // every product line — hosting AND domain — mirroring the invoice engine (BillingEngineService.createDraft)
  // so the pricing preview equals the created invoice and order. The discount is billed as its OWN flat
  // line (never distributed into the product lines) and carries NO VAT: a €1 discount reduces the total
  // by exactly €1, while VAT stays computed on the full product lines.
  const baseAmountCents = useCustomPricing ? Math.round(customAmountEur * 100) : (selectedPrice?.amountCents ?? 0);
  const billingCycle = useCustomPricing ? customBillingCycle : (selectedPrice?.billingCycle ?? "MONTHLY");
  const vatRate = vatPercent;
  const domainTld = addDomain && domainNameInput.includes(".") ? domainNameInput.split(".").slice(1).join(".").toLowerCase() : "";
  const domainPriceCents = domainTld ? (domainPriceLookup.get(domainTld) ?? null) : null;
  // The domain always renews yearly on its own cadence, independent of the hosting cycle.
  const domainCycle = domainCycleFor(billingCycle);
  const lineVat = (net: number) => Math.round((net * vatRate) / 100);

  // First invoice: product NET lines + their VAT, minus a flat discount line (capped at the product net).
  const productNetCents = baseAmountCents + (domainPriceCents ?? 0);
  const discountCents = Math.min(productNetCents, discountType !== "none" ? Math.round(discountAmountEur * 100) : 0);
  const subtotalCents = productNetCents - discountCents;
  const vatCents = lineVat(baseAmountCents) + (domainPriceCents !== null ? lineVat(domainPriceCents) : 0);
  const totalCents = subtotalCents + vatCents;

  // Renewals (VAT-inclusive): hosting renews on its cycle keeping any recurring discount (flat, no VAT);
  // the domain renews yearly at full price (recurring discounts attach to the primary product only).
  // The renewal NET mirrors priceItem: the custom price only recurs while "apply to renewals" is ticked —
  // otherwise renewals fall back to the list price matching the custom cycle (first price as last resort,
  // like the backend's configuredPrice fallback).
  const cycleListCents = selectedProduct?.prices.find((p) => p.billingCycle === customBillingCycle)?.amountCents ?? selectedProduct?.prices[0]?.amountCents ?? 0;
  const renewalNetCents = useCustomPricing && !applyToRenewals ? cycleListCents : baseAmountCents;
  const hostingRenewalDiscountCents = discountType === "recurring" ? Math.min(renewalNetCents, Math.round(discountAmountEur * 100)) : 0;
  const hostingRenewalGrossCents = renewalNetCents + lineVat(renewalNetCents) - hostingRenewalDiscountCents;
  const domainRenewalGrossCents = domainPriceCents !== null ? domainPriceCents + lineVat(domainPriceCents) : null;

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
      // The domain line renews yearly on its own cadence — map the hosting cycle to a domain
      // cycle (never monthly) and register the matching domain price so the backend bills it
      // recurringly instead of as a one-off inheriting the hosting cadence.
      const hostingCycle = customPricingOn
        ? String(formData.get("customBillingCycle") ?? "MONTHLY")
        : (product?.prices.find((p) => p.id === priceId)?.billingCycle ?? "MONTHLY");
      const domainCycle = domainCycleFor(hostingCycle);
      const domainPrice =
        defaultDomainProduct.prices.find((p) => p.billingCycle === domainCycle) ??
        defaultDomainProduct.prices.find((p) => p.billingCycle.startsWith("YEAR_")) ??
        defaultDomainProduct.prices[0];
      items.push({
        configuration: { billingCycle: domainCycle, domainAction: String(formData.get("domainAction") ?? "register") },
        domainName: String(formData.get("domainName") ?? ""),
        productId: defaultDomainProduct.id,
        productPriceId: domainPrice?.id,
        quantity: 1
      });
    }
    const discountTypeValue = String(formData.get("discountType") ?? "none");
    const discountCents = Math.round(Number(formData.get("discountAmountEur") ?? 0) * 100);
    const discountFields = discountTypeValue !== "none" && discountCents > 0
      ? { discountAmountCents: discountCents, discountType: discountTypeValue }
      : {};
    const response = await fetch(`${API_BASE_URL}/orders/admin`, {
      body: JSON.stringify({
        ...discountFields,
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
      notify.success(c.orderCreated);
      window.location.assign(surfaceHref(window.location.pathname, "/admin/orders"));
      return;
    }
    setMessage(await notifyResponse(response, c.orderCreated, c.orderCreateFailed));
  }

  return (
    <form action={submit} className={styles.form}>
      <div className={styles.newOrderLayout}>
        <div className={styles.formGrid}>
          <label className={styles.formSpan2}>
            {c.client}
            <select defaultValue={preselectedClientId ?? ""} name="userId" required onChange={(e) => setSelectedClientId(e.target.value)}>
              <option value="">{c.selectClient}</option>
              {clients.map((client) => (
                <option key={client.id} value={client.id}>{client.name} ({client.email})</option>
              ))}
            </select>
          </label>
          <label className={styles.formSpan2}>
            {c.product}
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
            <span><input checked={useCustomPricing} name="useCustomPricing" type="checkbox" onChange={(e) => setUseCustomPricing(e.target.checked)} /> {c.useCustomPricing}</span>
          </label>

          {!useCustomPricing ? (
            <label className={styles.formSpan2}>
              {c.pricingPlan}
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
                {c.customPrice}
                <input min="0" name="customAmountEur" placeholder="0.00" step="0.01" type="number" value={customAmountEur || ""} onChange={(e) => setCustomAmountEur(Number(e.target.value) || 0)} />
              </label>
              <label>
                {c.billingCycle}
                <select name="customBillingCycle" value={customBillingCycle} onChange={(e) => setCustomBillingCycle(e.target.value)}>
                  {["MONTHLY", "QUARTERLY", "SEMI_ANNUAL", "YEAR_1", "ONE_TIME"].map((cyc) => (
                    <option key={cyc} value={cyc}>{cycleLabel(cyc, locale)}</option>
                  ))}
                </select>
              </label>
              <label className={styles.formSpan2}>
                <span><input checked={applyToRenewals} name="applyToRenewals" type="checkbox" onChange={(e) => setApplyToRenewals(e.target.checked)} /> {c.applyToRenewals}</span>
              </label>
            </>
          )}

          <label>
            {c.domainName}
            <input name="domainName" placeholder="example.com" value={domainNameInput} onChange={(e) => setDomainNameInput(e.target.value)} />
          </label>
          <label>
            {c.domainAction}
            <select name="domainAction">
              <option value="register">{c.register}</option>
              <option value="transfer">{c.transfer}</option>
            </select>
          </label>

          <label className={styles.formSpan2}>
            {c.orderDateLabel}
            <input defaultValue={datetimeLocal(new Date().toISOString())} name="placedAt" type="datetime-local" />
          </label>
          <label className={styles.formSpan2}>
            {c.firstDueDate}
            <input name="firstDueAt" type="date" defaultValue={new Date(Date.now() + 7 * 86400_000).toISOString().slice(0, 10)} />
          </label>

          <label className={styles.formSpan2}>
            {c.discount}
            <select name="discountType" value={discountType} onChange={(e) => setDiscountType(e.target.value as "none" | "one-time" | "recurring")}>
              <option value="none">{c.discountNone}</option>
              <option value="one-time">{c.discountOneTime}</option>
              <option value="recurring">{c.discountRecurring}</option>
            </select>
          </label>
          {discountType !== "none" ? (
            <label className={styles.formSpan2}>
              {c.discountAmount}
              <input min="0" name="discountAmountEur" placeholder="0.00" step="0.01" type="number" value={discountAmountEur || ""} onChange={(e) => setDiscountAmountEur(Number(e.target.value) || 0)} />
            </label>
          ) : null}

          <label className={styles.formSpan2}>
            <span><input checked={addDomain} name="addDomain" type="checkbox" onChange={(e) => setAddDomain(e.target.checked)} /> {c.addDomainToOrder}</span>
          </label>
          <label className={styles.formSpan2}>
            {c.notesInternal}
            <textarea name="notes" rows={2} placeholder={c.notesPlaceholder} />
          </label>
          <label className={styles.formSpan2}>
            <span><input name="skipEmail" type="checkbox" /> {c.disableOrderEmail}</span>
          </label>
          <label className={styles.formSpan2}>
            <span><input name="runModules" type="checkbox" /> {c.runModulesOnCreate}</span>
          </label>
        </div>

        {/* Order preview */}
        <div className={styles.orderPreview}>
          <h3>{c.orderPreview}</h3>
          {selectedClient ? <p className={styles.orderPreviewClient}>{selectedClient.name}<br /><span>{selectedClient.email}</span></p> : <p className={styles.orderPreviewClient}>{c.noClientSelected}</p>}
          {selectedProduct ? (
            <div className={styles.orderPreviewLines}>
              <div className={styles.orderPreviewRow}>
                <span>{selectedProduct.name}</span>
                <span>{cycleLabel(billingCycle, locale)}</span>
              </div>
              <div className={styles.orderPreviewRow}>
                <span>{c.basePrice} <span style={{ color: "var(--muted)", fontSize: "0.78rem" }}>{c.exclVat}</span></span>
                <strong>{money(baseAmountCents, "EUR", locale)}</strong>
              </div>
              {addDomain ? (
                <div className={styles.orderPreviewRow}>
                  <span>Domain (.{domainTld || "?"}) · {cycleLabel(domainCycle, locale)} <span style={{ color: "var(--muted)", fontSize: "0.78rem" }}>{c.exclVat}</span></span>
                  {domainPriceLoading ? (
                    <span style={{ color: "var(--muted)", fontSize: "0.82rem" }}>…</span>
                  ) : domainPriceCents !== null ? (
                    <strong>{money(domainPriceCents, "EUR", locale)}</strong>
                  ) : (
                    <span style={{ color: "var(--muted)", fontSize: "0.82rem" }}>{domainTld ? c.domainPriceUnknown : c.enterDomain}</span>
                  )}
                </div>
              ) : null}
              {discountCents > 0 ? (
                <div className={styles.orderPreviewRow}>
                  <span>{c.discount} {discountType === "recurring" ? c.discountRecurringTag : c.discountOnceTag}</span>
                  <span>− {money(discountCents, "EUR", locale)}</span>
                </div>
              ) : null}
              {vatPercent > 0 ? <div className={styles.orderPreviewRow}><span>{c.vat} ({vatPercent}%)</span><span>{money(vatCents, "EUR", locale)}</span></div> : null}
              <hr style={{ border: "none", borderTop: "1px solid var(--border)", margin: "6px 0" }} />
              <div className={styles.orderPreviewTotal}>
                <span>{c.firstInvoiceTotal}</span>
                <strong>{money(Math.max(0, totalCents), "EUR", locale)}</strong>
              </div>
              {billingCycle !== "ONE_TIME" ? (
                <div className={styles.orderPreviewRenewal}>
                  <span>{c.nextRenewal} <span style={{ fontSize: "0.78rem" }}>{c.inclVat}</span></span>
                  <span>{money(hostingRenewalGrossCents, "EUR", locale)} / {cycleLabel(billingCycle, locale)}</span>
                </div>
              ) : null}
              {addDomain && domainRenewalGrossCents !== null ? (
                <div className={styles.orderPreviewRenewal}>
                  <span>{c.domainRenewal} <span style={{ fontSize: "0.78rem" }}>{c.inclVat}</span></span>
                  <span>{money(domainRenewalGrossCents, "EUR", locale)} / {cycleLabel(domainCycle, locale)}</span>
                </div>
              ) : null}
            </div>
          ) : <p style={{ color: "var(--muted)", fontSize: "0.88rem" }}>{c.selectProductPreview}</p>}
        </div>
      </div>

      <div className={styles.formActions}>
        <Button icon={Package} type="submit">{c.createOrder}</Button>
      </div>
      {message ? <p className={styles.formMessage}>{message}</p> : null}
    </form>
  );
}

export function AdminPdfDownloadButton({ invoiceId, invoiceNumber }: { invoiceId: string; invoiceNumber: string }) {
  const locale = useLocale();
  const c = getDictionary(locale).admin.forms;
  async function download() {
    // Render the PDF in the admin's display language so it matches the on-screen invoice.
    const response = await fetch(`${API_BASE_URL}/billing/invoices/${invoiceId}/pdf?locale=${locale}`, { headers: authHeaders() });
    if (!response.ok) {
      notify.error(c.pdfDownloadFailed);
      return;
    }
    const blob = await response.blob();
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `invoice-${invoiceNumber}.pdf`;
    link.click();
    URL.revokeObjectURL(url);
    notify.success(c.pdfReady);
  }
  return <Button type="button" variant="secondary" onClick={download}>{c.downloadPdf}</Button>;
}

type LineItem = { id: number };

export function AdminClientActions({ client }: { client: ApiClient }) {
  const c = getDictionary(useLocale()).admin.forms;
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
    const msg = await notifyResponse(response, c.emailSent, c.emailSendFailed);
    setEmailMsg(msg);
    if (response.ok) closeModal();
  }

  async function sendCustomEmail() {
    if (!customSubject.trim() || !customBody.trim()) {
      setEmailMsg(c.subjectBodyRequired);
      return;
    }
    const response = await fetch(`${API_BASE_URL}/admin/dev/emails/users/${client.id}/send-custom`, {
      body: JSON.stringify({ body: customBody, subject: customSubject }),
      headers: { "Content-Type": "application/json", ...authHeaders() },
      method: "POST"
    });
    const msg = await notifyResponse(response, c.emailSent, c.emailSendFailed);
    setEmailMsg(msg);
    if (response.ok) closeModal();
  }

  async function sendWelcomeEmail() {
    const response = await fetch(`${API_BASE_URL}/admin/dev/emails/users/${client.id}/send-event`, {
      body: JSON.stringify({ eventKey: "welcome" }),
      headers: { "Content-Type": "application/json", ...authHeaders() },
      method: "POST"
    });
    const msg = await notifyResponse(response, c.welcomeEmailSent, c.welcomeEmailFailed);
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
    const msg = await notifyResponse(response, c.profileSaved, c.profileSaveFailed);
    setProfileMsg(msg);
    if (response.ok) closeModal();
  }

  async function changePassword(formData: FormData) {
    const newPassword = String(formData.get("newPassword") ?? "");
    const confirmPassword = String(formData.get("confirmPassword") ?? "");
    if (newPassword !== confirmPassword) {
      setPwMsg(c.passwordsNoMatch);
      return;
    }
    const response = await fetch(`${API_BASE_URL}/users/${client.id}`, {
      body: JSON.stringify({ newPassword }),
      headers: { "Content-Type": "application/json", ...authHeaders() },
      method: "PATCH"
    });
    const msg = await notifyResponse(response, c.passwordChanged, c.passwordChangeFailed);
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
        status: "PENDING",
        userId: client.id
      }),
      headers: { "Content-Type": "application/json", ...authHeaders() },
      method: "POST"
    });
    if (response.ok) {
      notify.success(c.invoiceCreated);
      window.location.reload();
      return;
    }
    setInvoiceMsg(await notifyResponse(response, c.invoiceCreated, c.invoiceCreateFailed));
  }

  async function handleDelete() {
    const confirmed = window.confirm(c.deleteClientConfirm.replace("{name}", client.name));
    if (!confirmed) return;
    const response = await fetch(`${API_BASE_URL}/users/${client.id}`, { headers: authHeaders(), method: "DELETE" });
    if (response.ok) {
      notify.success(c.clientDeleted);
      window.location.assign(surfaceHref(window.location.pathname, "/admin/clients"));
    } else {
      notify.error(c.clientDeleteFailed);
    }
  }

  return (
    <>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <Button type="button" onClick={() => setOpen("profile")}>{c.editProfile}</Button>
        <Button type="button" variant="secondary" onClick={() => setOpen("password")}>{c.changePassword}</Button>
        <Button type="button" variant="secondary" onClick={() => setOpen("invoice")}>{c.createInvoice}</Button>
        <Button type="button" variant="secondary" onClick={sendWelcomeEmail}>{c.sendWelcomeEmail}</Button>
        <Button type="button" variant="secondary" onClick={openSendEmail}>{c.sendEmail}</Button>
        <Button icon={Trash2} type="button" variant="ghost" onClick={handleDelete}>{c.deleteClient}</Button>
      </div>

      {open ? (
        <div className={styles.modalBackdrop} onClick={(e) => e.target === e.currentTarget && closeModal()}>
          <div className={styles.modal}>
            <div className={styles.modalHead}>
              <strong>
                {open === "profile" ? c.editProfile : open === "password" ? c.changePassword : open === "invoice" ? c.createInvoice : open === "welcome-email" ? c.sendWelcomeEmail : c.sendEmail}
              </strong>
              <button className={styles.modalClose} type="button" onClick={closeModal}>✕</button>
            </div>

            {open === "profile" ? (
              <form action={saveProfile} className={styles.form}>
                <div className={styles.formGrid}>
                  <label>{c.name}<input defaultValue={client.name} name="name" required /></label>
                  <label>{c.email}<input defaultValue={client.email} name="email" required type="email" /></label>
                  <label>{c.customerType}
                    <select defaultValue={client.customerType} name="customerType">
                      <option value="INDIVIDUAL">{c.individual}</option>
                      <option value="BUSINESS">{c.business}</option>
                    </select>
                  </label>
                  <label>{c.country}<input defaultValue={client.countryCode ?? "DE"} name="countryCode" /></label>
                  <label>{c.vatId}<input defaultValue={client.vatId ?? ""} name="vatId" /></label>
                  <label>{c.phone}<input defaultValue={contact?.phone ?? ""} name="phone" /></label>
                  <label>{c.address}<input defaultValue={address.line1 ?? ""} name="address" /></label>
                  <label>{c.zip}<input defaultValue={address.postalCode ?? ""} name="postalCode" /></label>
                  <label>{c.city}<input defaultValue={address.city ?? ""} name="city" /></label>
                  <label className={styles.formSpan2}>{c.stateRegion}<input defaultValue={address.state ?? ""} name="state" /></label>
                </div>
                <div className={styles.formActions}>
                  <Button icon={Save} type="submit">{c.saveProfile}</Button>
                  <Button type="button" variant="secondary" onClick={closeModal}>{c.cancel}</Button>
                </div>
                {profileMsg ? <p className={styles.formMessage}>{profileMsg}</p> : null}
              </form>
            ) : null}

            {open === "password" ? (
              <form action={changePassword} className={styles.form}>
                <div className={styles.formGrid}>
                  <label>{c.newPassword}<input name="newPassword" required type="password" placeholder={c.newPassword} /></label>
                  <label>{c.confirmPassword}<input name="confirmPassword" required type="password" placeholder={c.confirmPassword} /></label>
                </div>
                <div className={styles.formActions}>
                  <Button icon={Save} type="submit">{c.setPassword}</Button>
                  <Button type="button" variant="secondary" onClick={closeModal}>{c.cancel}</Button>
                </div>
                {pwMsg ? <p className={styles.formMessage}>{pwMsg}</p> : null}
              </form>
            ) : null}

            {open === "invoice" ? (
              <form action={createInvoice} className={styles.form}>
                <div className={styles.formGrid}>
                  <label className={styles.formSpan2}>
                    {c.dueDate}
                    <input name="dueAt" type="date" defaultValue={new Date(Date.now() + 7 * 86400_000).toISOString().slice(0, 10)} />
                  </label>
                </div>
                {lines.map((line, index) => (
                  <fieldset className={`${styles.lineEditor} ${styles.formSpan2}`} key={line.id}>
                    <legend>{c.line.replace("{n}", String(index + 1))}</legend>
                    <div className={styles.formGrid}>
                      <label className={styles.formSpan2}>{c.description}<input defaultValue={index === 0 ? c.manualService : ""} name="description" required /></label>
                      <label>{c.billingCycle}
                        <select defaultValue="ONE_TIME" name="billingCycle">
                          <option value="ONE_TIME">{c.cycleOneTime}</option>
                          <option value="MONTHLY">{c.cycleMonthly}</option>
                          <option value="YEAR_1">{c.cycleAnnually}</option>
                        </select>
                      </label>
                      <label>{c.quantity}<input defaultValue="1" min="1" name="quantity" type="number" /></label>
                      <label>{c.amountEur}<input defaultValue="0" min="0" name="amount" step="0.01" type="number" /></label>
                      <label>{c.vatRatePct}<input defaultValue="19" min="0" name="vatRate" step="0.01" type="number" /></label>
                    </div>
                  </fieldset>
                ))}
                <button
                  className={styles.addLineLink}
                  type="button"
                  onClick={() => setLines((prev) => [...prev, { id: Date.now() }])}
                >
                  {c.addAnotherLine}
                </button>
                <div className={styles.formActions}>
                  <Button icon={FileText} type="submit">{c.createInvoice}</Button>
                  <Button type="button" variant="secondary" onClick={closeModal}>{c.cancel}</Button>
                </div>
                {invoiceMsg ? <p className={styles.formMessage}>{invoiceMsg}</p> : null}
              </form>
            ) : null}

            {open === "send-email" ? (
              <div className={styles.form}>
                <div className={styles.formGrid}>
                  <label className={styles.formSpan2}>
                    {c.template}
                    <select value={selectedEventKey} onChange={(e) => {
                      const key = e.target.value;
                      setSelectedEventKey(key);
                      const event = emailEvents.find((ev) => ev.key === key);
                      if (event) setCustomSubject(event.subject);
                    }}>
                      {emailEvents.map((ev) => <option key={ev.key} value={ev.key}>{ev.key} — {ev.subject}</option>)}
                      {emailEvents.length === 0 && <option value="">{c.loadingEllipsis}</option>}
                    </select>
                  </label>
                  <label className={styles.formSpan2}>
                    {c.subject}
                    <input value={customSubject} onChange={(e) => setCustomSubject(e.target.value)} placeholder={c.subjectLine} />
                  </label>
                  <label className={styles.formSpan2}>
                    {c.bodyHtml}
                    <textarea value={customBody} onChange={(e) => setCustomBody(e.target.value)} rows={8} placeholder={c.bodyPlaceholder} />
                  </label>
                </div>
                <div className={styles.formActions}>
                  <Button type="button" onClick={sendEventEmail}>{c.sendUsingTemplate}</Button>
                  <Button type="button" variant="secondary" onClick={sendCustomEmail}>{c.sendCustom}</Button>
                  <Button type="button" variant="secondary" onClick={closeModal}>{c.cancel}</Button>
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

function adminRoles(c: Dictionary["admin"]["settingsForm"]) {
  return [
    { slug: "super_admin", name: c.roleSuperAdmin, description: c.roleDescSuperAdmin },
    { slug: "support_agent", name: c.roleSupportAgent, description: c.roleDescSupportAgent },
    { slug: "sales_agent", name: c.roleSalesAgent, description: c.roleDescSalesAgent }
  ];
}

function adminRoleLabel(user: AdminUser) {
  const adminSlugs = ["admin", "super_admin", "support_agent", "sales_agent"];
  const role = user.userRoles.find((ur) => adminSlugs.includes(ur.role.slug));
  return role?.role.name ?? role?.role.slug ?? "Unknown";
}

export function AdminsPanel() {
  const dict = getDictionary(useLocale()).admin;
  const c = dict.settingsForm;
  const f = dict.forms;
  const ADMIN_ROLES = adminRoles(c);
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
      notify.success(c.adminCreated);
      setShowAdd(false);
      void reload();
    } else {
      const data = await res.json().catch(() => ({})) as { message?: string };
      notify.error(data.message ?? c.adminCreateFailed);
    }
  }

  async function updateRole(id: string) {
    const res = await fetch(`${API_BASE_URL}/admin/dev/admins/${id}/role`, {
      method: "PATCH",
      headers: { ...authHeaders("admin"), "Content-Type": "application/json" },
      body: JSON.stringify({ roleSlug: editRole })
    });
    if (res.ok) {
      notify.success(c.roleUpdated);
      setEditId(null);
      void reload();
    } else {
      notify.error(c.roleUpdateFailed);
    }
  }

  async function updatePassword(id: string) {
    if (editPassword.length < 12) {
      notify.error(c.pwTooShort);
      return;
    }
    const res = await fetch(`${API_BASE_URL}/admin/dev/admins/${id}/password`, {
      method: "PATCH",
      headers: { ...authHeaders("admin"), "Content-Type": "application/json" },
      body: JSON.stringify({ password: editPassword })
    });
    if (res.ok) {
      notify.success(c.pwUpdated);
      setEditPassword("");
      void reload();
    } else {
      notify.error(c.pwUpdateFailed);
    }
  }

  async function deleteAdmin(id: string, name: string) {
    if (!window.confirm(c.deleteAdminConfirm.replace("{name}", name))) return;
    const res = await fetch(`${API_BASE_URL}/admin/dev/admins/${id}`, {
      method: "DELETE",
      headers: authHeaders("admin")
    });
    if (res.ok) {
      notify.success(c.adminDeleted);
      void reload();
    } else {
      const data = await res.json().catch(() => ({})) as { message?: string };
      notify.error(data.message ?? c.adminDeleteFailed);
    }
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "24px" }}>
      {/* Role reference table */}
      <section className={styles.panel}>
        <div className={styles.panelHeader}>
          <div>
            <span className="eyebrow">{c.accessControl}</span>
            <h2>{c.adminRolesHeading}</h2>
          </div>
        </div>
        <table className="table">
          <thead>
            <tr>
              <th>{c.colRole}</th>
              <th>{c.colDescription}</th>
              <th>{c.colSettingsAccess}</th>
              <th>{c.colTicketAccess}</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td><strong>{c.roleSuperAdmin}</strong></td>
              <td>{c.roleSuperAdminDesc}</td>
              <td>✓ {c.accessYes}</td>
              <td>{c.allDepartments}</td>
            </tr>
            <tr>
              <td><strong>{c.roleSupportAgent}</strong></td>
              <td>{c.roleSupportAgentDesc}</td>
              <td>✕ {c.accessNo}</td>
              <td>{c.supportAbuse}</td>
            </tr>
            <tr>
              <td><strong>{c.roleSalesAgent}</strong></td>
              <td>{c.roleSalesAgentDesc}</td>
              <td>✕ {c.accessNo}</td>
              <td>{c.salesOnly}</td>
            </tr>
          </tbody>
        </table>
      </section>

      {/* Admin users */}
      <section className={styles.panel}>
        <div className={styles.panelHeader}>
          <div>
            <span className="eyebrow">{c.adminAccounts}</span>
            <h2>{c.adminAccounts}</h2>
          </div>
          <Button onClick={() => setShowAdd((v) => !v)} variant={showAdd ? "secondary" : "primary"}>
            {showAdd ? c.cancel : c.addAdmin}
          </Button>
        </div>

        {showAdd ? (
          <form action={createAdmin} style={{ display: "flex", flexDirection: "column", gap: "12px", padding: "16px", background: "var(--surface-2)", borderRadius: "8px", marginBottom: "16px" }}>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
              <label style={{ display: "flex", flexDirection: "column", gap: "4px", fontSize: "0.875rem" }}>
                {f.name}
                <input className="input" name="name" required placeholder={c.fullNamePlaceholder} />
              </label>
              <label style={{ display: "flex", flexDirection: "column", gap: "4px", fontSize: "0.875rem" }}>
                {f.email}
                <input className="input" name="email" required type="email" placeholder="admin@example.com" />
              </label>
              <label style={{ display: "flex", flexDirection: "column", gap: "4px", fontSize: "0.875rem" }}>
                {c.pwMin12}
                <input className="input" name="password" required type="password" minLength={12} />
              </label>
              <label style={{ display: "flex", flexDirection: "column", gap: "4px", fontSize: "0.875rem" }}>
                {c.createAdminRole}
                <select className="input" name="roleSlug" required>
                  {ADMIN_ROLES.map((r) => (
                    <option key={r.slug} value={r.slug}>{r.name} — {r.description}</option>
                  ))}
                </select>
              </label>
            </div>
            <Button type="submit">{c.createAdmin}</Button>
          </form>
        ) : null}

        {loading ? <p style={{ padding: "16px", color: "var(--muted)" }}>{c.loadingEllipsis}</p> : (
          <table className="table">
            <thead>
              <tr>
                <th>{f.name}</th>
                <th>{f.email}</th>
                <th>{c.colRole}</th>
                <th>{c.colCreated}</th>
                <th>{c.colActions}</th>
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
                        <Button size="sm" onClick={() => updateRole(admin.id)}>{c.saveRole}</Button>
                        <input
                          className="input"
                          type="password"
                          placeholder={c.newPasswordPlaceholder}
                          value={editPassword}
                          onChange={(e) => setEditPassword(e.target.value)}
                          style={{ fontSize: "0.8rem", width: "140px" }}
                        />
                        <Button size="sm" variant="secondary" onClick={() => updatePassword(admin.id)}>{c.setPw}</Button>
                        <Button size="sm" variant="secondary" onClick={() => { setEditId(null); setEditPassword(""); }}>{c.cancel}</Button>
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
                          {c.edit}
                        </Button>
                        <Button size="sm" variant="secondary" onClick={() => deleteAdmin(admin.id, admin.name)}>
                          {c.delete}
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

export function SeoSettingsForm() {
  const c = getDictionary(useLocale()).admin.settingsForm;
  const [message, setMessage] = useState("");
  const [s, setS] = useState({
    siteName: "Teculiar",
    metaDescription: "",
    blogMetaDescription: "",
    ogTitleSuffix: "| Teculiar",
    ogImageStatic: "",
    ogImageDashboard: "",
    ogImageBlog: ""
  });

  useEffect(() => {
    void fetch(`${API_BASE_URL}/admin/dev/seo-settings`, { headers: authHeaders() })
      .then((r) => r.json())
      .then((p) => setS({
        siteName: p.siteName || "Teculiar",
        metaDescription: p.metaDescription || "",
        blogMetaDescription: p.blogMetaDescription || "",
        ogTitleSuffix: p.ogTitleSuffix || "| Teculiar",
        ogImageStatic: p.ogImageStatic || "",
        ogImageDashboard: p.ogImageDashboard || "",
        ogImageBlog: p.ogImageBlog || ""
      }))
      .catch(() => undefined);
  }, []);

  async function submit(formData: FormData) {
    const response = await fetch(`${API_BASE_URL}/admin/dev/seo-settings`, {
      body: JSON.stringify({
        siteName: String(formData.get("siteName") ?? "Teculiar"),
        metaDescription: String(formData.get("metaDescription") ?? ""),
        blogMetaDescription: String(formData.get("blogMetaDescription") ?? ""),
        ogTitleSuffix: String(formData.get("ogTitleSuffix") ?? "| Teculiar"),
        ogImageStatic: s.ogImageStatic,
        ogImageDashboard: s.ogImageDashboard,
        ogImageBlog: s.ogImageBlog
      }),
      headers: { "Content-Type": "application/json", ...authHeaders() },
      method: "PATCH"
    });
    setMessage(await notifyResponse(response, c.seoSettingsSaved, c.saveFailed));
  }

  return (
    <form action={submit} className={styles.form}>
      <p style={{ color: "var(--muted)", fontSize: "0.88rem", margin: 0, lineHeight: 1.6 }}>
        {c.seoIntro}
      </p>

      <h3>{c.siteIdentity}</h3>
      <p style={{ color: "var(--muted)", fontSize: "0.84rem", margin: "-4px 0 0" }} dangerouslySetInnerHTML={{ __html: c.siteIdentityHint.replace("<title>", "&lt;title&gt;") }} />
      <label>
        {c.siteName}
        <input value={s.siteName} name="siteName" placeholder="Teculiar" onChange={(e) => setS({ ...s, siteName: e.target.value })} />
      </label>
      <label>
        {c.titleSuffix}
        <input value={s.ogTitleSuffix} name="ogTitleSuffix" placeholder="| Teculiar" onChange={(e) => setS({ ...s, ogTitleSuffix: e.target.value })} />
      </label>

      <h3>{c.metaDescriptions}</h3>
      <p style={{ color: "var(--muted)", fontSize: "0.84rem", margin: "-4px 0 0" }}>
        {c.metaHint}
      </p>
      <label>
        {c.metaStatic}
        <textarea
          value={s.metaDescription}
          name="metaDescription"
          rows={3}
          maxLength={160}
          placeholder="Teculiar – ethical web hosting and IT services from Germany. Fair prices, personal support, full GDPR compliance. For associations, NGOs, and small businesses."
          onChange={(e) => setS({ ...s, metaDescription: e.target.value })}
        />
        <small style={{ color: "var(--muted)" }}>{c.charsCount.replace("{n}", String(s.metaDescription.length))}</small>
      </label>
      <label>
        {c.blogPosts}
        <textarea
          value={s.blogMetaDescription}
          name="blogMetaDescription"
          rows={3}
          maxLength={160}
          placeholder="Articles about web hosting, domains, privacy and digital tools for associations and small organisations. Written clearly, without expertise required."
          onChange={(e) => setS({ ...s, blogMetaDescription: e.target.value })}
        />
        <small style={{ color: "var(--muted)" }}>{c.charsCount.replace("{n}", String(s.blogMetaDescription.length))}</small>
      </label>

      <h3>{c.ogImagesHeading}</h3>
      <p style={{ color: "var(--muted)", fontSize: "0.84rem", margin: "-4px 0 0", lineHeight: 1.6 }}>
        {c.ogIntro}
      </p>
      <ImageUploader
        accept="image/png,image/jpeg,image/webp,image/svg+xml"
        action={`${API_BASE_URL}/admin/dev/assets/og-image`}
        extraFields={{ type: "static" }}
        headers={authHeaders()}
        label={c.ogStatic}
        onUploaded={(payload) => setS({ ...s, ogImageStatic: String(payload.imageUrl ?? "") })}
        previewUrl={s.ogImageStatic}
      />
      <ImageUploader
        accept="image/png,image/jpeg,image/webp,image/svg+xml"
        action={`${API_BASE_URL}/admin/dev/assets/og-image`}
        extraFields={{ type: "dashboard" }}
        headers={authHeaders()}
        label={c.ogDashboards}
        onUploaded={(payload) => setS({ ...s, ogImageDashboard: String(payload.imageUrl ?? "") })}
        previewUrl={s.ogImageDashboard}
      />
      <ImageUploader
        accept="image/png,image/jpeg,image/webp,image/svg+xml"
        action={`${API_BASE_URL}/admin/dev/assets/og-image`}
        extraFields={{ type: "blog" }}
        headers={authHeaders()}
        label={c.ogBlog}
        onUploaded={(payload) => setS({ ...s, ogImageBlog: String(payload.imageUrl ?? "") })}
        previewUrl={s.ogImageBlog}
      />

      <Button icon={Save} type="submit">{c.saveSeoSettings}</Button>
      {message ? <p>{message}</p> : null}
    </form>
  );
}
