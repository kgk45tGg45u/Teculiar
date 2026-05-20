import { Bell, BookOpen, FileText, Mail, Package, Settings, Ticket, UsersRound } from "lucide-react";
import { redirect } from "next/navigation";
import {
  API_BASE_URL,
  ADMIN_AUTH_COOKIE,
  cycleLabel,
  money,
  type ApiActionLog,
  type ApiClient,
  type ApiEmailAdminSettings,
  type ApiInvoice,
  type ApiKnowledgebaseArticle,
  type ApiDomainPrice,
  type ApiOrder,
  type ApiProduct,
  type ApiService,
  type ApiTicket,
  type AuthUser
} from "../../lib/api";
import { invoiceStatusLabel, orderStatusLabel, serviceStatusLabel } from "../../lib/status-labels";
import { apiGetAuth } from "../../lib/server-api";
import { Button } from "../ui/button";
import { StatusPill } from "../ui/status-pill";
import { AdminInvoiceActions, AnnouncementForm, BlogManager, ClientManager, DomainPriceForm, EmailSettingsForm, OrderStatusForm, PaymentGatewayForm, SettingsForm } from "./admin-forms";
import { AdminProductManager } from "./admin-product-manager";
import { KnowledgebasePanel } from "./admin-support";
import styles from "./admin-dashboard.module.css";

type AdminView =
  | "home"
  | "blog"
  | "clients"
  | "orders"
  | "domain-prices"
  | "emails"
  | "invoices"
  | "logs"
  | "knowledgebase"
  | "payment-gateways"
  | "products"
  | "services"
  | "tickets"
  | "announcements"
  | "settings";

export type EmailAdminSection = "emails" | "logs" | "settings" | "template";

export async function AdminDashboard({ emailSection = "emails", view = "home" }: { emailSection?: EmailAdminSection; view?: AdminView }) {
  const user = await apiGetAuth<AuthUser>("/users/me");
  if (!user?.roles.some((role) => role === "admin" || role === "staff")) {
    redirect("/admin/login" as never);
  }

  await runMaintenance();

  const orders = (await apiGetAuth<ApiOrder[]>("/orders/admin")) ?? [];
  const clients = (await apiGetAuth<ApiClient[]>("/users")) ?? [];
  const products = (await apiGetAuth<ApiProduct[]>("/products")) ?? [];
  const services = (await apiGetAuth<ApiService[]>("/admin/dev/services")) ?? [];
  const invoices = (await apiGetAuth<ApiInvoice[]>("/admin/dev/billing/invoices")) ?? [];
  const logs = (await apiGetAuth<ApiActionLog[]>("/admin/dev/logs")) ?? [];
  const settings = (await apiGetAuth<{ siteLogoUrl?: string }>("/admin/dev/billing/settings")) ?? {};
  const domainPrices = (await apiGetAuth<ApiDomainPrice[]>("/orders/admin/domain-prices")) ?? [];
  const tickets = (await apiGetAuth<ApiTicket[]>("/admin/dev/tickets")) ?? [];
  const knowledgebase = (await apiGetAuth<ApiKnowledgebaseArticle[]>("/admin/dev/knowledgebase")) ?? [];
  const emailSettings = (await apiGetAuth<ApiEmailAdminSettings>("/admin/dev/emails")) ?? emptyEmailSettings();
  const stats = (await apiGetAuth<{ mrrCents: number; activeServices: number; openTickets: number; failedPayments: number }>(
    "/admin/dev/billing/dashboard"
  )) ?? { activeServices: 0, failedPayments: 0, mrrCents: 0, openTickets: 0 };

  return (
    <div className={styles.page}>
      <aside className={styles.sidebar}>
        {settings.siteLogoUrl ? <img alt="Dezhost" className={styles.brandLogo} src={settings.siteLogoUrl} /> : <strong>CrimsonGrid</strong>}
        <nav>
          <a href="/admin">Home</a>
          <a href="/admin/clients">Clients</a>
          <a href="/admin/orders">Orders</a>
          <a href="/admin/domain-prices">Domain Prices</a>
          <a href="/admin/services">Services</a>
          <a href="/admin/products">Products/Services</a>
          <a href="/admin/payment-gateways">Payment Gateways</a>
          <a href="/admin/emails">Emails</a>
          <a href="/admin/emails/settings">Email Settings</a>
          <a href="/admin/emails/template">Email Template</a>
          <a href="/admin/emails/logs">Email Logs</a>
          <a href="/admin/invoices">Invoices</a>
          <a href="/admin/logs">Logs</a>
          <a href="/admin/tickets">Support Tickets</a>
          <a href="/admin/knowledgebase">Knowledgebase</a>
          <a href="/admin/blog">Blog</a>
          <a href="/admin/announcements">Announcements</a>
          <a href="/admin/settings">Automation Settings</a>
        </nav>
      </aside>
      <main className={styles.main}>
        <header className={styles.header}>
          <div>
            <span className="eyebrow">Admin</span>
            <h1>{adminTitle(view)}</h1>
            <p>Clients, orders, billing, support, products, announcements, and automation.</p>
          </div>
          <Button href="/de" variant="secondary">
            Website
          </Button>
        </header>

        <section className="grid four">
          <div className="metric">
            <strong>{money(stats.mrrCents)}</strong>
            <span>MRR</span>
          </div>
          <div className="metric">
            <strong>{stats.activeServices}</strong>
            <span>Active services</span>
          </div>
          <div className="metric">
            <strong>{stats.openTickets}</strong>
            <span>Open tickets</span>
          </div>
          <div className="metric">
            <strong>{stats.failedPayments}</strong>
            <span>Failed payments</span>
          </div>
        </section>

        {view === "home" ? <ModuleGrid /> : null}
        {view === "home" || view === "orders" ? <OrdersPanel orders={orders} /> : null}
        {view === "domain-prices" ? <DomainPricesPanel prices={domainPrices} /> : null}
        {view === "clients" ? <ClientsPanel clients={clients} products={products} /> : null}
        {view === "services" ? <ServicesPanel services={services} /> : null}
        {view === "invoices" ? <InvoicesPanel invoices={invoices} /> : null}
        {view === "logs" ? <LogsPanel logs={logs} /> : null}
        {view === "tickets" ? <TicketsPanel tickets={tickets} /> : null}
        {view === "knowledgebase" ? <KnowledgebasePanel articles={knowledgebase} /> : null}
        {view === "blog" ? <BlogPanel /> : null}
        {view === "products" ? <ProductsPanel /> : null}
        {view === "payment-gateways" ? <PaymentGatewaysPanel /> : null}
        {view === "emails" ? <EmailsPanel section={emailSection} settings={emailSettings} /> : null}
        {view === "announcements" ? <AnnouncementsPanel /> : null}
        {view === "settings" ? <SettingsPanel /> : null}
      </main>
    </div>
  );
}

