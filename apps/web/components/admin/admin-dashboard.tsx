import Link from "next/link";
import { Bell, BookOpen, FileText, Mail, Package, Settings, Ticket, UsersRound } from "lucide-react";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import {
  cycleLabel,
  dateLabel as formatDate,
  invoiceDisplayNumber,
  money,
  serviceUnitPriceCents,
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
import { type Locale } from "../../lib/i18n";
import { getDictionary } from "../../lib/dictionary";
import { requestLocale } from "../../lib/server-locale";
import { LanguageToggle } from "../layout/language-toggle";
import { invoiceStatusLabel, invoiceStatusVisible, orderStatusLabel, serviceStatusLabel, ticketStatusLabel, ticketStatusTone } from "../../lib/status-labels";
import { apiGetAuth, redirectToAdminLogin } from "../../lib/server-api";
import { Button } from "../ui/button";
import { LogoutButton } from "../auth/logout-button";
import { StatusPill } from "../ui/status-pill";
import { AddClientForm, AdminsPanel, AnnouncementForm, ClientManager, CronSettingsForm, DomainPriceForm, NewOrderForm, OrderStatusForm, PaymentGatewayForm, SeoSettingsForm, SettingsForm } from "./admin-forms";
import { EmailSettingsForm } from "./email-admin-editor";
import { AdminCategoryManager, AdminProductManager } from "./admin-product-manager";
import { AdminDepartmentsPanel, AdminNewTicketPanel } from "./admin-departments";
import { AdminTicketDetail, KnowledgebasePanel } from "./admin-support";
import { AdminSidebar } from "./admin-sidebar";
import { LogsExplorer } from "./logs-explorer";
import { BlogPostList, BlogPostForm, BlogCategoryTagManager, AiContentManager, AiJobSettingsForm } from "./blog-admin";
import styles from "./admin-dashboard.module.css";

type AdminView =
  | "home"
  | "blog"
  | "blog-new"
  | "blog-categories"
  | "blog-ai-content"
  | "blog-ai-settings"
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
  | "tickets-new"
  | "tickets-departments"
  | "announcements"
  | "settings"
  | "settings-cron"
  | "settings-seo"
  | "admins";

export type EmailAdminSection = "emails" | "logs" | "settings" | "template";

export async function AdminDashboard({ blogEditId, emailSection = "emails", preselectedClientId, ticketId, view = "home" }: { blogEditId?: string; emailSection?: EmailAdminSection; preselectedClientId?: string; ticketId?: string; view?: AdminView }) {
  const locale = await requestLocale();
  const copy = getDictionary(locale).admin;
  const user = await apiGetAuth<AuthUser>("/users/me");
  if (!user?.roles.some((role) => role === "admin" || role === "staff")) {
    await redirectToAdminLogin();
  }

  const settings = (await apiGetAuth<{ adminTimezone?: string; siteLogoUrl?: string; vatPercent?: number }>("/admin/dev/billing/settings")) ?? {};
  const adminTimezone = settings.adminTimezone || "UTC";
  const stats = (await apiGetAuth<{ mrrCents: number; activeServices: number; openTickets: number; failedPayments: number }>(
    "/admin/dev/billing/dashboard"
  )) ?? { activeServices: 0, failedPayments: 0, mrrCents: 0, openTickets: 0 };

  const needsOrders = view === "home" || view === "orders";
  const needsClients = view === "clients" || view === "orders-new";
  const needsProducts = view === "clients" || view === "orders-new";
  const needsServices = view === "services";
  const needsInvoices = view === "invoices";
  const needsDomainPrices = view === "domain-prices" || view === "modules";
  const needsTickets = view === "tickets";
  const needsKnowledgebase = view === "knowledgebase";
  const needsEmail = view === "emails";

  const [orders, clients, products, services, invoices, domainPrices, tickets, knowledgebase, emailSettings] = await Promise.all([
    needsOrders ? apiGetAuth<ApiOrder[]>("/orders/admin").then((r) => r ?? []) : Promise.resolve([]),
    needsClients ? apiGetAuth<ApiClient[]>("/users").then((r) => r ?? []) : Promise.resolve([]),
    needsProducts ? apiGetAuth<ApiProduct[]>("/products").then((r) => r ?? []) : Promise.resolve([]),
    needsServices ? apiGetAuth<ApiService[]>("/admin/dev/services").then((r) => r ?? []) : Promise.resolve([]),
    needsInvoices ? apiGetAuth<ApiInvoice[]>("/admin/dev/billing/invoices").then((r) => r ?? []) : Promise.resolve([]),
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
            <span className="eyebrow">{copy.eyebrow.admin}</span>
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
        {view === "orders-new" ? <NewOrderPanel clients={clients} locale={locale} preselectedClientId={preselectedClientId} products={products} vatPercent={settings.vatPercent ?? 19} /> : null}
        {view === "domain-prices" ? <DomainPricesPanel locale={locale} prices={domainPrices} /> : null}
        {view === "clients" ? <ClientsPanel clients={clients} locale={locale} products={products} /> : null}
        {view === "clients-new" ? <ClientsNewPanel locale={locale} /> : null}
        {view === "services" ? <ServicesPanel locale={locale} services={services} /> : null}
        {view === "invoices" ? <InvoicesPanel invoices={invoices} locale={locale} /> : null}
        {view === "logs" ? <LogsExplorer locale={locale} timezone={adminTimezone} /> : null}
        {view === "tickets" && ticketId ? <AdminTicketDetail ticketId={ticketId} /> : null}
        {view === "tickets" && !ticketId ? <TicketsPanel locale={locale} tickets={tickets} /> : null}
        {view === "tickets-new" ? <AdminNewTicketPanel /> : null}
        {view === "tickets-departments" ? <AdminDepartmentsPanel /> : null}
        {view === "knowledgebase" ? <KnowledgebasePanel articles={knowledgebase} /> : null}
        {view === "blog" ? <BlogListPanel locale={locale} /> : null}
        {view === "blog-new" ? <BlogNewPanel editId={blogEditId} locale={locale} /> : null}
        {view === "blog-categories" ? <BlogCategoriesPanel locale={locale} /> : null}
        {view === "blog-ai-content" ? <BlogAiContentPanel locale={locale} /> : null}
        {view === "blog-ai-settings" ? <BlogAiSettingsPanel locale={locale} /> : null}
        {view === "products" ? <ProductsPanel locale={locale} /> : null}
        {view === "products-categories" ? <ProductCategoriesPanel locale={locale} /> : null}
        {view === "modules" ? <ModulesRedirect /> : null}
        {view === "payment-gateways" ? <PaymentGatewaysPanel locale={locale} /> : null}
        {view === "emails" ? <EmailsPanel locale={locale} section={emailSection} settings={emailSettings} timezone={adminTimezone} /> : null}
        {view === "announcements" ? <AnnouncementsPanel locale={locale} /> : null}
        {view === "settings" ? <SettingsPanel locale={locale} /> : null}
        {view === "settings-cron" ? <CronSettingsPanel locale={locale} /> : null}
        {view === "settings-seo" ? <SeoSettingsPanel locale={locale} /> : null}
        {view === "admins" ? <AdminsPanel /> : null}
      </main>
    </div>
  );
}

function DomainPricesPanel({ locale, prices }: { locale: Locale; prices: ApiDomainPrice[] }) {
  const copy = getDictionary(locale).admin;
  return (
    <section className={styles.panel}>
      <div className={styles.panelHeader}>
        <div>
          <span className="eyebrow">{copy.eyebrow.domains}</span>
          <h2>{copy.view.tldPrices}</h2>
        </div>
        <StatusPill label={`${prices.length} ${copy.misc.rows}`} tone={prices.length > 0 ? "good" : "warn"} />
      </div>
      <DomainPriceForm />
      <table className="table">
        <thead>
          <tr>
            <th>{copy.tld}</th>
            <th>{copy.action}</th>
            <th>{copy.years}</th>
            <th>{copy.price}</th>
            <th>{copy.manual}</th>
            <th>{copy.suggested}</th>
            <th>{copy.lastUpdate}</th>
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
                <td>{price.manual ? copy.misc.yes : copy.misc.no}</td>
                <td>{price.suggested ? copy.misc.yes : copy.misc.no}</td>
                <td>{shortDateLabel(price.updatedAt, locale)}</td>
              </tr>
            ))
          ) : (
            <tr>
              <td colSpan={7}>{copy.noDomainPrices}</td>
            </tr>
          )}
        </tbody>
      </table>
    </section>
  );
}

