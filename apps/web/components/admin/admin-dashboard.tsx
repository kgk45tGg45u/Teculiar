import Link from "next/link";
import { Bell, BookOpen, FileText, Mail, Package, Settings, Ticket, UsersRound } from "lucide-react";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import {
  cycleLabel,
  dateLabel as formatDate,
  invoiceDisplayNumber,
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
import { dictionary, type Locale } from "../../lib/i18n";
import { requestLocale } from "../../lib/server-locale";
import { LanguageToggle } from "../layout/language-toggle";
import { invoiceStatusLabel, orderStatusLabel, serviceStatusLabel } from "../../lib/status-labels";
import { apiGetAuth } from "../../lib/server-api";
import { Button } from "../ui/button";
import { LogoutButton } from "../auth/logout-button";
import { StatusPill } from "../ui/status-pill";
import { AddClientForm, AdminInvoiceActions, AnnouncementForm, BlogManager, ClientManager, DomainPriceForm, NewOrderForm, OrderStatusForm, PaymentGatewayForm, SettingsForm } from "./admin-forms";
import { EmailSettingsForm } from "./email-admin-editor";
import { AdminCategoryManager, AdminProductManager } from "./admin-product-manager";
import { KnowledgebasePanel } from "./admin-support";
import { AdminSidebar } from "./admin-sidebar";
import styles from "./admin-dashboard.module.css";

type AdminView =
  | "home"
  | "blog"
  | "clients"
  | "clients-new"
  | "orders"
  | "orders-new"
  | "domain-prices"
  | "emails"
  | "invoices"
  | "logs"
  | "knowledgebase"
  | "payment-gateways"
  | "products"
  | "products-categories"
  | "modules"
  | "services"
  | "tickets"
  | "announcements"
  | "settings"
  | "settings-cron";

export type EmailAdminSection = "emails" | "logs" | "settings" | "template";

export async function AdminDashboard({ emailSection = "emails", view = "home" }: { emailSection?: EmailAdminSection; view?: AdminView }) {
  const locale = await requestLocale();
  const copy = dictionary[locale].admin;
  const user = await apiGetAuth<AuthUser>("/users/me");
  if (!user?.roles.some((role) => role === "admin" || role === "staff")) {
    redirect("/admin/login" as never);
  }

  const settings = (await apiGetAuth<{ siteLogoUrl?: string }>("/admin/dev/billing/settings")) ?? {};
  const stats = (await apiGetAuth<{ mrrCents: number; activeServices: number; openTickets: number; failedPayments: number }>(
    "/admin/dev/billing/dashboard"
  )) ?? { activeServices: 0, failedPayments: 0, mrrCents: 0, openTickets: 0 };

  const needsOrders = view === "home" || view === "orders";
  const needsClients = view === "clients" || view === "orders-new";
  const needsProducts = view === "clients" || view === "orders-new";
  const needsServices = view === "services";
  const needsInvoices = view === "invoices";
  const needsLogs = view === "logs" || view === "settings-cron";
  const needsDomainPrices = view === "domain-prices" || view === "modules";
  const needsTickets = view === "tickets";
  const needsKnowledgebase = view === "knowledgebase";
  const needsEmail = view === "emails";

  const [orders, clients, products, services, invoices, logs, domainPrices, tickets, knowledgebase, emailSettings] = await Promise.all([
    needsOrders ? apiGetAuth<ApiOrder[]>("/orders/admin").then((r) => r ?? []) : Promise.resolve([]),
    needsClients ? apiGetAuth<ApiClient[]>("/users").then((r) => r ?? []) : Promise.resolve([]),
    needsProducts ? apiGetAuth<ApiProduct[]>("/products").then((r) => r ?? []) : Promise.resolve([]),
    needsServices ? apiGetAuth<ApiService[]>("/admin/dev/services").then((r) => r ?? []) : Promise.resolve([]),
    needsInvoices ? apiGetAuth<ApiInvoice[]>("/admin/dev/billing/invoices").then((r) => r ?? []) : Promise.resolve([]),
    needsLogs ? apiGetAuth<ApiActionLog[]>("/admin/dev/logs").then((r) => r ?? []) : Promise.resolve([]),
    needsDomainPrices ? apiGetAuth<ApiDomainPrice[]>("/orders/admin/domain-prices").then((r) => r ?? []) : Promise.resolve([]),
    needsTickets ? apiGetAuth<ApiTicket[]>("/admin/dev/tickets").then((r) => r ?? []) : Promise.resolve([]),
    needsKnowledgebase ? apiGetAuth<ApiKnowledgebaseArticle[]>("/admin/dev/knowledgebase").then((r) => r ?? []) : Promise.resolve([]),
    needsEmail ? apiGetAuth<ApiEmailAdminSettings>("/admin/dev/emails").then((r) => r ?? emptyEmailSettings()) : Promise.resolve(emptyEmailSettings())
  ]);

  return (
    <div className={styles.page}>
      <AdminSidebar brandLogo={settings.siteLogoUrl} />
      <main className={styles.main}>
        <header className={styles.header}>
          <div>
            <span className="eyebrow">Admin</span>
            <h1>{adminTitle(view, locale)}</h1>
          </div>
          <div className={styles.globalActions}>
            <Suspense>
              <LanguageToggle locale={locale} />
            </Suspense>
            <Button href={`/${locale}`} variant="secondary">
              {copy.website}
            </Button>
            <LogoutButton scope="admin" redirectTo="/admin/login" />
          </div>
        </header>

        <section className={styles.metrics}>
          <Link className="metric" href="/admin/invoices">
            <strong>{money(stats.mrrCents, "EUR", locale)}</strong>
            <span>MRR</span>
          </Link>
          <Link className="metric" href="/admin/services">
            <strong>{stats.activeServices}</strong>
            <span>{copy.activeServices}</span>
          </Link>
          <Link className="metric" href="/admin/tickets">
            <strong>{stats.openTickets}</strong>
            <span>{copy.openTickets}</span>
          </Link>
          <Link className="metric" href="/admin/invoices">
            <strong>{stats.failedPayments}</strong>
            <span>{copy.failedPayments}</span>
          </Link>
        </section>

        {view === "home" ? <ModuleGrid locale={locale} /> : null}
        {view === "home" || view === "orders" ? <OrdersPanel locale={locale} orders={orders} /> : null}
        {view === "orders-new" ? <NewOrderPanel clients={clients} products={products} locale={locale} /> : null}
        {view === "domain-prices" ? <DomainPricesPanel locale={locale} prices={domainPrices} /> : null}
        {view === "clients" ? <ClientsPanel clients={clients} products={products} /> : null}
        {view === "clients-new" ? <ClientsNewPanel /> : null}
        {view === "services" ? <ServicesPanel locale={locale} services={services} /> : null}
        {view === "invoices" ? <InvoicesPanel invoices={invoices} locale={locale} /> : null}
        {view === "logs" ? <LogsPanel locale={locale} logs={logs} /> : null}
        {view === "tickets" ? <TicketsPanel locale={locale} tickets={tickets} /> : null}
        {view === "knowledgebase" ? <KnowledgebasePanel articles={knowledgebase} /> : null}
        {view === "blog" ? <BlogPanel /> : null}
        {view === "products" ? <ProductsPanel /> : null}
        {view === "products-categories" ? <ProductCategoriesPanel /> : null}
        {view === "modules" ? <ModulesRedirect /> : null}
        {view === "payment-gateways" ? <PaymentGatewaysPanel /> : null}
        {view === "emails" ? <EmailsPanel section={emailSection} settings={emailSettings} /> : null}
        {view === "announcements" ? <AnnouncementsPanel /> : null}
        {view === "settings" ? <SettingsPanel /> : null}
        {view === "settings-cron" ? <CronSettingsPanel locale={locale} logs={logs} /> : null}
      </main>
    </div>
  );
}

function DomainPricesPanel({ locale, prices }: { locale: Locale; prices: ApiDomainPrice[] }) {
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
                <td>{price.amountCents > 0 ? money(price.amountCents, price.currency, locale) : "Resell.biz"}</td>
                <td>{price.manual ? "yes" : "no"}</td>
                <td>{price.suggested ? "yes" : "no"}</td>
                <td>{shortDateLabel(price.updatedAt, locale)}</td>
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

function ModuleGrid({ locale }: { locale: Locale }) {
  const copy = dictionary[locale].admin;
  const isDE = locale === "de";
  const modules = [
    { title: copy.clients, body: isDE ? "Kunden, Kontakte, Segmente und E-Mail Logs." : "Clients, contacts, segments, email logs.", href: "/admin/clients", icon: UsersRound },
    { title: copy.orders, body: isDE ? "Bestellqueue mit 6-stelligen Bestellnummern." : "Order queue with 6 digit order numbers.", href: "/admin/orders", icon: Package },
    { title: isDE ? "Abrechnung" : "Billing", body: isDE ? "Rechnungen, Transaktionen, Guthaben und Anbieter." : "Invoices, transactions, add funds, processors.", href: "/admin/invoices", icon: FileText },
    { title: copy.emails, body: isDE ? "SMTP Einstellungen, Vorlagen und lokaler Ausgang." : "SMTP settings, templates, and local outbox.", href: "/admin/emails", icon: Mail },
    { title: "Support", body: isDE ? "Tickets, Abteilungen, Status und Antworten." : "Tickets, departments, statuses, replies.", href: "/admin/tickets", icon: Ticket },
    { title: copy.knowledgebase, body: isDE ? "Öffentliche Hilfeartikel und Ticketbausteine." : "Public help articles and ticket reply inserts.", href: "/admin/knowledgebase", icon: BookOpen },
    { title: copy.blog, body: isDE ? "Artikel, SEO Keywords, Bilder und KI Briefings." : "Articles, SEO keywords, images, AI briefs.", href: "/admin/blog", icon: FileText },
    { title: copy.products, body: isDE ? "Produkte, Services und Preiszyklen." : "Products, services, pricing cycles.", href: "/admin/products", icon: Settings },
    { title: copy.announcements, body: isDE ? "Ankündigungen für den Kundenbereich schreiben." : "Write client portal announcements.", href: "/admin/announcements", icon: Bell }
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

function OrdersPanel({ locale, orders }: { locale: Locale; orders: ApiOrder[] }) {
  const copy = dictionary[locale].admin;
  const sorted = [...orders].sort((a, b) => new Date(b.placedAt ?? b.createdAt).getTime() - new Date(a.placedAt ?? a.createdAt).getTime());
  return (
    <section className={styles.panel}>
      <div className={styles.panelHeader}>
        <div>
          <span className="eyebrow">Orders</span>
          <h2>{copy.orders}</h2>
        </div>
        <div className={styles.headerActions} style={{ gap: 8 }}>
          <StatusPill label={`${orders.length} ${copy.orders}`} tone={orders.length > 0 ? "good" : "neutral"} />
          <Button href="/admin/orders/new" variant="secondary">New Order</Button>
        </div>
      </div>
      <table className="table">
        <thead>
          <tr>
            <th>{copy.order}</th>
            <th>Date</th>
            <th>{copy.client}</th>
            <th>{copy.status}</th>
            <th>{copy.invoices}</th>
            <th>Items</th>
            <th>{copy.total}</th>
          </tr>
        </thead>
        <tbody>
          {sorted.length ? (
            sorted.map((order) => (
              <tr key={order.id}>
                <td>
                  <details>
                    <summary><a href={`/admin/orders/${order.id}`}>{order.orderNumber}</a></summary>
                    <div className={styles.orderDetails}>
                      <p><strong>{copy.invoices}:</strong> {order.invoice ? invoiceDisplayNumber(order.invoice) : "-"} ({order.invoice?.status ?? "no invoice"})</p>
                      <p><strong>{copy.status}:</strong> {orderStatusLabel(order.status, locale)}</p>
                      <OrderStatusForm orderId={order.id} status={order.status} />
                      <table className="table">
                        <tbody>
                          {order.items.map((item) => (
                            <tr key={item.id}>
                              <td>{item.description}</td>
                              <td>{item.domainName ?? "-"}</td>
                              <td>{serviceStatusLabel(item.provisioningStatus, locale)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </details>
                </td>
                <td>{shortDateLabel(order.placedAt ?? order.createdAt, locale)}</td>
                <td>{order.user?.email ?? "unknown"}</td>
                <td>
                  <StatusPill label={orderStatusLabel(order.status, locale)} tone={order.status === "COMPLETE" ? "good" : order.status === "CANCELLED" ? "neutral" : "warn"} />
                </td>
                <td>{order.invoice ? <a href={`/admin/invoices/${order.invoice.id}`}>{invoiceDisplayNumber(order.invoice)}</a> : "-"}</td>
                <td>{order.items.map((item) => item.description).join(", ")}</td>
                <td>{money(order.totalCents, order.currency, locale)}</td>
              </tr>
            ))
          ) : (
            <tr>
              <td colSpan={7}>{copy.noOrders}</td>
            </tr>
          )}
        </tbody>
      </table>
    </section>
  );
}

function NewOrderPanel({ clients, locale, products }: { clients: ApiClient[]; locale: Locale; products: ApiProduct[] }) {
  return (
    <section className={styles.panel}>
      <div className={styles.panelHeader}>
        <div>
          <span className="eyebrow">Orders</span>
          <h2>New Order</h2>
        </div>
      </div>
      <NewOrderForm clients={clients} locale={locale} products={products} />
    </section>
  );
}

function ServicesPanel({ locale, services }: { locale: Locale; services: ApiService[] }) {
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
              <td>{money(service.productPrice.amountCents, service.productPrice.currency, locale)} / {cycleLabel(service.productPrice.billingCycle, locale)}</td>
              <td>{shortDateLabel(service.renewsAt, locale)}</td>
              <td>
                <StatusPill label={serviceStatusLabel(service.status, locale)} tone={service.status === "ACTIVE" ? "good" : "warn"} />
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
        <div className={styles.headerActions} style={{ gap: 8 }}>
          <StatusPill label={`${clients.length} clients`} tone={clients.length ? "good" : "neutral"} />
          <Button href="/admin/clients/new" variant="secondary">Add Client</Button>
        </div>
      </div>
      <ClientManager clients={clients} products={products} />
    </section>
  );
}

function ClientsNewPanel() {
  return (
    <section className={styles.panel}>
      <div className={styles.panelHeader}>
        <div>
          <span className="eyebrow">Clients</span>
          <h2>Add Client</h2>
        </div>
        <Button href="/admin/clients" variant="secondary">← All Clients</Button>
      </div>
      <AddClientForm />
    </section>
  );
}

function InvoicesPanel({ invoices, locale }: { invoices: ApiInvoice[]; locale: Locale }) {
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
            <div><span>Invoice</span><strong><a href={`/admin/invoices/${invoice.id}`}>{invoiceDisplayNumber(invoice)}</a></strong></div>
            <div><span>Issued</span><strong>{shortDateLabel(invoice.issuedAt, locale)}</strong></div>
            <div><span>Due</span><strong>{shortDateLabel(invoice.dueAt, locale)}</strong></div>
            {invoice.status === "PAID" ? <div><span>Paid</span><strong>{shortDateLabel(invoice.paidAt, locale)}</strong></div> : null}
            {invoice.status === "PAID" ? <div><span>Gateway</span><strong>{paymentGateway(invoice)}</strong></div> : null}
            <div><span>Total</span><strong>{money(invoice.totalCents, invoice.currency, locale)}</strong></div>
            <StatusPill label={invoiceStatusLabel(invoice.status, locale)} tone={invoice.status === "PAID" ? "good" : "warn"} />
            <AdminInvoiceActions invoice={invoice} />
          </div>
        ))}
      </div>
    </section>
  );
}

function TicketsPanel({ locale, tickets }: { locale: Locale; tickets: ApiTicket[] }) {
  return (
    <section className={styles.panel}>
      <div className={styles.panelHeader}>
        <div>
          <span className="eyebrow">Support</span>
          <h2>Support Tickets</h2>
        </div>
        <Button href="/admin/tickets/new" variant="secondary">New Ticket</Button>
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
              <td>{shortDateLabel(ticket.updatedAt, locale)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}

function LogsPanel({ locale, logs }: { locale: Locale; logs: ApiActionLog[] }) {
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
            <td>{dateTimeLabel(log.createdAt, locale)}</td>
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

function CronSettingsPanel({ locale, logs }: { locale: Locale; logs: ApiActionLog[] }) {
  const cronLogs = logs.filter((log) => log.source === "cron");
  return (
    <section className={styles.panel}>
      <div className={styles.panelHeader}>
        <div>
          <span className="eyebrow">Automation</span>
          <h2>Cron Settings</h2>
        </div>
        <Button href="/admin/settings" variant="secondary">← General Settings</Button>
      </div>
      <SettingsForm />
      {cronLogs.length > 0 && (
        <div style={{ padding: "0 16px 16px" }}>
          <h3 style={{ margin: "12px 0 8px", fontSize: "0.9rem" }}>Recent Cron Activity</h3>
          <table className="table">
            <thead><tr><th>Time</th><th>Action</th><th>Status</th><th>Message</th></tr></thead>
            <tbody>
              {cronLogs.slice(0, 20).map((log) => (
                <tr key={log.id}>
                  <td>{dateTimeLabel(log.createdAt, locale)}</td>
                  <td>{log.action}</td>
                  <td>{log.status}</td>
                  <td>{log.message ?? "-"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

function ProductsPanel() {
  return (
    <section className={styles.panel}>
      <div className={styles.panelHeader}>
        <div>
          <span className="eyebrow">Products</span>
          <h2>Products</h2>
        </div>
        <div className={styles.headerActions} style={{ gap: 8 }}>
          <Button href="/admin/products/categories" variant="secondary">Categories</Button>
          <Button href="/admin/products/modules" variant="secondary">Modules</Button>
        </div>
      </div>
      <AdminProductManager />
    </section>
  );
}

function ProductCategoriesPanel() {
  return (
    <section className={styles.panel}>
      <div className={styles.panelHeader}>
        <div>
          <span className="eyebrow">Products</span>
          <h2>Categories</h2>
        </div>
        <Button href="/admin/products" variant="secondary">← Back to Products</Button>
      </div>
      <AdminCategoryManager />
    </section>
  );
}

function ModulesRedirect(): never {
  redirect("/admin/products/modules" as never);
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
          <span className="eyebrow">System</span>
          <h2>General Settings</h2>
        </div>
        <Button href="/admin/settings/cron" variant="secondary">Cron Settings →</Button>
      </div>
      <SettingsForm />
    </section>
  );
}

function adminTitle(view: AdminView, locale: Locale) {
  const copy = dictionary[locale].admin;
  const titles: Record<AdminView, string> = {
    announcements: copy.announcements,
    blog: copy.blog,
    clients: copy.clients,
    "clients-new": "Add Client",
    "domain-prices": copy.domainPrices,
    emails: copy.emails,
    home: locale === "de" ? "Betriebskonsole" : "Operations Console",
    invoices: copy.invoices,
    knowledgebase: copy.knowledgebase,
    logs: copy.logs,
    modules: "Modules",
    orders: copy.orders,
    "orders-new": "New Order",
    products: copy.products,
    "products-categories": "Categories",
    services: copy.services,
    settings: copy.settings,
    "settings-cron": "Cron Settings",
    "payment-gateways": copy.paymentGateways,
    tickets: copy.tickets
  };
  return titles[view];
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

function shortDateLabel(value?: string | null, locale: Locale = "de") {
  return formatDate(value, locale, { day: "2-digit", month: "2-digit", year: "2-digit" });
}

function dateTimeLabel(value?: string | null, locale: Locale = "de") {
  return formatDate(value, locale, { dateStyle: "short", timeStyle: "short" });
}

function paymentGateway(invoice: ApiInvoice) {
  return invoice.transactions?.find((transaction) => transaction.status === "SUCCEEDED")?.method ?? "manual";
}
