import { Bell, FileText, Package, Settings, Ticket, UsersRound } from "lucide-react";
import {
  API_BASE_URL,
  apiGet,
  money,
  type ApiInvoice,
  type ApiDomainPrice,
  type ApiOrder,
  type ApiService,
  type ApiTicket
} from "../../lib/api";
import { Button } from "../ui/button";
import { StatusPill } from "../ui/status-pill";
import { AnnouncementForm, DomainPriceForm, OrderStatusForm, SettingsForm } from "./admin-forms";
import { AdminProductManager } from "./admin-product-manager";
import styles from "./admin-dashboard.module.css";

type AdminView =
  | "home"
  | "clients"
  | "orders"
  | "domain-prices"
  | "invoices"
  | "products"
  | "services"
  | "tickets"
  | "announcements"
  | "settings";

export async function AdminDashboard({ view = "home" }: { view?: AdminView }) {
  await runMaintenance();

  const orders = (await apiGet<ApiOrder[]>("/orders/admin")) ?? [];
  const services = (await apiGet<ApiService[]>("/admin/dev/services")) ?? [];
  const invoices = (await apiGet<ApiInvoice[]>("/admin/dev/billing/invoices")) ?? [];
  const domainPrices = (await apiGet<ApiDomainPrice[]>("/orders/admin/domain-prices")) ?? [];
  const tickets = (await apiGet<ApiTicket[]>("/admin/dev/tickets")) ?? [];
  const stats = (await apiGet<{ mrrCents: number; activeServices: number; openTickets: number; failedPayments: number }>(
    "/admin/dev/billing/dashboard"
  )) ?? { activeServices: 0, failedPayments: 0, mrrCents: 0, openTickets: 0 };

  return (
    <div className={styles.page}>
      <aside className={styles.sidebar}>
        <strong>CrimsonGrid</strong>
        <nav>
          <a href="/admin">Home</a>
          <a href="/admin/clients">Clients</a>
          <a href="/admin/orders">Orders</a>
          <a href="/admin/domain-prices">Domain Prices</a>
          <a href="/admin/services">Services</a>
          <a href="/admin/products">Products/Services</a>
          <a href="/admin/invoices">Invoices</a>
          <a href="/admin/tickets">Support Tickets</a>
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
        {view === "clients" ? <Placeholder icon={UsersRound} title="Clients" body="Client list is ready for admin auth UI." /> : null}
        {view === "services" ? <ServicesPanel services={services} /> : null}
        {view === "invoices" ? <InvoicesPanel invoices={invoices} /> : null}
        {view === "tickets" ? <TicketsPanel tickets={tickets} /> : null}
        {view === "products" ? <ProductsPanel /> : null}
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
                <td>{money(price.amountCents, price.currency)}</td>
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
    { title: "Support", body: "Tickets, departments, statuses, replies.", href: "/admin/tickets", icon: Ticket },
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
                    <summary>{order.orderNumber}</summary>
                    <div className={styles.orderDetails}>
                      <p><strong>Invoice:</strong> {order.invoice?.invoiceNumber ?? "-"} ({order.invoice?.status ?? "no invoice"})</p>
                      <p><strong>Status:</strong> {orderLabel(order.status)}</p>
                      <OrderStatusForm orderId={order.id} status={order.status} />
                      <table className="table">
                        <tbody>
                          {order.items.map((item) => (
                            <tr key={item.id}>
                              <td>{item.description}</td>
                              <td>{item.domainName ?? "-"}</td>
                              <td>{item.provisioningStatus}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </details>
                </td>
                <td>{order.user?.email ?? "unknown"}</td>
                <td>
                  <StatusPill label={orderLabel(order.status)} tone={order.status === "COMPLETE" ? "good" : order.status === "CANCELLED" ? "neutral" : "warn"} />
                </td>
                <td>{order.items.map((item) => item.description).join(", ")}</td>
                <td>{money(order.totalCents, order.currency)}</td>
              </tr>
            ))
          ) : (
            <tr>
              <td colSpan={5}>Noch keine Bestellungen oder API nicht erreichbar.</td>
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
              <td>{service.product.name}</td>
              <td>{money(service.productPrice.amountCents, service.productPrice.currency)} / {service.productPrice.billingCycle}</td>
              <td>{dateLabel(service.renewsAt)}</td>
              <td>
                <StatusPill label={service.status} tone={service.status === "ACTIVE" ? "good" : "warn"} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
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
      <table className="table">
        <thead>
          <tr>
            <th>Invoice</th>
            <th>Issued</th>
            <th>Due</th>
            <th>Total</th>
            <th>Status</th>
          </tr>
        </thead>
        <tbody>
          {invoices.map((invoice) => (
            <tr key={invoice.id}>
              <td>{invoice.invoiceNumber}</td>
              <td>{dateLabel(invoice.issuedAt)}</td>
              <td>{dateLabel(invoice.dueAt)}</td>
              <td>{money(invoice.totalCents, invoice.currency)}</td>
              <td>
                <StatusPill label={invoice.status.toLowerCase()} tone={invoice.status === "PAID" ? "good" : "warn"} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
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
              <td>{ticket.subject}</td>
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
          <h2>Write Announcement</h2>
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
    clients: "Clients",
    "domain-prices": "Domain Prices",
    home: "Operations Console",
    invoices: "Invoices",
    orders: "Orders",
    products: "Products/Services",
    services: "Services",
    settings: "Automation Settings",
    tickets: "Support Tickets"
  }[view];
}

function orderLabel(status: string) {
  if (status === "COMPLETE") {
    return "completed";
  }
  if (status === "CANCELLED") {
    return "Canceled";
  }
  return "In Progress";
}

function ticketLabel(status: string) {
  return { WAITING_ON_CLIENT: "answered", WAITING_ON_STAFF: "customer-reply" }[status] ?? status.toLowerCase();
}

function dateLabel(value?: string | null) {
  return value ? new Intl.DateTimeFormat("de-DE", { dateStyle: "medium" }).format(new Date(value)) : "-";
}

async function runMaintenance() {
  const billing = await fetch(`${API_BASE_URL}/admin/dev/billing/maintenance`, { method: "POST", cache: "no-store" })
    .then((response) => (response.ok ? response.json() : null))
    .catch(() => null);
  await fetch(`${API_BASE_URL}/admin/dev/tickets/maintenance`, {
      body: JSON.stringify({ closeAfterHours: billing?.ticketCloseHours ?? 24 }),
      cache: "no-store",
      headers: { "Content-Type": "application/json" },
      method: "POST"
    }).catch(() => null);
}
