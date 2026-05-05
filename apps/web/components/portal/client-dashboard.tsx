"use client";

import { CreditCard, FileText, LifeBuoy, Send, Server, UserRound, Wallet } from "lucide-react";
import { useEffect, useState } from "react";
import {
  API_BASE_URL,
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

export function ClientDashboard({ view = "dashboard" }: { view?: ClientView }) {
  const [services, setServices] = useState<ApiService[]>(sampleServices);
  const [invoices, setInvoices] = useState<ApiInvoice[]>(sampleInvoices);
  const [tickets, setTickets] = useState<ApiTicket[]>(sampleTickets);
  const [announcements, setAnnouncements] = useState<ApiAnnouncement[]>([]);

  useEffect(() => {
    fetch(`${API_BASE_URL}/admin/dev/services`).then(json).then((payload) => payload?.length && setServices(payload)).catch(() => undefined);
    fetch(`${API_BASE_URL}/admin/dev/billing/invoices`).then(json).then((payload) => payload?.length && setInvoices(payload)).catch(() => undefined);
    fetch(`${API_BASE_URL}/admin/dev/tickets`).then(json).then((payload) => payload?.length && setTickets(payload)).catch(() => undefined);
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
          <a href="/client/tickets">Tickets</a>
          <a href="/client/tickets/new">Neues Ticket</a>
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

        {view === "dashboard" || view === "services" ? <Announcements announcements={announcements} /> : null}
        {view === "dashboard" || view === "services" ? <ServicesTable services={services} /> : null}
        {view === "invoices" ? <InvoicesTable invoices={invoices} /> : null}
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
                    <td><strong>{service.product.name}</strong><br />{service.product.type}</td>
                    <td>{money(service.productPrice.amountCents, service.productPrice.currency)}<br />{cycleLabel(service.productPrice.billingCycle)}</td>
                    <td>{dateLabel(service.renewsAt)}</td>
                    <td>
                      <StatusPill label={service.status.toLowerCase()} tone={statusTone[service.status] ?? "neutral"} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
  );
}

function InvoicesTable({ invoices }: { invoices: ApiInvoice[] }) {
  return <section className={styles.block}><div className={styles.tableWrap}><table className="table"><thead><tr><th>Invoice #</th><th>Invoice Date</th><th>Due Date</th><th>Total</th><th>Status</th></tr></thead><tbody>{invoices.map((invoice) => <tr key={invoice.id}><td>{invoice.invoiceNumber}</td><td>{dateLabel(invoice.issuedAt)}</td><td>{dateLabel(invoice.dueAt)}</td><td>{money(invoice.totalCents, invoice.currency)}</td><td><StatusPill label={invoice.status.toLowerCase()} tone={statusTone[invoice.status] ?? "neutral"} /></td></tr>)}</tbody></table></div></section>;
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
  return <section className={styles.module}><UserRound aria-hidden /><h2>Profile</h2><label>Name<input className="input" defaultValue="Client Name" /></label><label>Email<input className="input" defaultValue="client@example.com" /></label><label>Country<input className="input" defaultValue="DE" /></label><label>VAT ID<input className="input" /></label><Button icon={FileText}>Save Profile</Button></section>;
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

function cycleLabel(cycle: string) {
  return cycle.replace("_", " ").toLowerCase();
}

function dateLabel(value?: string | null) {
  return value ? new Intl.DateTimeFormat("de-DE", { dateStyle: "medium" }).format(new Date(value)) : "-";
}

function ticketLabel(status: string) {
  return { WAITING_ON_CLIENT: "answered", WAITING_ON_STAFF: "customer-reply" }[status] ?? status.toLowerCase();
}

async function json(response: Response) {
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