function DomainPricesPanel({ prices }: { prices: ApiDomainPrice[] }) {
  return (
    <section className={styles.panel}>
      <div className={styles.panelHeader}>
        <div>
          <span className="eyebrow">Domains</span>
          <h2>TLD Prices</h2>
        </div>
        <StatusPill label={`${prices.length} rows`} tone={prices.length > 0 ? "good" : "warn"} />
      </div>
      <DomainPriceForm />
      <table className="table">
        <thead>
          <tr>
            <th>TLD</th>
            <th>Action</th>
            <th>Years</th>
            <th>Price</th>
            <th>Manual</th>
            <th>Suggested</th>
            <th>Last update</th>
          </tr>
        </thead>
        <tbody>
          {prices.length ? (
            prices.map((price) => (
              <tr key={`${price.tld}-${price.action}-${price.years}`}>
                <td>.{price.tld}</td>
                <td>{price.action}</td>
                <td>{price.years}</td>
                <td>{price.amountCents > 0 ? money(price.amountCents, price.currency) : "Resell.biz"}</td>
                <td>{price.manual ? "yes" : "no"}</td>
                <td>{price.suggested ? "yes" : "no"}</td>
                <td>{dateLabel(price.updatedAt)}</td>
              </tr>
            ))
          ) : (
            <tr>
              <td colSpan={7}>No domain prices synced yet.</td>
            </tr>
          )}
        </tbody>
      </table>
    </section>
  );
}

