"use client";

import { CreditCard, FileText, LifeBuoy, Send, Server, UserRound, Wallet } from "lucide-react";
import { useEffect, useState } from "react";
import {
  API_BASE_URL,
  authHeaders,
  cycleLabel,
  money,
  type ApiAnnouncement,
  type ApiInvoice,
  type ApiService,
  type ApiTicket
} from "../../lib/api";
import { Button } from "../ui/button";
import { StatusPill } from "../ui/status-pill";
import styles from "./client-dashboard.module.css";

type ClientView = "dashboard" | "services" | "invoices" | "tickets" | "new-ticket" | "add-funds" | "payment" | "profile";

const statusTone: Record<string, "good" | "warn" | "neutral"> = {
  ACTIVE: "good",
  ORDERED: "warn",
  PROVISIONING: "warn",
  SUSPENDED: "warn",
  FAILED: "neutral",
  PENDING_CANCEL: "warn",
  TERMINATED: "neutral",
  CANCELLED: "neutral",
  PAID: "good",
  UNPAID: "warn",
  OVERDUE: "warn",
  OPEN: "warn",
  NEW: "warn",
  WAITING_ON_CLIENT: "good",
  WAITING_ON_STAFF: "warn",
  CLOSED: "neutral"
};

export function ClientDashboard({ invoiceId, serviceId, view = "dashboard" }: { invoiceId?: string; serviceId?: string; view?: ClientView }) {
  const [services, setServices] = useState<ApiService[]>(sampleServices);
  const [selectedService, setSelectedService] = useState<ApiService>();
  const [invoices, setInvoices] = useState<ApiInvoice[]>(sampleInvoices);
  const [selectedInvoice, setSelectedInvoice] = useState<ApiInvoice>();
  const [tickets, setTickets] = useState<ApiTicket[]>(sampleTickets);
  const [announcements, setAnnouncements] = useState<ApiAnnouncement[]>([]);

  useEffect(() => {
    const headers = authHeaders();
    const loadServices = () => {
      fetch(`${API_BASE_URL}/services`, { headers }).then(json).then((payload) => payload?.length && setServices(payload)).catch(() => undefined);
    };
    loadServices();
    const timer = window.setInterval(loadServices, 20_000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    if (!serviceId) {
      return;
    }
    const headers = authHeaders();
    const loadService = () => {
      fetch(`${API_BASE_URL}/services/${serviceId}`, { headers }).then(json).then((payload) => payload && setSelectedService(payload)).catch(() => undefined);
    };
    loadService();
    const timer = window.setInterval(loadService, 20_000);
    return () => window.clearInterval(timer);
  }, [serviceId]);

  useEffect(() => {
    if (!invoiceId) {
      return;
    }
    const headers = authHeaders();
    fetch(`${API_BASE_URL}/billing/invoices/${invoiceId}`, { headers }).then(json).then((payload) => payload && setSelectedInvoice(payload)).catch(() => undefined);
  }, [invoiceId]);

  useEffect(() => {
    const headers = authHeaders();
    fetch(`${API_BASE_URL}/billing/invoices`, { headers }).then(json).then((payload) => payload?.length && setInvoices(payload)).catch(() => undefined);
    fetch(`${API_BASE_URL}/tickets`, { headers }).then(json).then((payload) => payload?.length && setTickets(payload)).catch(() => undefined);
    fetch(`${API_BASE_URL}/cms/announcements`).then(json).then((payload) => payload?.length && setAnnouncements(payload)).catch(() => undefined);
  }, []);

  const activeServices = services.filter((service) => service.status === "ACTIVE").length;
  const unpaidInvoices = invoices.filter((invoice) => invoice.status !== "PAID").length;
  const activeTickets = tickets.filter((ticket) => ticket.status !== "CLOSED").length;

  return (
    <div className={styles.page}>
      <aside className={styles.sidebar}>
        <strong>CrimsonGrid</strong>
        <nav aria-label="Client">
          <a href="/client/services">Services</a>
          <a href="/client/invoices">Rechnungen</a>
          <a href="/client/tickets">Support Tickets</a>
          <a className={styles.subNav} href="/client/tickets/new">Neues Ticket</a>
          <a href="/client/billing/add-funds">Add Funds</a>
          <a href="/client/billing/payment">Zahlung</a>
          <a href="/client/profile">Profile</a>
        </nav>
      </aside>

      <main className={styles.main}>
        <header className={styles.header}>
          <div>
            <span className="eyebrow">Client Portal</span>
            <h1>{titleFor(view)}</h1>
          </div>
          <Button href="/de/pricing" icon={CreditCard}>
            Neuer Service
          </Button>
        </header>

        <section className="grid four" aria-label="Overview">
          <a className="metric" href="/client/services">
            <Server aria-hidden size={22} />
            <strong>{activeServices}</strong>
            <span>Services</span>
          </a>
          <a className="metric" href="/client/invoices">
            <FileText aria-hidden size={22} />
            <strong>{unpaidInvoices}</strong>
            <span>Offene Rechnungen</span>
          </a>
          <a className="metric" href="/client/tickets">
            <LifeBuoy aria-hidden size={22} />
            <strong>{activeTickets}</strong>
            <span>Aktives Ticket</span>
          </a>
          <a className="metric" href="/client/billing/payment">
            <CreditCard aria-hidden size={22} />
            <strong>SEPA</strong>
            <span>Zahlung</span>
          </a>
        </section>

        {(view === "dashboard" || view === "services") && !serviceId ? <Announcements announcements={announcements} /> : null}
        {(view === "dashboard" || view === "services") && !serviceId ? <ServicesTable services={services} /> : null}
        {serviceId ? <ServiceDetail service={selectedService ?? services.find((service) => service.id === serviceId)} /> : null}
        {view === "invoices" && !invoiceId ? <InvoicesTable invoices={invoices} /> : null}
        {invoiceId ? <InvoiceDetail invoice={selectedInvoice ?? invoices.find((invoice) => invoice.id === invoiceId)} /> : null}
        {view === "tickets" ? <TicketsTable tickets={tickets} /> : null}
        {view === "new-ticket" ? <NewTicket services={services} /> : null}
        {view === "add-funds" ? <AddFunds activeServices={activeServices} /> : null}
        {view === "payment" ? <PaymentInfo /> : null}
        {view === "profile" ? <ProfileForm /> : null}
      </main>
    </div>
  );
}

function Announcements({ announcements }: { announcements: ApiAnnouncement[] }) {
  return (
    <section className={styles.block}>
      <div className={styles.blockHeader}>
        <div>
          <span className="eyebrow">Latest announcements</span>
          <h2>News</h2>
        </div>
      </div>
      <div className={styles.tableWrap}>
        <table className="table">
          <tbody>
            {announcements.length ? announcements.map((item) => <tr key={item.id}><td><strong>{item.title}</strong><br />{item.excerpt ?? ""}</td></tr>) : <tr><td>Noch keine Announcements.</td></tr>}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function ServicesTable({ services }: { services: ApiService[] }) {
  return (
    <section className={styles.block} id="services">
          <div className={styles.blockHeader}>
            <div>
              <span className="eyebrow">Services</span>
              <h2>Products & Services</h2>
            </div>
          </div>
          <div className={styles.tableWrap}>
            <table className="table">
              <thead>
                <tr>
                  <th>Product/Service</th>
                  <th>Pricing</th>
                  <th>Next Due Date</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {services.map((service) => (
                  <tr key={service.id}>
                    <td><a href={`/client/services/${service.id}`}><strong>{serviceName(service)}</strong></a><br />{service.product.type}</td>
                    <td>{money(service.productPrice.amountCents, service.productPrice.currency)}<br />{cycleLabel(service.productPrice.billingCycle)}</td>
                    <td>{dateLabel(service.renewsAt)}</td>
                    <td>
                      <StatusPill label={serviceStatusLabel(service.status)} tone={statusTone[service.status] ?? "neutral"} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
  );
}

function ServiceDetail({ service }: { service?: ApiService }) {
  if (!service) {
    return <section className={styles.module}><h2>Service</h2><p>Loading...</p></section>;
  }

  return (
    <section className={styles.module}>
      <div className={styles.detailHeader}>
        <div>
          <span className="eyebrow">Service</span>
          <h2>{serviceName(service)}</h2>
        </div>
        <StatusPill label={serviceStatusLabel(service.status)} tone={statusTone[service.status] ?? "neutral"} />
      </div>
      <p>{serviceKind(service)}</p>
      <div className={styles.detailGrid}>
        <div>
          <span>Pricing</span>
          <strong>{money(service.productPrice.amountCents, service.productPrice.currency)} / {cycleLabel(service.productPrice.billingCycle)}</strong>
        </div>
        <div>
          <span>Next Due Date</span>
          <strong>{dateLabel(service.renewsAt)}</strong>
        </div>
        <div>
          <span>Status</span>
          <strong>{serviceStatusLabel(service.status)}</strong>
        </div>
      </div>
      {service.product.type === "DOMAIN" ? <DomainRenewal service={service} /> : <PlanChange service={service} />}
    </section>
  );
}

function InvoicesTable({ invoices }: { invoices: ApiInvoice[] }) {
  return <section className={styles.block}><div className={styles.tableWrap}><table className="table"><thead><tr><th>Invoice #</th><th>Invoice Date</th><th>Due Date</th><th>Total</th><th>Status</th><th>PDF</th></tr></thead><tbody>{invoices.map((invoice) => <tr key={invoice.id}><td><a href={`/client/invoices/${invoice.id}`}>{invoice.invoiceNumber}</a></td><td>{dateLabel(invoice.issuedAt)}</td><td>{dateLabel(invoice.dueAt)}</td><td>{money(invoice.totalCents, invoice.currency)}</td><td><StatusPill label={invoice.status.toLowerCase()} tone={statusTone[invoice.status] ?? "neutral"} /></td><td><a href={`${API_BASE_URL}/billing/invoices/${invoice.id}/pdf`}>Download PDF</a></td></tr>)}</tbody></table></div></section>;
}

function InvoiceDetail({ invoice }: { invoice?: ApiInvoice }) {
  if (!invoice) {
    return <section className={styles.module}><h2>Invoice</h2><p>Loading...</p></section>;
  }
  const customer = invoice.customerSnapshot ?? {};
  const address = customer.address ?? {};
  const showVat = (invoice.taxAmountCents ?? 0) > 0;

  return (
    <section className={styles.invoice}>
      <div className={styles.invoiceTop}>
        <div><span className="eyebrow">Dezhost</span><h2>Rechnung {invoice.invoiceNumber}</h2></div>
        <StatusPill label={invoice.status.toLowerCase()} tone={invoice.status === "PAID" ? "good" : "warn"} />
      </div>
      <div className={styles.invoiceMeta}>
        <div><strong>{customer.companyName || customer.name}</strong><br />{address.line1}<br />{address.postalCode} {address.city}<br />{customer.countryCode}</div>
        <div>Rechnungsdatum: {dateLabel(invoice.issuedAt)}<br />Faellig: {dateLabel(invoice.dueAt)}<br />E-Mail: {customer.email}</div>
      </div>
      <table className="table">
        <thead><tr><th>Beschreibung</th><th>Menge</th><th>Einzelpreis</th><th>Summe</th></tr></thead>
        <tbody>{(invoice.items ?? []).map((item) => <tr key={item.description}><td>{item.description}</td><td>{item.quantity}</td><td>{money(item.unitAmountCents, invoice.currency)}</td><td>{money(item.totalCents, invoice.currency)}</td></tr>)}</tbody>
      </table>
      <div className={styles.invoiceTotals}>
        <span>Zwischensumme {money(invoice.subtotalCents ?? invoice.totalCents, invoice.currency)}</span>
        {showVat ? <span>USt. {money(invoice.taxAmountCents ?? 0, invoice.currency)}</span> : null}
        <strong>Gesamt {money(invoice.totalCents, invoice.currency)}</strong>
      </div>
      <a className={styles.pdfLink} href={`${API_BASE_URL}/billing/invoices/${invoice.id}/pdf`}>Download PDF</a>
      <footer className={styles.invoiceFooter}>{(invoice.footerLines ?? []).map((line) => <span key={line}>{line}</span>)}</footer>
    </section>
  );
}

function DomainRenewal({ service }: { service: ApiService }) {
  const [message, setMessage] = useState("");
  async function submit(formData: FormData) {
    const response = await fetch(`${API_BASE_URL}/services/${service.id}/renew-domain`, {
      body: JSON.stringify({ years: Number(formData.get("years") ?? 1) }),
      headers: { "Content-Type": "application/json", ...authHeaders() },
      method: "POST"
    });
    setMessage(response.ok ? "Renewal sent." : "Renewal failed.");
  }
  return <form action={submit} className={styles.inlineForm}><label>Renew for years<select name="years"><option>1</option><option>2</option><option>3</option><option>5</option></select></label><Button type="submit">Renew domain</Button>{message ? <p>{message}</p> : null}</form>;
}

function PlanChange({ service }: { service: ApiService }) {
  const [message, setMessage] = useState("");
  async function submit() {
    const response = await fetch(`${API_BASE_URL}/services/${service.id}/change-plan`, {
      body: JSON.stringify({}),
      headers: { "Content-Type": "application/json", ...authHeaders() },
      method: "POST"
    });
    setMessage(response.ok ? "Upgrade/downgrade request sent." : "Request failed.");
  }
  return <div className={styles.inlineForm}><Button type="button" onClick={submit}>Upgrade/Downgrade</Button>{message ? <p>{message}</p> : null}</div>;
}

function TicketsTable({ tickets }: { tickets: ApiTicket[] }) {
  return <section className={styles.block}><div className={styles.blockHeader}><div><span className="eyebrow">Support Tickets</span><h2>All Tickets</h2></div><Button href="/client/tickets/new" icon={Send}>New Ticket</Button></div><div className={styles.tableWrap}><table className="table"><thead><tr><th>Department</th><th>Subject</th><th>Status</th><th>Last Update</th></tr></thead><tbody>{tickets.map((ticket) => <tr key={ticket.id}><td>{ticket.department}</td><td><a href={`/client/tickets/${ticket.id}`}>#{ticket.id.slice(-6)} {ticket.subject}</a></td><td><StatusPill label={ticketLabel(ticket.status)} tone={statusTone[ticket.status] ?? "neutral"} /></td><td>{dateLabel(ticket.updatedAt)}</td></tr>)}</tbody></table></div></section>;
}

function NewTicket({ services }: { services: ApiService[] }) {
  return <section className={styles.module}><h2>New Ticket</h2><label>Department<select className="input"><option>Support</option><option>Sales</option><option>Abuse</option></select></label><label>Related service<select className="input">{services.map((service) => <option key={service.id}>{service.product.name}</option>)}</select></label><label>Subject<input className="input" placeholder="Short subject" /></label><label>Message<textarea className="input" rows={6} /></label><Button icon={Send}>Open Ticket</Button></section>;
}

function AddFunds({ activeServices }: { activeServices: number }) {
  return <section className={styles.module}><Wallet aria-hidden /><h2>Add Funds</h2>{activeServices ? <><p>Funds pay invoices automatically on due date. If credit is too low, saved payment info pays the rest.</p><label>Amount<input className="input" placeholder="50.00" /></label><Button icon={CreditCard}>Add Funds</Button></> : <p>You must have at least one active order before adding funds.</p>}</section>;
}

function PaymentInfo() {
  return <section className={styles.module}><CreditCard aria-hidden /><h2>Payment Information</h2><label>SEPA IBAN<input className="input" placeholder="DE00 0000 0000 0000 0000 00" /></label><label>PayPal account<input className="input" placeholder="billing@example.com" /></label><label>Card token<input className="input" placeholder="Connect credit/debit card" /></label><Button icon={CreditCard}>Save Payment Info</Button></section>;
}

function ProfileForm() {
  const [message, setMessage] = useState("");
  async function submit(formData: FormData) {
    const response = await fetch(`${API_BASE_URL}/users/me`, {
      body: JSON.stringify({
        address: {
          city: formData.get("city"),
          line1: formData.get("address"),
          postalCode: formData.get("postalCode"),
          state: formData.get("state")
        },
        countryCode: formData.get("countryCode"),
        email: formData.get("email"),
        name: formData.get("name"),
        phone: formData.get("phone"),
        vatId: formData.get("vatId")
      }),
      headers: { "Content-Type": "application/json", ...authHeaders() },
      method: "PATCH"
    });
    setMessage(response.ok ? "Profile saved." : "Profile failed.");
  }
  return <form action={submit} className={styles.module}><UserRound aria-hidden /><h2>Profile</h2><p>Changing profile information here does not change registered domain contact details. Open a support ticket for domain contact changes.</p><label>Name<input className="input" name="name" /></label><label>Email<input className="input" name="email" type="email" /></label><label>Address<input className="input" name="address" /></label><label>Postal code<input className="input" name="postalCode" /></label><label>City<input className="input" name="city" /></label><label>State<input className="input" name="state" /></label><label>Country<input className="input" defaultValue="DE" name="countryCode" /></label><label>Phone<input className="input" name="phone" /></label><label>VAT ID<input className="input" name="vatId" /></label><Button icon={FileText} type="submit">Save Profile</Button>{message ? <p>{message}</p> : null}</form>;
}

function titleFor(view: ClientView) {
  return {
    "add-funds": "Add Funds",
    dashboard: "Dashboard",
    invoices: "My Invoices",
    "new-ticket": "Open Ticket",
    payment: "Payment Information",
    profile: "Profile",
    services: "Services",
    tickets: "My Support Tickets"
  }[view];
}

function dateLabel(value?: string | null) {
  return value ? new Intl.DateTimeFormat("de-DE", { dateStyle: "medium" }).format(new Date(value)) : "-";
}

function serviceName(service: ApiService) {
  return service.domainRecords?.[0]?.domain ?? stringConfig(service.configuration, "domainName") ?? service.product.name;
}

function serviceKind(service: ApiService) {
  if (service.product.type === "DOMAIN") {
    return "Domain service";
  }
  if (service.product.type === "SHARED_HOSTING") {
    return `Hosting package: ${service.product.name}`;
  }
  if (service.product.type === "VPS") {
    return `VPS hosting: ${service.product.name}`;
  }
  return service.product.type;
}

function stringConfig(configuration: unknown, key: string) {
  if (typeof configuration !== "object" || configuration === null || Array.isArray(configuration)) {
    return undefined;
  }
  const value = (configuration as Record<string, unknown>)[key];
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function ticketLabel(status: string) {
  return { WAITING_ON_CLIENT: "answered", WAITING_ON_STAFF: "customer-reply" }[status] ?? status.toLowerCase();
}

function serviceStatusLabel(status: string) {
  return { ORDERED: "inactive", PROVISIONING: "inactive" }[status] ?? status.toLowerCase();
}

async function json(response: Response) {
  if (response.status === 401 && typeof window !== "undefined") {
    window.location.assign(`/login?next=${encodeURIComponent(window.location.pathname)}`);
    return null;
  }
  return response.ok ? response.json() : null;
}

const sampleServices: ApiService[] = [
  { id: "svc_1", status: "ACTIVE", renewsAt: "2026-06-01T00:00:00.000Z", product: { name: "Reseller Hosting - UK-WHM25", type: "SHARED_HOSTING" }, productPrice: { amountCents: 697, billingCycle: "MONTHLY", currency: "EUR" } }
];

const sampleInvoices: ApiInvoice[] = [
  { id: "inv_1", invoiceNumber: "0000001", issuedAt: "2026-05-01T00:00:00.000Z", dueAt: "2026-05-08T00:00:00.000Z", status: "UNPAID", totalCents: 913, currency: "EUR" }
];

const sampleTickets: ApiTicket[] = [
  { id: "412103", department: "SUPPORT", subject: "Emails not working", status: "OPEN", updatedAt: "2026-05-05T12:00:00.000Z" }
];
