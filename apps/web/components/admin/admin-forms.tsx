"use client";

import { Bell, CreditCard, FileText, Package, Plus, Save, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";
import { API_BASE_URL, authHeaders, money, type ApiBlogPost, type ApiClient, type ApiInvoice, type ApiProduct } from "../../lib/api";
import { Button } from "../ui/button";
import styles from "./admin-dashboard.module.css";

export function ClientManager({ clients, products }: { clients: ApiClient[]; products: ApiProduct[] }) {
  const [message, setMessage] = useState("");

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
        phone: String(formData.get("phone") ?? ""),
        vatId: String(formData.get("vatId") ?? "")
      }),
      headers: { "Content-Type": "application/json", ...authHeaders() },
      method: "POST"
    });
    setMessage(response.ok ? "Client created. Refresh to see latest list." : await response.text());
  }

  return (
    <div>
      <form action={createClient} className={styles.form}>
        <h3>Create Client</h3>
        <label>Name<input name="name" required /></label>
        <label>Email<input name="email" required type="email" /></label>
        <label>Password<input name="password" required type="text" /></label>
        <label>Customer type<select name="customerType"><option value="INDIVIDUAL">Individual</option><option value="BUSINESS">Business</option></select></label>
        <label>Country<input defaultValue="DE" name="countryCode" /></label>
        <label>VAT ID<input name="vatId" /></label>
        <label>Phone<input name="phone" /></label>
        <label>Address<input name="address" /></label>
        <label>ZIP<input name="postalCode" /></label>
        <label>City<input name="city" /></label>
        <label>State<input name="state" /></label>
        <Button icon={Save} type="submit">Create Client</Button>
        {message ? <p>{message}</p> : null}
      </form>
      <div className={styles.clientList}>
        {clients.map((client) => (
          <ClientRow client={client} key={client.id} products={products} />
        ))}
      </div>
    </div>
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
    setMessage(response.ok ? "Client saved." : await response.text());
  }

  async function deleteClient() {
    const response = await fetch(`${API_BASE_URL}/users/${client.id}`, { headers: authHeaders(), method: "DELETE" });
    setMessage(response.ok ? "Client deleted. Refresh to update list." : await response.text());
  }

  async function createInvoice(formData: FormData) {
    const response = await fetch(`${API_BASE_URL}/billing/invoices`, {
      body: JSON.stringify({
        buyerCountryCode: client.countryCode ?? "DE",
        buyerVatId: client.vatId ?? undefined,
        customerSnapshot: {
          address,
          countryCode: client.countryCode,
          customerType: client.customerType,
          email: client.email,
          name: client.name,
          phone: contact?.phone,
          vatId: client.vatId
        },
        dueAt: new Date(Date.now() + 7 * 86400_000).toISOString(),
        isBusinessCustomer: client.customerType === "BUSINESS",
        lines: [{
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
    setMessage(response.ok ? "Invoice created." : await response.text());
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
    const response = await fetch(`${API_BASE_URL}/orders/admin`, {
      body: JSON.stringify({ items, notes: String(formData.get("notes") ?? ""), userId: client.id }),
      headers: { "Content-Type": "application/json", ...authHeaders() },
      method: "POST"
    });
    setMessage(response.ok ? "Order created with unpaid invoice and pending items." : await response.text());
  }

  return (
    <details className={styles.clientRow}>
      <summary>
        <strong>{client.name}</strong>
        <a href={`/admin/clients/${client.id}`}>Open</a>
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
    setMessage(response.ok ? "Order created." : await response.text());
  }

  async function createInvoice(formData: FormData) {
    const descriptions = formData.getAll("description").map(String).filter(Boolean);
    const lines = descriptions.map((description, index) => ({
      billingCycle: String(formData.getAll("billingCycle")[index] ?? "one_time"),
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
        customerSnapshot: { address, countryCode: client.countryCode, customerType: client.customerType, email: client.email, name: client.name, phone: contact?.phone, vatId: client.vatId },
        dueAt: new Date(Date.now() + 7 * 86400_000).toISOString(),
        isBusinessCustomer: client.customerType === "BUSINESS",
        lines,
        status: "UNPAID",
        userId: client.id
      }),
      headers: { "Content-Type": "application/json", ...authHeaders() },
      method: "POST"
    });
    setMessage(response.ok ? "Invoice created." : await response.text());
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
              <label>Billing cycle<select defaultValue="one_time" name="billingCycle"><option value="one_time">One time</option><option value="monthly">Monthly</option><option value="annually">Annually</option></select></label>
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

  async function markPaid() {
    const response = await fetch(`${API_BASE_URL}/billing/invoices/${invoice.id}/mark-paid`, {
      body: JSON.stringify({}),
      headers: { "Content-Type": "application/json", ...authHeaders() },
      method: "POST"
    });
    setMessage(response.ok ? "Marked paid. Refresh to see lifecycle changes." : await response.text());
  }

  async function markUnpaid() {
    const response = await fetch(`${API_BASE_URL}/billing/invoices/${invoice.id}/mark-unpaid`, {
      body: JSON.stringify({ reason: "Admin manual change" }),
      headers: { "Content-Type": "application/json", ...authHeaders() },
      method: "POST"
    });
    setMessage(response.ok ? "Marked unpaid. Services were not terminated." : await response.text());
  }

  async function deleteInvoice() {
    const response = await fetch(`${API_BASE_URL}/billing/invoices/${invoice.id}`, {
      headers: authHeaders(),
      method: "DELETE"
    });
    setMessage(response.ok ? "Invoice deleted. Refresh to update list." : await response.text());
  }

  return (
    <div>
      <div className={styles.inlineForm}>
        {invoice.status !== "PAID" ? <Button icon={CreditCard} type="button" onClick={markPaid}>Mark Paid</Button> : null}
        {invoice.status === "PAID" ? <Button icon={CreditCard} type="button" variant="secondary" onClick={markUnpaid}>Mark Unpaid</Button> : null}
        <Button icon={Trash2} type="button" variant="secondary" onClick={deleteInvoice}>Delete</Button>
      </div>
      {message ? <small>{message}</small> : null}
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
    setMessage(response.ok ? "Service status saved." : await response.text());
  }

  return (
    <form action={submit} className={styles.inlineForm}>
      <select defaultValue={status} name="status">
        {["PENDING", "ORDERED", "PROVISIONING", "ACTIVE", "SUSPENDED", "CANCELLED", "TERMINATED", "FAILED"].map((value) => <option key={value}>{value}</option>)}
      </select>
      <Button icon={Save} type="submit">Save Status</Button>
      {message ? <span>{message}</span> : null}
    </form>
  );
}

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
    invoiceBankDetails: "",
    invoiceCompanyAddress: "",
    invoiceCompanyCity: "",
    invoiceCompanyCountry: "DE",
    invoiceCompanyEmail: "",
    invoiceCompanyName: "",
    invoiceCompanyPhone: "",
    invoiceCompanyZip: "",
    invoiceDaysAhead: 7,
    invoiceFooterLine1: "",
    invoiceFooterLine2: "",
    invoiceFooterLine3: "",
    invoicePaymentInstructions: "",
    invoiceVatNumber: "",
    ticketAutoCloseHours: 24,
    vatPercent: 19
  });

  useEffect(() => {
    void fetch(`${API_BASE_URL}/admin/dev/billing/settings`, { headers: authHeaders() })
      .then((response) => response.json())
      .then((payload) => setSettings({
        invoiceBankDetails: payload.invoiceBankDetails ?? "",
        invoiceCompanyAddress: payload.invoiceCompanyAddress ?? "",
        invoiceCompanyCity: payload.invoiceCompanyCity ?? "",
        invoiceCompanyCountry: payload.invoiceCompanyCountry ?? "DE",
        invoiceCompanyEmail: payload.invoiceCompanyEmail ?? "",
        invoiceCompanyName: payload.invoiceCompanyName ?? "",
        invoiceCompanyPhone: payload.invoiceCompanyPhone ?? "",
        invoiceCompanyZip: payload.invoiceCompanyZip ?? "",
        invoiceDaysAhead: payload.invoiceDaysAhead ?? 7,
        invoiceFooterLine1: payload.invoiceFooterLine1 ?? "",
        invoiceFooterLine2: payload.invoiceFooterLine2 ?? "",
        invoiceFooterLine3: payload.invoiceFooterLine3 ?? "",
        invoicePaymentInstructions: payload.invoicePaymentInstructions ?? "",
        invoiceVatNumber: payload.invoiceVatNumber ?? "",
        ticketAutoCloseHours: payload.ticketAutoCloseHours ?? 24,
        vatPercent: payload.vatPercent ?? 19
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
        invoiceDaysAhead: Number(formData.get("invoiceDaysAhead") ?? 7),
        invoiceFooterLine1: String(formData.get("invoiceFooterLine1") ?? ""),
        invoiceFooterLine2: String(formData.get("invoiceFooterLine2") ?? ""),
        invoiceFooterLine3: String(formData.get("invoiceFooterLine3") ?? ""),
        invoicePaymentInstructions: String(formData.get("invoicePaymentInstructions") ?? ""),
        invoiceVatNumber: String(formData.get("invoiceVatNumber") ?? ""),
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
      <label>Company name<input value={settings.invoiceCompanyName} onChange={(event) => setSettings({ ...settings, invoiceCompanyName: event.target.value })} name="invoiceCompanyName" /></label>
      <label>Company address<input value={settings.invoiceCompanyAddress} onChange={(event) => setSettings({ ...settings, invoiceCompanyAddress: event.target.value })} name="invoiceCompanyAddress" /></label>
      <label>ZIP<input value={settings.invoiceCompanyZip} onChange={(event) => setSettings({ ...settings, invoiceCompanyZip: event.target.value })} name="invoiceCompanyZip" /></label>
      <label>City<input value={settings.invoiceCompanyCity} onChange={(event) => setSettings({ ...settings, invoiceCompanyCity: event.target.value })} name="invoiceCompanyCity" /></label>
      <label>Country<input value={settings.invoiceCompanyCountry} onChange={(event) => setSettings({ ...settings, invoiceCompanyCountry: event.target.value })} name="invoiceCompanyCountry" /></label>
      <label>Email<input value={settings.invoiceCompanyEmail} onChange={(event) => setSettings({ ...settings, invoiceCompanyEmail: event.target.value })} name="invoiceCompanyEmail" type="email" /></label>
      <label>Phone<input value={settings.invoiceCompanyPhone} onChange={(event) => setSettings({ ...settings, invoiceCompanyPhone: event.target.value })} name="invoiceCompanyPhone" /></label>
      <label>USt-IdNr<input value={settings.invoiceVatNumber} onChange={(event) => setSettings({ ...settings, invoiceVatNumber: event.target.value })} name="invoiceVatNumber" /></label>
      <label>Invoice footer line 1<input value={settings.invoiceFooterLine1} onChange={(event) => setSettings({ ...settings, invoiceFooterLine1: event.target.value })} name="invoiceFooterLine1" /></label>
      <label>Invoice footer line 2<input value={settings.invoiceFooterLine2} onChange={(event) => setSettings({ ...settings, invoiceFooterLine2: event.target.value })} name="invoiceFooterLine2" /></label>
      <label>Invoice footer line 3<input value={settings.invoiceFooterLine3} onChange={(event) => setSettings({ ...settings, invoiceFooterLine3: event.target.value })} name="invoiceFooterLine3" /></label>
      <label>Payment instructions<textarea value={settings.invoicePaymentInstructions} onChange={(event) => setSettings({ ...settings, invoicePaymentInstructions: event.target.value })} name="invoicePaymentInstructions" rows={3} /></label>
      <label>Bank details<textarea value={settings.invoiceBankDetails} onChange={(event) => setSettings({ ...settings, invoiceBankDetails: event.target.value })} name="invoiceBankDetails" rows={3} /></label>
      <p>Admin dashboard runs maintenance on open: close answered tickets, create upcoming invoices, mark overdue invoices, suspend services with overdue unpaid invoices.</p>
      <Button icon={Save} type="submit">Save Settings</Button>
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