function ModuleGrid() {
  const modules = [
    { title: "Clients", body: "Clients, contacts, segments, email logs.", href: "/admin/clients", icon: UsersRound },
    { title: "Orders", body: "Order queue with 6 digit order numbers.", href: "/admin/orders", icon: Package },
    { title: "Billing", body: "Invoices, transactions, add funds, processors.", href: "/admin/invoices", icon: FileText },
    { title: "Emails", body: "SMTP settings, templates, and local outbox.", href: "/admin/emails", icon: Mail },
    { title: "Support", body: "Tickets, departments, statuses, replies.", href: "/admin/tickets", icon: Ticket },
    { title: "Knowledgebase", body: "Public help articles and ticket reply inserts.", href: "/admin/knowledgebase", icon: BookOpen },
    { title: "Blog", body: "Articles, SEO keywords, images, AI briefs.", href: "/admin/blog", icon: FileText },
    { title: "Products", body: "Products, services, pricing cycles.", href: "/admin/products", icon: Settings },
    { title: "Announcements", body: "Write client portal announcements.", href: "/admin/announcements", icon: Bell }
  ];

  return (
    <section className="grid three">
      {modules.map((module) => (
        <a className={styles.module} href={module.href} key={module.title}>
          <module.icon aria-hidden size={24} />
          <h2>{module.title}</h2>
          <p>{module.body}</p>
        </a>
      ))}
    </section>
  );
}

function PaymentGatewaysPanel() {
  return (
    <section className={styles.panel}>
      <div className={styles.panelHeader}>
        <div>
          <span className="eyebrow">Billing</span>
          <h2>Payment Gateways</h2>
        </div>
      </div>
      <PaymentGatewayForm />
    </section>
  );
}

function EmailsPanel({ section, settings }: { section: EmailAdminSection; settings: ApiEmailAdminSettings }) {
  const title = {
    emails: "Emails",
    logs: "Email Logs",
    settings: "Email Settings",
    template: "Email Template"
  }[section];
  return (
    <section className={styles.panel}>
      <div className={styles.panelHeader}>
        <div>
          <span className="eyebrow">Messaging</span>
          <h2>{title}</h2>
        </div>
        <StatusPill label={`${settings.logs.length} outbox logs`} tone={settings.logs.length ? "good" : "neutral"} />
      </div>
      <EmailSettingsForm initial={settings} section={section} />
    </section>
  );
}

function BlogPanel() {
  return (
    <section className={styles.panel}>
      <div className={styles.panelHeader}>
        <div>
          <span className="eyebrow">CMS</span>
          <h2>Blog Articles</h2>
        </div>
        <Button href="/admin/blog/new" variant="secondary">New Post</Button>
      </div>
      <BlogManager />
    </section>
  );
}