function ModuleGrid({ locale }: { locale: Locale }) {
  const copy = getDictionary(locale).admin;
  const modules = [
    { title: copy.clients, body: copy.card.clientsBody, href: "/admin/clients", icon: UsersRound },
    { title: copy.orders, body: copy.card.ordersBody, href: "/admin/orders", icon: Package },
    { title: copy.card.billingTitle, body: copy.card.billingBody, href: "/admin/invoices", icon: FileText },
    { title: copy.emails, body: copy.card.emailsBody, href: "/admin/emails", icon: Mail },
    { title: copy.card.supportTitle, body: copy.card.supportBody, href: "/admin/tickets", icon: Ticket },
    { title: copy.knowledgebase, body: copy.card.knowledgebaseBody, href: "/admin/knowledgebase", icon: BookOpen },
    { title: copy.blog, body: copy.card.blogBody, href: "/admin/blog", icon: FileText },
    { title: copy.products, body: copy.card.productsBody, href: "/admin/products", icon: Settings },
    { title: copy.announcements, body: copy.card.announcementsBody, href: "/admin/announcements", icon: Bell }
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

function PaymentGatewaysPanel({ locale }: { locale: Locale }) {
  const copy = getDictionary(locale).admin;
  return (
    <section className={styles.panel}>
      <div className={styles.panelHeader}>
        <div>
          <span className="eyebrow">{copy.eyebrow.billing}</span>
          <h2>{copy.paymentGateways}</h2>
        </div>
      </div>
      <PaymentGatewayForm />
    </section>
  );
}

function EmailsPanel({ locale, section, settings, timezone }: { locale: Locale; section: EmailAdminSection; settings: ApiEmailAdminSettings; timezone: string }) {
  const copy = getDictionary(locale).admin;
  const title = {
    emails: copy.emails,
    logs: copy.emailLogs,
    settings: copy.emailSettings,
    template: copy.emailTemplate
  }[section];
  return (
    <section className={styles.panel}>
      <div className={styles.panelHeader}>
        <div>
          <span className="eyebrow">{copy.eyebrow.messaging}</span>
          <h2>{title}</h2>
        </div>
      </div>
      <EmailSettingsForm initial={settings} section={section} timezone={timezone} />
    </section>
  );
}

function BlogListPanel({ locale }: { locale: Locale }) {
  const copy = getDictionary(locale).admin;
  return (
    <section className={styles.panel}>
      <div className={styles.panelHeader}>
        <div>
          <span className="eyebrow">{copy.eyebrow.cms}</span>
          <h2>{copy.view.blogPosts}</h2>
        </div>
        <Button href="/admin/blog/new" variant="secondary">{copy.btn.newPost}</Button>
      </div>
      <BlogPostList />
    </section>
  );
}

function BlogNewPanel({ editId, locale }: { editId?: string; locale: Locale }) {
  const copy = getDictionary(locale).admin;
  return (
    <section className={styles.panel}>
      <div className={styles.panelHeader}>
        <div>
          <span className="eyebrow">{copy.eyebrow.cms}</span>
          <h2>{editId ? copy.view.blogPostEdit : copy.view.blogPostNew}</h2>
        </div>
        <Button href="/admin/blog" variant="secondary">{copy.btn.allPosts}</Button>
      </div>
      <BlogPostForm editId={editId} />
    </section>
  );
}

function BlogCategoriesPanel({ locale }: { locale: Locale }) {
  const copy = getDictionary(locale).admin;
  return (
    <section className={styles.panel}>
      <div className={styles.panelHeader}>
        <div>
          <span className="eyebrow">{copy.eyebrow.cms}</span>
          <h2>{copy.view.categoriesTags}</h2>
        </div>
      </div>
      <BlogCategoryTagManager />
    </section>
  );
}

function BlogAiContentPanel({ locale }: { locale: Locale }) {
  const copy = getDictionary(locale).admin;
  return (
    <section className={styles.panel}>
      <div className={styles.panelHeader}>
        <div>
          <span className="eyebrow">{copy.eyebrow.ai}</span>
          <h2>{copy.view.aiContent}</h2>
        </div>
        <Button href="/admin/blog/ai-settings" variant="secondary">{copy.btn.jobSettings}</Button>
      </div>
      <AiContentManager />
    </section>
  );
}

function BlogAiSettingsPanel({ locale }: { locale: Locale }) {
  const copy = getDictionary(locale).admin;
  return (
    <section className={styles.panel}>
      <div className={styles.panelHeader}>
        <div>
          <span className="eyebrow">{copy.eyebrow.ai}</span>
          <h2>{copy.view.aiJobSettings}</h2>
        </div>
        <Button href="/admin/blog/ai-content" variant="secondary">{copy.btn.aiContent}</Button>
      </div>
      <AiJobSettingsForm />
    </section>
  );
}

function OrdersPanel({ locale, orders }: { locale: Locale; orders: ApiOrder[] }) {
  const copy = getDictionary(locale).admin;
  const sorted = [...orders].sort((a, b) => new Date(b.placedAt ?? b.createdAt).getTime() - new Date(a.placedAt ?? a.createdAt).getTime());
  return (
    <section className={styles.panel}>
      <div className={styles.panelHeader}>
        <div>
          <span className="eyebrow">{copy.eyebrow.orders}</span>
          <h2>{copy.orders}</h2>
        </div>
        <div className={styles.headerActions} style={{ gap: 8 }}>
          <StatusPill label={`${orders.length} ${copy.orders}`} tone={orders.length > 0 ? "good" : "neutral"} />
          <Button href="/admin/orders/new" variant="secondary">{copy.btn.newOrder}</Button>
        </div>
      </div>
      <table className="table">
        <thead>
          <tr>
            <th>{copy.order}</th>
            <th>{copy.col.date}</th>
            <th>{copy.client}</th>
            <th>{copy.status}</th>
            <th>{copy.invoices}</th>
            <th>{copy.col.items}</th>
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
                      <p><strong>{copy.invoices}:</strong> {order.invoice ? invoiceDisplayNumber(order.invoice) : "-"} ({order.invoice?.status ?? copy.misc.noInvoice})</p>
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
                <td>{order.user?.email ?? copy.misc.unknown}</td>
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

function NewOrderPanel({ clients, locale, preselectedClientId, products, vatPercent }: { clients: ApiClient[]; locale: Locale; preselectedClientId?: string; products: ApiProduct[]; vatPercent: number }) {
  const copy = getDictionary(locale).admin;
  return (
    <section className={styles.panel}>
      <div className={styles.panelHeader}>
        <div>
          <span className="eyebrow">{copy.eyebrow.orders}</span>
          <h2>{copy.view.newOrder}</h2>
        </div>
      </div>
      <NewOrderForm clients={clients} locale={locale} preselectedClientId={preselectedClientId} products={products} vatPercent={vatPercent} />
    </section>
  );
}

function ServicesPanel({ locale, services }: { locale: Locale; services: ApiService[] }) {
  const copy = getDictionary(locale).admin;
  return (
    <section className={styles.panel}>
      <div className={styles.panelHeader}>
        <div>
          <span className="eyebrow">{copy.eyebrow.services}</span>
          <h2>{copy.view.allServices}</h2>
        </div>
      </div>
      <table className="table">
        <thead>
          <tr>
            <th>{copy.col.service}</th>
            <th>{copy.col.pricing}</th>
            <th>{copy.col.nextDue}</th>
            <th>{copy.status}</th>
          </tr>
        </thead>
        <tbody>
          {services.map((service) => (
            <tr key={service.id}>
              <td><a href={`/admin/services/${service.id}`}>{service.product.name}</a><br />{service.domainRecords?.[0]?.domain ?? stringValue(service.configuration?.domainName) ?? serviceKindLabel(service.product.type)}</td>
              <td>{money(serviceUnitPriceCents(service), service.productPrice.currency, locale)} / {cycleLabel(service.productPrice.billingCycle, locale)}</td>
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

function ClientsPanel({ clients, locale, products }: { clients: ApiClient[]; locale: Locale; products: ApiProduct[] }) {
  const copy = getDictionary(locale).admin;
  return (
    <section className={styles.panel}>
      <div className={styles.panelHeader}>
        <div>
          <span className="eyebrow">{copy.eyebrow.clients}</span>
          <h2>{copy.clients}</h2>
        </div>
        <div className={styles.headerActions} style={{ gap: 8 }}>
          <StatusPill label={`${clients.length} ${copy.misc.clientsCount}`} tone={clients.length ? "good" : "neutral"} />
          <Button href="/admin/clients/new" variant="secondary">{copy.btn.addClient}</Button>
        </div>
      </div>
      <ClientManager clients={clients} locale={locale} products={products} />
    </section>
  );
}

function ClientsNewPanel({ locale }: { locale: Locale }) {
  const copy = getDictionary(locale).admin;
  return (
    <section className={styles.panel}>
      <div className={styles.panelHeader}>
        <div>
          <span className="eyebrow">{copy.eyebrow.clients}</span>
          <h2>{copy.view.addClient}</h2>
        </div>
        <Button href="/admin/clients" variant="secondary">{copy.btn.allClientsBack}</Button>
      </div>
      <AddClientForm />
    </section>
  );
}

function InvoicesPanel({ invoices, locale }: { invoices: ApiInvoice[]; locale: Locale }) {
  const copy = getDictionary(locale).admin;
  return (
    <section className={styles.panel}>
      <div className={styles.panelHeader}>
        <div>
          <span className="eyebrow">{copy.eyebrow.billing}</span>
          <h2>{copy.invoices}</h2>
        </div>
        <StatusPill label={`${invoices.length}`} tone="neutral" />
      </div>
      <table className="table">
        <thead>
          <tr>
            <th>{copy.col.invoice}</th>
            <th>{copy.client}</th>
            <th>{copy.col.issued}</th>
            <th>{copy.col.duePaid}</th>
            <th>{copy.total}</th>
            <th>{copy.status}</th>
          </tr>
        </thead>
        <tbody>
          {invoices.map((invoice) => (
            <tr key={invoice.id}>
              <td><a href={`/admin/invoices/${invoice.id}`}>{invoiceDisplayNumber(invoice)}</a></td>
              <td>{invoice.customerSnapshot?.name ?? "—"}</td>
              <td>{shortDateLabel(invoice.issuedAt, locale)}</td>
              <td>{shortDateLabel(invoice.status === "PAID" ? invoice.paidAt : invoice.dueAt, locale)}</td>
              <td>{money(invoice.totalCents, invoice.currency, locale)}</td>
              <td>
                {invoiceStatusVisible(invoice.status) ? (
                  <StatusPill
                    label={invoiceStatusLabel(invoice.status, locale)}
                    tone={invoice.status === "REFUNDED" ? "neutral" : "warn"}
                  />
                ) : "—"}
              </td>
            </tr>
          ))}
          {invoices.length === 0 ? <tr><td colSpan={6} style={{ color: "var(--muted)", textAlign: "center" }}>{copy.misc.noInvoicesYet}</td></tr> : null}
        </tbody>
      </table>
    </section>
  );
}

function TicketsPanel({ locale, tickets }: { locale: Locale; tickets: ApiTicket[] }) {
  const copy = getDictionary(locale).admin;
  return (
    <section className={styles.panel}>
      <div className={styles.panelHeader}>
        <div>
          <span className="eyebrow">{copy.eyebrow.support}</span>
          <h2>{copy.view.supportTickets}</h2>
        </div>
        <div className={styles.inlineForm}>
          <Button href="/admin/tickets/departments" variant="secondary">{copy.btn.departments}</Button>
          <Button href="/admin/tickets/new" variant="secondary">{copy.btn.newTicket}</Button>
        </div>
      </div>
      <table className="table">
        <thead>
          <tr>
            <th>{copy.department}</th>
            <th>{copy.subject}</th>
            <th>{copy.status}</th>
            <th>{copy.lastUpdate}</th>
          </tr>
        </thead>
        <tbody>
          {tickets.map((ticket) => (
            <tr key={ticket.id}>
              <td>{ticket.department?.name ?? ""}</td>
              <td><a href={`/admin/tickets/${ticket.id}`}>#{ticket.publicId ?? ticket.id.slice(-6).toUpperCase()} {ticket.subject}</a></td>
              <td>
                <StatusPill label={ticketStatusLabel(ticket.status, locale)} tone={ticketStatusTone(ticket.status)} />
              </td>
              <td>{shortDateLabel(ticket.updatedAt, locale)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}

function CronSettingsPanel({ locale }: { locale: Locale }) {
  const copy = getDictionary(locale).admin;
  const cron = copy.cron;
  const jobNames = ["domainPrices", "domainExpirations", "domainStatuses", "hostingStatuses", "billingMaintenance", "invoiceReminders", "ticketsClose", "mailboxes", "sitemap", "aiBlogPost"] as const;
  return (
    <section className={styles.panel}>
      <div className={styles.panelHeader}>
        <div>
          <span className="eyebrow">{copy.eyebrow.automation}</span>
          <h2>{copy.view.cronSettings}</h2>
        </div>
        <div className={styles.headerActions} style={{ gap: 8 }}>
          <Button href="/admin/logs" variant="secondary">{copy.btn.viewCronLogs}</Button>
          <Button href="/admin/settings" variant="secondary">{copy.btn.generalSettingsBack}</Button>
        </div>
      </div>

      <div style={{ padding: "0 16px 16px", borderBottom: "1px solid var(--border)" }}>
        <h3 style={{ margin: "0 0 12px", fontSize: "0.95rem" }}>{cron.whatHeading}</h3>
        <p style={{ color: "var(--muted)", fontSize: "0.88rem", margin: "0 0 12px", lineHeight: 1.6 }}>{cron.intro}</p>
        <table className="table" style={{ fontSize: "0.85rem" }}>
          <thead>
            <tr><th>{copy.col.job}</th><th>{copy.col.frequency}</th><th>{copy.col.whatItDoes}</th></tr>
          </thead>
          <tbody>
            {jobNames.map((job) => (
              <tr key={job}>
                <td>{job}</td>
                <td>{cron.freq[job]}</td>
                <td dangerouslySetInnerHTML={{ __html: cron.desc[job] }} />
              </tr>
            ))}
          </tbody>
        </table>
        <p style={{ color: "var(--muted)", fontSize: "0.82rem", margin: "10px 0 0", lineHeight: 1.6 }} dangerouslySetInnerHTML={{ __html: cron.heartbeatHtml }} />

        <h3 style={{ margin: "20px 0 10px", fontSize: "0.95rem" }}>{cron.activateHeading}</h3>
        <p style={{ color: "var(--muted)", fontSize: "0.88rem", margin: "0 0 8px", lineHeight: 1.6 }} dangerouslySetInnerHTML={{ __html: cron.activateIntroHtml }} />
        <pre style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 8, padding: "12px 16px", fontSize: "0.82rem", overflowX: "auto", margin: "0 0 8px" }}>{`0 * * * * curl -s -X POST "https://www.dezhost.com/api/v1/cron?token=YOUR_SECRET" > /dev/null`}</pre>
        <p style={{ color: "var(--muted)", fontSize: "0.85rem", margin: 0, lineHeight: 1.6 }} dangerouslySetInnerHTML={{ __html: cron.replaceSecretHtml }} />
      </div>

      <CronSettingsForm />
    </section>
  );
}

function ProductsPanel({ locale }: { locale: Locale }) {
  const copy = getDictionary(locale).admin;
  return (
    <section className={styles.panel}>
      <div className={styles.panelHeader}>
        <div>
          <span className="eyebrow">{copy.eyebrow.products}</span>
          <h2>{copy.view.products}</h2>
        </div>
        <div className={styles.headerActions} style={{ gap: 8 }}>
          <Button href="/admin/products/categories" variant="secondary">{copy.btn.categories}</Button>
          <Button href="/admin/products/modules" variant="secondary">{copy.btn.modules}</Button>
        </div>
      </div>
      <AdminProductManager />
    </section>
  );
}

function ProductCategoriesPanel({ locale }: { locale: Locale }) {
  const copy = getDictionary(locale).admin;
  return (
    <section className={styles.panel}>
      <div className={styles.panelHeader}>
        <div>
          <span className="eyebrow">{copy.eyebrow.products}</span>
          <h2>{copy.view.categories}</h2>
        </div>
        <Button href="/admin/products" variant="secondary">{copy.btn.backToProducts}</Button>
      </div>
      <AdminCategoryManager />
    </section>
  );
}

function ModulesRedirect(): never {
  redirect("/admin/products/modules" as never);
}

function AnnouncementsPanel({ locale }: { locale: Locale }) {
  const copy = getDictionary(locale).admin;
  return (
    <section className={styles.panel}>
      <div className={styles.panelHeader}>
        <div>
          <span className="eyebrow">{copy.eyebrow.announcements}</span>
          <h2>{copy.view.clientAnnouncements}</h2>
        </div>
      </div>
      <AnnouncementForm />
    </section>
  );
}

function SettingsPanel({ locale }: { locale: Locale }) {
  const copy = getDictionary(locale).admin;
  return (
    <section className={styles.panel}>
      <div className={styles.panelHeader}>
        <div>
          <span className="eyebrow">{copy.eyebrow.system}</span>
          <h2>{copy.view.generalSettings}</h2>
        </div>
        <div className={styles.headerActions} style={{ gap: 8 }}>
          <Button href="/admin/settings/seo" variant="secondary">{copy.btn.seoSettings}</Button>
          <Button href="/admin/settings/cron" variant="secondary">{copy.btn.cronSettings}</Button>
        </div>
      </div>
      <SettingsForm />
    </section>
  );
}

function SeoSettingsPanel({ locale }: { locale: Locale }) {
  const copy = getDictionary(locale).admin;
  return (
    <section className={styles.panel}>
      <div className={styles.panelHeader}>
        <div>
          <span className="eyebrow">{copy.eyebrow.seo}</span>
          <h2>{copy.view.seoSocial}</h2>
        </div>
        <Button href="/admin/settings" variant="secondary">{copy.btn.generalSettingsBack}</Button>
      </div>
      <SeoSettingsForm />
    </section>
  );
}

function adminTitle(view: AdminView, locale: Locale) {
  const copy = getDictionary(locale).admin;
  const titles: Record<AdminView, string> = {
    announcements: copy.announcements,
    blog: copy.blog,
    "blog-new": copy.view.blogPostNew,
    "blog-categories": copy.view.categoriesTags,
    "blog-ai-content": copy.view.aiContent,
    "blog-ai-settings": copy.view.aiJobSettings,
    clients: copy.clients,
    "clients-new": copy.view.addClient,
    "domain-prices": copy.domainPrices,
    emails: copy.emails,
    home: copy.view.operationsConsole,
    invoices: copy.invoices,
    knowledgebase: copy.knowledgebase,
    logs: copy.logs,
    modules: copy.view.modules,
    orders: copy.orders,
    "orders-new": copy.view.newOrder,
    products: copy.products,
    "products-categories": copy.view.categories,
    services: copy.services,
    settings: copy.settings,
    "settings-cron": copy.view.cronSettings,
    "settings-seo": copy.view.seoSocial,
    admins: copy.view.admins,
    "payment-gateways": copy.paymentGateways,
    tickets: copy.tickets,
    "tickets-new": copy.view.newTicket,
    "tickets-departments": copy.view.departments
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


function shortDateLabel(value?: string | null, locale: Locale = "de", timezone?: string) {
  return formatDate(value, locale, { day: "2-digit", month: "2-digit", year: "2-digit", ...(timezone ? { timeZone: timezone } : {}) });
}

function dateTimeLabel(value?: string | null, locale: Locale = "de", timezone?: string) {
  return formatDate(value, locale, { dateStyle: "short", timeStyle: "short", ...(timezone ? { timeZone: timezone } : {}) });
}

// Cron log rendering helpers (cronLogStatus / cronJobSummary) now live in lib/cron-log.ts so the
// client-side Logs explorer can share them; the cron activity table moved to Settings → Logs.