function OrdersPanel({ orders }: { orders: ApiOrder[] }) {
  return (
    <section className={styles.panel}>
      <div className={styles.panelHeader}>
        <div>
          <span className="eyebrow">Orders</span>
          <h2>Bestellqueue</h2>
        </div>
        <StatusPill label={`${orders.length} Orders`} tone={orders.length > 0 ? "good" : "neutral"} />
      </div>
      <table className="table">
        <thead>
          <tr>
            <th>Order</th>
            <th>Kunde</th>
            <th>Status</th>
            <th>Invoice</th>
            <th>Items</th>
            <th>Total</th>
          </tr>
        </thead>
        <tbody>
          {orders.length ? (
            orders.map((order) => (
              <tr key={order.id}>
                <td>
                  <details>
                    <summary><a href={`/admin/orders/${order.id}`}>{order.orderNumber}</a></summary>
                    <div className={styles.orderDetails}>
                      <p><strong>Invoice:</strong> {order.invoice?.invoiceNumber ?? "-"} ({order.invoice?.status ?? "no invoice"})</p>
                      <p><strong>Status:</strong> {orderStatusLabel(order.status)}</p>
                      <OrderStatusForm orderId={order.id} status={order.status} />
                      <table className="table">
                        <tbody>
                          {order.items.map((item) => (
                            <tr key={item.id}>
                              <td>{item.description}</td>
                              <td>{item.domainName ?? "-"}</td>
                              <td>{serviceStatusLabel(item.provisioningStatus)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </details>
                </td>
                <td>{order.user?.email ?? "unknown"}</td>
                <td>
                  <StatusPill label={orderStatusLabel(order.status)} tone={order.status === "COMPLETE" ? "good" : order.status === "CANCELLED" ? "neutral" : "warn"} />
                </td>
                <td>{order.invoice ? <a href={`/admin/invoices/${order.invoice.id}`}>{order.invoice.invoiceNumber}</a> : "-"}</td>
                <td>{order.items.map((item) => item.description).join(", ")}</td>
                <td>{money(order.totalCents, order.currency)}</td>
              </tr>
            ))
          ) : (
            <tr>
              <td colSpan={6}>Noch keine Bestellungen oder API nicht erreichbar.</td>
            </tr>
          )}
        </tbody>
      </table>
    </section>
  );
}

function ServicesPanel({ services }: { services: ApiService[] }) {
  return (
    <section className={styles.panel}>
      <div className={styles.panelHeader}>
        <div>
          <span className="eyebrow">Services</span>
          <h2>All Services</h2>
        </div>
      </div>
      <table className="table">
        <thead>
          <tr>
            <th>Service</th>
            <th>Pricing</th>
            <th>Next Due</th>
            <th>Status</th>
          </tr>
        </thead>
        <tbody>
          {services.map((service) => (
            <tr key={service.id}>
              <td><a href={`/admin/services/${service.id}`}>{service.product.name}</a><br />{service.domainRecords?.[0]?.domain ?? stringValue(service.configuration?.domainName) ?? serviceKindLabel(service.product.type)}</td>
              <td>{money(service.productPrice.amountCents, service.productPrice.currency)} / {cycleLabel(service.productPrice.billingCycle)}</td>
              <td>{dateLabel(service.renewsAt)}</td>
              <td>
                <StatusPill label={serviceStatusLabel(service.status)} tone={service.status === "ACTIVE" ? "good" : "warn"} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}

function ClientsPanel({ clients, products }: { clients: ApiClient[]; products: ApiProduct[] }) {
  return (
    <section className={styles.panel}>
      <div className={styles.panelHeader}>
        <div>
          <span className="eyebrow">Clients</span>
          <h2>Clients</h2>
        </div>
        <StatusPill label={`${clients.length} clients`} tone={clients.length ? "good" : "neutral"} />
      </div>
      <ClientManager clients={clients} products={products} />
    </section>
  );
}

function InvoicesPanel({ invoices }: { invoices: ApiInvoice[] }) {
  return (
    <section className={styles.panel}>
      <div className={styles.panelHeader}>
        <div>
          <span className="eyebrow">Billing</span>
          <h2>Invoices</h2>
        </div>
        <StatusPill label="7 digit numbers" tone="good" />
      </div>
      <div className={styles.invoiceCards}>
        {invoices.map((invoice) => (
          <div className={styles.invoiceCard} id={`invoice-${invoice.id}`} key={invoice.id}>
            <div><span>Invoice</span><strong><a href={`/admin/invoices/${invoice.id}`}>{invoice.invoiceNumber}</a></strong></div>
            <div><span>Issued</span><strong>{dateLabel(invoice.issuedAt)}</strong></div>
            <div><span>Due</span><strong>{dateLabel(invoice.dueAt)}</strong></div>
            {invoice.status === "PAID" ? <div><span>Paid</span><strong>{dateLabel(invoice.paidAt)}</strong></div> : null}
            {invoice.status === "PAID" ? <div><span>Gateway</span><strong>{paymentGateway(invoice)}</strong></div> : null}
            <div><span>Total</span><strong>{money(invoice.totalCents, invoice.currency)}</strong></div>
            <StatusPill label={invoiceStatusLabel(invoice.status)} tone={invoice.status === "PAID" ? "good" : "warn"} />
            <AdminInvoiceActions invoice={invoice} />
          </div>
        ))}
      </div>
    </section>
  );
}

function TicketsPanel({ tickets }: { tickets: ApiTicket[] }) {
  return (
    <section className={styles.panel}>
      <div className={styles.panelHeader}>
        <div>
          <span className="eyebrow">Support</span>
          <h2>Support Tickets</h2>
        </div>
      </div>
      <table className="table">
        <thead>
          <tr>
            <th>Department</th>
            <th>Subject</th>
            <th>Status</th>
            <th>Last Update</th>
          </tr>
        </thead>
        <tbody>
          {tickets.map((ticket) => (
            <tr key={ticket.id}>
              <td>{ticket.department}</td>
              <td><a href={`/admin/tickets/${ticket.id}`}>#{ticket.publicId ?? ticket.id.slice(-6).toUpperCase()} {ticket.subject}</a></td>
              <td>
                <StatusPill label={ticketLabel(ticket.status)} tone={ticket.status === "CLOSED" ? "neutral" : "warn"} />
              </td>
              <td>{dateLabel(ticket.updatedAt)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}

function LogsPanel({ logs }: { logs: ApiActionLog[] }) {
  return (
    <section className={styles.panel}>
      <div className={styles.panelHeader}>
        <div>
          <span className="eyebrow">System</span>
          <h2>Action Logs</h2>
        </div>
        <StatusPill label={`${logs.length} events`} tone={logs.length ? "good" : "neutral"} />
      </div>
      <table className="table">
        <thead><tr><th>Time</th><th>Source</th><th>Action</th><th>Subject</th><th>Actor</th><th>Status</th><th>Message</th></tr></thead>
        <tbody>{logs.length ? logs.map((log) => (
          <tr key={`${log.source}-${log.id}`}>
            <td>{dateTimeLabel(log.createdAt)}</td>
            <td>{log.source}</td>
            <td>{log.action}</td>
            <td>{log.subject}{log.subjectId ? `:${log.subjectId.slice(-6)}` : ""}</td>
            <td>{log.actor?.email ?? "-"}</td>
            <td>{log.status}</td>
            <td>{log.message ?? "-"}</td>
          </tr>
        )) : <tr><td colSpan={7}>No logs yet.</td></tr>}</tbody>
      </table>
    </section>
  );
}

function ProductsPanel() {
  return (
    <section className={styles.panel}>
      <div className={styles.panelHeader}>
        <div>
          <span className="eyebrow">Products</span>
          <h2>Produkt anlegen</h2>
        </div>
        <StatusPill label="Dev endpoint" tone="warn" />
      </div>
      <AdminProductManager />
    </section>
  );
}

function AnnouncementsPanel() {
  return (
    <section className={styles.panel}>
      <div className={styles.panelHeader}>
        <div>
          <span className="eyebrow">Announcements</span>
          <h2>Client Announcements</h2>
        </div>
      </div>
      <AnnouncementForm />
    </section>
  );
}

function SettingsPanel() {
  return (
    <section className={styles.panel}>
      <div className={styles.panelHeader}>
        <div>
          <span className="eyebrow">Automation</span>
          <h2>Cron Settings</h2>
        </div>
      </div>
      <SettingsForm />
    </section>
  );
}

function Placeholder({ icon: Icon, title, body }: { icon: typeof UsersRound; title: string; body: string }) {
  return (
    <section className={styles.module}>
      <Icon aria-hidden size={24} />
      <h2>{title}</h2>
      <p>{body}</p>
    </section>
  );
}

function adminTitle(view: AdminView) {
  return {
    announcements: "Announcements",
    blog: "Blog",
    clients: "Clients",
    "domain-prices": "Domain Prices",
    emails: "Emails",
    home: "Operations Console",
    invoices: "Invoices",
    knowledgebase: "Knowledgebase",
    logs: "Logs",
    orders: "Orders",
    products: "Products/Services",
    services: "Services",
    settings: "Automation Settings",
    "payment-gateways": "Payment Gateways",
    tickets: "Support Tickets"
  }[view];
}

function emptyEmailSettings(): ApiEmailAdminSettings {
  return {
    events: [],
    logs: [],
    placeholders: [],
    smtp: {},
    templateHtml: "",
    testVariables: {}
  };
}

function serviceKindLabel(type: string) {
  return { DOMAIN: "Domain", SHARED_HOSTING: "Hosting", VPS: "VPS" }[type] ?? type.toLowerCase().replaceAll("_", " ");
}

function stringValue(value: unknown) {
  return typeof value === "string" && value ? value : undefined;
}

function ticketLabel(status: string) {
  return { ANSWERED: "answered", CUSTOMER_REPLY: "customer-reply", WAITING_ON_CLIENT: "answered", WAITING_ON_STAFF: "customer-reply" }[status] ?? status.toLowerCase();
}

function dateLabel(value?: string | null) {
  return value ? new Intl.DateTimeFormat("de-DE", { dateStyle: "medium" }).format(new Date(value)) : "-";
}

function dateTimeLabel(value?: string | null) {
  return value ? new Intl.DateTimeFormat("de-DE", { dateStyle: "short", timeStyle: "short" }).format(new Date(value)) : "-";
}

function paymentGateway(invoice: ApiInvoice) {
  return invoice.transactions?.find((transaction) => transaction.status === "SUCCEEDED")?.method ?? "manual";
}

async function runMaintenance() {
  const { cookies } = await import("next/headers");
  const token = (await cookies()).get(ADMIN_AUTH_COOKIE)?.value;
  const headers = token ? { Authorization: `Bearer ${token}` } : undefined;
  const billing = await fetch(`${API_BASE_URL}/admin/dev/billing/maintenance`, { method: "POST", cache: "no-store", headers })
    .then((response) => (response.ok ? response.json() : null))
    .catch(() => null);
  await fetch(`${API_BASE_URL}/admin/dev/tickets/maintenance`, {
      body: JSON.stringify({ closeAfterHours: billing?.ticketCloseHours ?? 24 }),
      cache: "no-store",
      headers: { "Content-Type": "application/json", ...(headers ?? {}) },
      method: "POST"
    }).catch(() => null);
}
