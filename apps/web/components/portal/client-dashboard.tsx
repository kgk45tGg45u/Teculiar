"use client";

import { BarChart3, BookOpen, CreditCard, Database, ExternalLink, FileText, Globe, HardDrive, KeyRound, LifeBuoy, Mail, Paperclip, Send, Server, UserRound, UsersRound, Wallet } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import {
  API_BASE_URL,
  authHeaders,
  currentLocale,
  cycleLabel,
  dateLabel as formatDate,
  money,
  type ApiAnnouncement,
  type ApiInvoice,
  type ApiKnowledgebaseArticle,
  type ApiService,
  type ApiTicket
} from "../../lib/api";
import { invoiceStatusLabel, serviceStatusLabel } from "../../lib/status-labels";
import type { Locale } from "../../lib/i18n";
import { Button } from "../ui/button";
import { LogoutButton } from "../auth/logout-button";
import { StatusPill } from "../ui/status-pill";
import { notify, notifyResponse } from "../ui/toast-provider";
import styles from "./client-dashboard.module.css";

type ClientView = "dashboard" | "services" | "domains" | "invoices" | "tickets" | "new-ticket" | "knowledgebase" | "add-funds" | "payment" | "profile";
const clientCopy: Record<Locale, Record<string, string>> = {
  de: {
    accountBalance: "Kontostand",
    addFunds: "Guthaben aufladen",
    clientPortal: "Kundenbereich",
    domains: "Domains",
    invoices: "Rechnungen",
    knowledgebase: "Wissensdatenbank",
    newService: "Neuer Service",
    newTicket: "Neues Ticket",
    openInvoices: "Offene Rechnungen",
    openTickets: "Offene Tickets",
    payments: "Zahlungen",
    profile: "Profil",
    services: "Services",
    tickets: "Support Tickets"
  },
  en: {
    accountBalance: "Account Balance",
    addFunds: "Add Funds",
    clientPortal: "Client Portal",
    domains: "Domains",
    invoices: "Invoices",
    knowledgebase: "Knowledgebase",
    newService: "New Service",
    newTicket: "New Ticket",
    openInvoices: "Open Invoices",
    openTickets: "Open Tickets",
    payments: "Payments",
    profile: "Profile",
    services: "Services",
    tickets: "Support Tickets"
  }
};
type ApiPaymentMethod = {
  automatic: boolean;
  createdAt: string;
  default: boolean;
  id: string;
  label: string;
  provider: string;
  status: string;
  type: string;
  verifiedAt?: string | null;
};
type HostingPanel = {
  bandwidth: Array<{ fields: Record<string, string>; name: string }>;
  bandwidthUsage?: Usage;
  controlPanelUrl: string;
  databases: Array<{ fields: Record<string, string>; name: string }>;
  diskUsage?: Usage;
  domain: string;
  emailInstructions: {
    imap: { encryption: string; port: number; server: string };
    pop3: { encryption: string; port: number; server: string };
    smtp: { encryption: string; port: number; server: string };
    username: string;
  };
  errors: string[];
  ftpUsers: PanelEntry[];
  mailboxes: PanelEntry[];
  subdomains: Array<{ fields: Record<string, string>; name: string }>;
  webmailUrl: string;
};
type Usage = { limit: string; percent: number; used: string };
type PanelEntry = { address?: string; fields: Record<string, string>; name: string; usage?: Usage };

const statusTone: Record<string, "good" | "warn" | "neutral"> = {
  ACTIVE: "good",
  PENDING: "warn",
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
  ANSWERED: "good",
  CUSTOMER_REPLY: "warn",
  WAITING_ON_CLIENT: "good",
  WAITING_ON_STAFF: "warn",
  RESOLVED: "neutral",
  CLOSED: "neutral"
};

export function ClientDashboard({ invoiceId, serviceId, ticketId, view = "dashboard" }: { invoiceId?: string; serviceId?: string; ticketId?: string; view?: ClientView }) {
  const locale = currentLocale();
  const copy = clientCopy[locale];
  const [profile, setProfile] = useState<{
    address?: { city?: string; line1?: string; postalCode?: string; state?: string };
    balanceCents?: number;
    countryCode?: string;
    customerType?: string;
    email?: string;
    name?: string;
    phone?: string;
    vatId?: string | null;
  }>();
  const [services, setServices] = useState<ApiService[]>([]);
  const [selectedService, setSelectedService] = useState<ApiService>();
  const [invoices, setInvoices] = useState<ApiInvoice[]>([]);
  const [selectedInvoice, setSelectedInvoice] = useState<ApiInvoice>();
  const [tickets, setTickets] = useState<ApiTicket[]>([]);
  const [selectedTicket, setSelectedTicket] = useState<ApiTicket>();
  const [knowledgebase, setKnowledgebase] = useState<ApiKnowledgebaseArticle[]>([]);
  const [announcements, setAnnouncements] = useState<ApiAnnouncement[]>([]);
  const [brandLogo, setBrandLogo] = useState("");
  const seenServiceStatuses = useRef(new Map<string, string>());
  const servicePollingReady = useRef(false);
  const servicesRef = useRef<ApiService[]>([]);

  useEffect(() => {
    const headers = authHeaders("client");
    const applyServices = (payload: ApiService[]) => {
      if (payload.length === 0 && servicesRef.current.length > 0) {
        return;
      }
      if (servicePollingReady.current) {
        for (const service of payload) {
          notifyServiceTransition(service, seenServiceStatuses.current.get(service.id));
        }
      }
      servicePollingReady.current = true;
      seenServiceStatuses.current = new Map(payload.map((service) => [service.id, service.status]));
      servicesRef.current = payload;
      setServices(payload);
    };
    const loadServices = () => {
      fetch(`${API_BASE_URL}/services`, { headers }).then(json).then((payload) => {
        if (Array.isArray(payload)) {
          applyServices(payload);
        }
      }).catch(() => undefined);
    };
    loadServices();
  }, []);

  useEffect(() => {
    if (!serviceId) {
      return;
    }
    const headers = authHeaders("client");
    const applyService = (payload: unknown) => {
      if (!payload) {
        return;
      }
      const service = payload as ApiService;
      notifyServiceTransition(service, seenServiceStatuses.current.get(service.id));
      seenServiceStatuses.current.set(service.id, service.status);
      setSelectedService(service);
      setServices((current) => {
        const next = current.some((item) => item.id === service.id) ? current.map((item) => item.id === service.id ? service : item) : [service, ...current];
        servicesRef.current = next;
        return next;
      });
    };
    const loadService = () => {
      fetch(`${API_BASE_URL}/services/${serviceId}`, { headers }).then(json).then(applyService).catch(() => undefined);
    };
    loadService();
  }, [serviceId]);

  useEffect(() => {
    if (!invoiceId) {
      return;
    }
    const headers = authHeaders("client");
    fetch(`${API_BASE_URL}/billing/invoices/${invoiceId}`, { headers }).then(json).then((payload) => payload && setSelectedInvoice(payload)).catch(() => undefined);
  }, [invoiceId]);

  useEffect(() => {
    if (!ticketId) {
      return;
    }
    const headers = authHeaders("client");
    fetch(`${API_BASE_URL}/tickets/${ticketId}`, { headers }).then(json).then((payload) => payload && setSelectedTicket(payload)).catch(() => undefined);
  }, [ticketId]);

  useEffect(() => {
    const headers = authHeaders("client");
    fetch(`${API_BASE_URL}/billing/invoices`, { headers }).then(json).then((payload) => Array.isArray(payload) && setInvoices(payload)).catch(() => undefined);
    fetch(`${API_BASE_URL}/tickets`, { headers }).then(json).then((payload) => Array.isArray(payload) && setTickets(payload)).catch(() => undefined);
    fetch(`${API_BASE_URL}/knowledgebase?locale=${locale}`).then(json).then((payload) => Array.isArray(payload) && setKnowledgebase(payload)).catch(() => undefined);
    fetch(`${API_BASE_URL}/users/me`, { headers }).then(json).then((payload) => payload && setProfile(payload)).catch(() => undefined);
    fetch(`${API_BASE_URL}/storefront/settings`).then(json).then((payload) => payload?.siteLogoUrl && setBrandLogo(payload.siteLogoUrl)).catch(() => undefined);
    fetch(`${API_BASE_URL}/cms/announcements?locale=${locale}`, { headers }).then(json).then((payload) => Array.isArray(payload) && setAnnouncements(payload)).catch(() => undefined);
  }, [locale]);

  const serviceRows = services.filter((service) => service.product.type !== "DOMAIN");
  const domainRows = domainRowsFromServices(services);
  const openInvoices = invoices.filter((invoice) => invoice.status !== "PAID").length;
  const openTickets = tickets.filter((ticket) => !["CLOSED", "RESOLVED"].includes(ticket.status)).length;

  return (
    <div className={styles.page}>
      <aside className={styles.sidebar}>
        {brandLogo ? <img alt="Dezhost" className={styles.brandLogo} src={brandLogo} /> : <strong>CrimsonGrid</strong>}
        <nav aria-label="Client">
          <a href="/client/services">{copy.services}</a>
          <a href="/client/domains">{copy.domains}</a>
          <a href="/client/invoices">{copy.invoices}</a>
          <a className={styles.subNav} href="/client/billing/add-funds">{copy.addFunds}</a>
          <a href="/client/payments">{copy.payments}</a>
          <a href="/client/knowledgebase">{copy.knowledgebase}</a>
          <a href="/client/tickets">{copy.tickets}</a>
          <a className={styles.subNav} href="/client/tickets/new">{copy.newTicket}</a>
          <a href="/client/profile">{copy.profile}</a>
        </nav>
        <div className={styles.balanceCard}>
          <Wallet aria-hidden size={20} />
          <strong>{money(profile?.balanceCents ?? 0)}</strong>
          <span>{copy.accountBalance}</span>
        </div>
      </aside>

      <main className={styles.main}>
        <header className={styles.header}>
          <div>
            <span className="eyebrow">{copy.clientPortal}</span>
            <h1>{serviceId && selectedService ? serviceName(selectedService) : titleFor(view, locale)}</h1>
          </div>
          <div className={styles.headerActions}>
            <Button href="/de/pricing" icon={CreditCard}>
              {copy.newService}
            </Button>
            <LogoutButton scope="client" redirectTo="/client/login" />
          </div>
        </header>

        {view === "dashboard" && !serviceId ? <DashboardSmartCards announcements={announcements} knowledgebase={knowledgebase} setAnnouncements={setAnnouncements} /> : null}

        <section className={styles.overviewGrid} aria-label="Overview">
          <a className="metric" href="/client/services">
            <Server aria-hidden size={22} />
            <strong>{serviceRows.length}</strong>
            <span>{copy.services}</span>
          </a>
          <a className="metric" href="/client/domains">
            <Globe aria-hidden size={22} />
            <strong>{domainRows.length}</strong>
            <span>{copy.domains}</span>
          </a>
          <a className="metric" href="/client/tickets">
            <LifeBuoy aria-hidden size={22} />
            <strong>{openTickets}</strong>
            <span>{copy.openTickets}</span>
          </a>
          <a className="metric" href="/client/invoices">
            <FileText aria-hidden size={22} />
            <strong>{openInvoices}</strong>
            <span>{copy.openInvoices}</span>
          </a>
        </section>

        {(view === "dashboard" || view === "services") && !serviceId ? <ServicesTable services={serviceRows} /> : null}
        {view === "domains" ? <DomainsTable domains={domainRows} /> : null}
        {serviceId ? <ServiceDetail service={selectedService ?? services.find((service) => service.id === serviceId)} /> : null}
        {view === "invoices" && !invoiceId ? <InvoicesTable invoices={invoices} /> : null}
        {invoiceId ? <InvoiceDetail invoice={selectedInvoice ?? invoices.find((invoice) => invoice.id === invoiceId)} /> : null}
        {view === "tickets" && !ticketId ? <TicketsTable tickets={tickets} /> : null}
        {ticketId ? <TicketThread ticket={selectedTicket} onTicketChange={setSelectedTicket} /> : null}
        {view === "new-ticket" ? <NewTicket services={services} /> : null}
        {view === "knowledgebase" ? <KnowledgebaseList articles={knowledgebase} /> : null}
        {view === "add-funds" ? <AddFunds /> : null}
        {view === "payment" ? <PaymentInfo /> : null}
        {view === "profile" ? <ProfileForm profile={profile} setProfile={setProfile} /> : null}
      </main>
    </div>
  );
}

function DashboardSmartCards({
  announcements,
  knowledgebase,
  setAnnouncements
}: {
  announcements: ApiAnnouncement[];
  knowledgebase: ApiKnowledgebaseArticle[];
  setAnnouncements: (updater: (items: ApiAnnouncement[]) => ApiAnnouncement[]) => void;
}) {
  return (
    <section className={styles.smartGrid}>
      <Announcements announcements={announcements} setAnnouncements={setAnnouncements} />
      <KnowledgebasePreview articles={knowledgebase.slice(0, 3)} />
    </section>
  );
}

function Announcements({
  announcements,
  setAnnouncements
}: {
  announcements: ApiAnnouncement[];
  setAnnouncements: (updater: (items: ApiAnnouncement[]) => ApiAnnouncement[]) => void;
}) {
  const [hidingAnnouncementIds, setHidingAnnouncementIds] = useState<string[]>([]);

  async function markRead(item: ApiAnnouncement) {
    const response = await fetch(`${API_BASE_URL}/cms/announcements/${item.id}/read`, { headers: authHeaders("client"), method: "POST" });
    if (response.ok) {
      setAnnouncements((items) => items.map((row) => row.id === item.id ? { ...row, isRead: true, readAt: new Date().toISOString() } : row));
    }
  }

  async function hide(item: ApiAnnouncement) {
    const response = await fetch(`${API_BASE_URL}/cms/announcements/${item.id}/hide`, { headers: authHeaders("client"), method: "POST" });
    if (response.ok) {
      setHidingAnnouncementIds((ids) => [...ids, item.id]);
      window.setTimeout(() => {
        setAnnouncements((items) => items.filter((row) => row.id !== item.id));
        setHidingAnnouncementIds((ids) => ids.filter((id) => id !== item.id));
      }, 180);
    }
  }

  return (
    <section className={styles.smartCard}>
      <div className={styles.blockHeader}>
        <div>
          <span className="eyebrow">Latest announcements</span>
          <h2>News</h2>
        </div>
      </div>
      <div className={styles.noticeList}>
        {announcements.length ? announcements.slice(0, 3).map((item) => (
          <article className={`${styles.noticeCard} ${hidingAnnouncementIds.includes(item.id) ? styles.announcementHidden : ""}`} key={item.id}>
            <div>
              <strong>{item.title}</strong>
              <span>{announcementDateLabel(item.publishedAt ?? item.createdAt)}{item.isRead ? " · Read" : ""}</span>
              <p>{item.excerpt ?? previewText(item.body ?? "")}</p>
            </div>
            <div className={styles.noticeActions}>
              {!item.isRead ? <Button type="button" variant="secondary" onClick={() => markRead(item)}>Read</Button> : null}
              <Button type="button" variant="ghost" onClick={() => hide(item)}>Hide</Button>
            </div>
          </article>
        )) : <p className={styles.emptySmart}>No news right now.</p>}
      </div>
    </section>
  );
}

function KnowledgebasePreview({ articles }: { articles: ApiKnowledgebaseArticle[] }) {
  return (
    <section className={styles.smartCard}>
      <div className={styles.blockHeader}>
        <div>
          <span className="eyebrow">Knowledgebase</span>
          <h2>Help</h2>
        </div>
        <Button href="/client/knowledgebase" icon={BookOpen} variant="secondary">All</Button>
      </div>
      <div className={styles.noticeList}>
        {articles.length ? articles.map((article) => (
          <a className={styles.knowledgeCard} href={`/de/knowledgebase/${article.slug}`} key={article.id}>
            <BookOpen aria-hidden size={18} />
            <div>
              <strong>{article.title}</strong>
              <p>{article.excerpt ?? previewText(article.body)}</p>
            </div>
          </a>
        )) : <p className={styles.emptySmart}>Useful guides appear here.</p>}
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
                    <td><a href={`/client/services/${service.id}`}><strong>{serviceListTitle(service)}</strong></a><br />{serviceListSubtitle(service)}</td>
                    <td>{money(service.productPrice.amountCents, service.productPrice.currency)}<br />{cycleLabel(service.productPrice.billingCycle)}</td>
                    <td>{dateLabel(service.renewsAt)}</td>
                    <td>
                      <StatusPill label={serviceStatusLabel(service.status, currentLocale())} tone={statusTone[service.status] ?? "neutral"} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
  );
}

type DomainRow = {
  amountCents: number;
  billingCycle: string;
  currency: string;
  domain: string;
  id: string;
  renewsAt?: string | null;
  status: string;
};

function DomainsTable({ domains }: { domains: DomainRow[] }) {
  return (
    <section className={styles.block} id="domains">
      <div className={styles.blockHeader}>
        <div>
          <span className="eyebrow">Domains</span>
          <h2>Domains</h2>
        </div>
      </div>
      <div className={styles.tableWrap}>
        <table className="table">
          <thead>
            <tr>
              <th>Domain</th>
              <th>Pricing</th>
              <th>Next Due Date</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {domains.length ? domains.map((domain) => (
              <tr key={domain.id}>
                <td><strong>{domain.domain}</strong></td>
                <td>{money(domain.amountCents, domain.currency)}<br />{cycleLabel(domain.billingCycle)}</td>
                <td>{dateLabel(domain.renewsAt)}</td>
                <td><StatusPill label={serviceStatusLabel(domain.status, currentLocale())} tone={statusTone[domain.status] ?? "neutral"} /></td>
              </tr>
            )) : (
              <tr><td colSpan={4}>Noch keine Domains.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function ServiceDetail({ service }: { service?: ApiService }) {
  const [panel, setPanel] = useState<HostingPanel>();
  const [modal, setModal] = useState<"admin" | "databases" | "email" | "ftp" | "instructions" | "subdomains" | undefined>();
  const isActiveHosting = service?.product.type === "SHARED_HOSTING" && service.status === "ACTIVE";

  useEffect(() => {
    if (!service || !isActiveHosting) {
      return;
    }
    loadHostingPanel(service.id, setPanel);
  }, [isActiveHosting, service]);

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
        <StatusPill label={serviceStatusLabel(service.status, currentLocale())} tone={statusTone[service.status] ?? "neutral"} />
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
          <strong>{serviceStatusLabel(service.status, currentLocale())}</strong>
        </div>
      </div>
      {service.product.type === "DOMAIN" ? <DomainRenewal service={service} /> : <PlanChange service={service} />}
      {isActiveHosting ? <HostingControlPanel modal={modal} panel={panel} refresh={() => loadHostingPanel(service.id, setPanel)} service={service} setModal={setModal} /> : null}
    </section>
  );
}

function HostingControlPanel({
  modal,
  panel,
  refresh,
  service,
  setModal
}: {
  modal?: "admin" | "databases" | "email" | "ftp" | "instructions" | "subdomains";
  panel?: HostingPanel;
  refresh: () => void;
  service: ApiService;
  setModal: (modal?: "admin" | "databases" | "email" | "ftp" | "instructions" | "subdomains") => void;
}) {
  return (
    <div className={styles.controlPanel}>
      <div className={styles.panelTitle}>
        <div>
          <span className="eyebrow">Hosting Control Panel</span>
          <h3>{panel?.domain ?? serviceName(service)}</h3>
        </div>
      </div>
      <div className={styles.usageGrid}>
        <UsageGraph icon="disk" label="Disk space" usage={panel?.diskUsage} />
        <UsageGraph icon="bandwidth" label="Bandwidth" usage={panel?.bandwidthUsage} />
      </div>
      <div className={styles.controlGrid}>
        <a href={panel?.controlPanelUrl || "#"} target="_blank" rel="noreferrer"><ExternalLink aria-hidden />Control panel</a>
        <a href={panel?.webmailUrl || "#"} target="_blank" rel="noreferrer"><Mail aria-hidden />Webmail</a>
        <button type="button" onClick={() => setModal("email")}><Mail aria-hidden />Mail boxes</button>
        <button type="button" onClick={() => setModal("databases")}><Database aria-hidden />Databases</button>
        <button type="button" onClick={() => setModal("subdomains")}><Globe aria-hidden />Subdomains</button>
        <button type="button" onClick={() => setModal("ftp")}><UsersRound aria-hidden />FTP users</button>
        <button type="button" onClick={() => setModal("admin")}><KeyRound aria-hidden />Admin password</button>
        <button type="button" onClick={() => setModal("instructions")}><FileText aria-hidden />Email clients</button>
      </div>
      {panel?.errors.length ? <p className={styles.warn}>{panel.errors.join(" ")}</p> : null}
      {modal ? <HostingModal modal={modal} panel={panel} refresh={refresh} service={service} setModal={setModal} /> : null}
    </div>
  );
}

function UsageGraph({ icon, label, usage }: { icon: "bandwidth" | "disk"; label: string; usage?: Usage }) {
  const Icon = icon === "disk" ? HardDrive : BarChart3;
  return (
    <div>
      <Icon aria-hidden />
      <span>{label}</span>
      <strong>{usage ? `${usage.used} / ${usage.limit}` : "Loading"}</strong>
      <div className={styles.usageTrack}><span style={{ width: `${usage?.percent ?? 0}%` }} /></div>
    </div>
  );
}

function HostingModal({
  modal,
  panel,
  refresh,
  service,
  setModal
}: {
  modal: "admin" | "databases" | "email" | "ftp" | "instructions" | "subdomains";
  panel?: HostingPanel;
  refresh: () => void;
  service: ApiService;
  setModal: (modal?: "admin" | "databases" | "email" | "ftp" | "instructions" | "subdomains") => void;
}) {
  const domain = panel?.domain ?? serviceName(service);
  return (
    <div className={styles.modalBackdrop}>
      <section className={styles.modal}>
        <button className={styles.closeButton} type="button" onClick={() => setModal(undefined)}>Close</button>
        {modal === "email" ? <EntryManager entries={panel?.mailboxes ?? []} refresh={refresh} service={service} title="Mail boxes" addIntent="add-email" removeIntent="remove-email" changeIntent="change-email-password" quotaIntent="edit-email-quota" nameField="mailUser" passField="mailPassword" quotaField="mailQuotaMb" suffix={`@${domain}`} /> : null}
        {modal === "databases" ? <EntryManager entries={panel?.databases ?? []} refresh={refresh} service={service} title="Databases" addIntent="add-database" removeIntent="remove-database" changeIntent="change-database-password" nameField="databaseName" passField="databasePassword" extraField={["databaseType", "mysql"]} /> : null}
        {modal === "ftp" ? <EntryManager entries={panel?.ftpUsers ?? []} refresh={refresh} service={service} title="FTP users" addIntent="add-ftp" removeIntent="remove-ftp" changeIntent="change-ftp-password" quotaIntent="edit-ftp-quota" nameField="ftpUser" passField="ftpPassword" quotaField="ftpQuotaMb" suffix={`@${domain}`} /> : null}
        {modal === "subdomains" ? <EntryManager entries={(panel?.subdomains ?? []).map((entry) => ({ ...entry, address: entry.name }))} refresh={refresh} service={service} title="Subdomains" addIntent="add-subdomain" removeIntent="remove-subdomain" nameField="subdomain" suffix={`.${domain}`} /> : null}
        {modal === "admin" ? <PasswordAction refresh={refresh} service={service} /> : null}
        {modal === "instructions" && panel ? <EmailInstructions panel={panel} /> : null}
      </section>
    </div>
  );
}

function EntryManager({
  addIntent,
  changeIntent,
  entries,
  extraField,
  nameField,
  passField,
  quotaField,
  quotaIntent,
  refresh,
  removeIntent,
  service,
  suffix,
  title
}: {
  addIntent: string;
  changeIntent?: string;
  entries: PanelEntry[];
  extraField?: [string, string];
  nameField: string;
  passField?: string;
  quotaField?: string;
  quotaIntent?: string;
  refresh: () => void;
  removeIntent: string;
  service: ApiService;
  suffix?: string;
  title: string;
}) {
  return (
    <>
      <div className={styles.modalHeader}><h3>{title}</h3></div>
      <details className={styles.actionDetails}>
        <summary>Add {title.toLowerCase().replace(/s$/, "")}</summary>
        <ActionForm intent={addIntent} refresh={refresh} service={service} fields={[[nameField, "Name"], ...(passField ? [[passField, "Password"] as [string, string]] : []), ...(extraField ? [extraField] : [])]} suffixFor={nameField} suffix={suffix} button="Add" />
      </details>
      <div className={styles.rowList}>
        {entries.map((entry) => (
          <article className={styles.entryRow} key={entry.name}>
            <div>
              <strong>{entry.address ?? entry.name}</strong>
              {entry.usage ? <UsageGraph icon="disk" label="Usage" usage={entry.usage} /> : <span>{entry.fields["Size"] ?? ""}</span>}
            </div>
            {changeIntent && passField ? <details>
              <summary>Change password</summary>
              <ActionForm intent={changeIntent} refresh={refresh} service={service} hiddenFields={[[nameField, localPart(entry.name, suffix)]]} fields={[[passField, "New password"]]} button="Save" />
            </details> : null}
            {quotaIntent && quotaField ? (
              <details>
                <summary>Edit quota</summary>
                <ActionForm intent={quotaIntent} refresh={refresh} service={service} hiddenFields={[[nameField, localPart(entry.name, suffix)]]} fields={[[quotaField, "Quota MB"]]} button="Save quota" />
              </details>
            ) : null}
            <ActionForm intent={removeIntent} refresh={refresh} service={service} hiddenFields={[[nameField, localPart(entry.name, suffix)]]} fields={[]} button="Delete" />
          </article>
        ))}
        {!entries.length ? <span>No items found.</span> : null}
      </div>
    </>
  );
}

function PasswordAction({ refresh, service }: { refresh: () => void; service: ApiService }) {
  return (
    <div className={styles.subdomainBox}>
      <h3><KeyRound aria-hidden size={18} /> Admin password</h3>
      <p>This is different from the client dashboard password.</p>
      <ActionForm intent="change-admin-password" refresh={refresh} service={service} fields={[["adminPassword", "New hosting admin password"]]} button="Change admin password" />
    </div>
  );
}

function EmailInstructions({ panel }: { panel: HostingPanel }) {
  return (
    <>
      <h3>Email client settings</h3>
      <table className="table">
        <tbody>
          <tr><td>IMAP</td><td>{panel.emailInstructions.imap.server}:{panel.emailInstructions.imap.port}</td><td>{panel.emailInstructions.imap.encryption}</td></tr>
          <tr><td>POP3</td><td>{panel.emailInstructions.pop3.server}:{panel.emailInstructions.pop3.port}</td><td>{panel.emailInstructions.pop3.encryption}</td></tr>
          <tr><td>SMTP</td><td>{panel.emailInstructions.smtp.server}:{panel.emailInstructions.smtp.port}</td><td>{panel.emailInstructions.smtp.encryption}</td></tr>
        </tbody>
      </table>
      <p>{panel.emailInstructions.username}</p>
    </>
  );
}

function ActionForm({
  button,
  fields,
  hiddenFields = [],
  intent,
  refresh,
  service,
  suffix,
  suffixFor
}: {
  button: string;
  fields: Array<[string, string]>;
  hiddenFields?: Array<[string, string]>;
  intent: string;
  refresh: () => void;
  service: ApiService;
  suffix?: string;
  suffixFor?: string;
}) {
  const [message, setMessage] = useState("");
  async function submit(formData: FormData) {
    const body = Object.fromEntries([...hiddenFields, ...fields.map(([name]) => [name, String(formData.get(name) ?? "")] as [string, string])]);
    const response = await fetch(`${API_BASE_URL}/services/${service.id}/hosting-panel`, {
      body: JSON.stringify({ ...body, intent }),
      headers: { "Content-Type": "application/json", ...authHeaders("client") },
      method: "POST"
    });
    setMessage(await notifyResponse(response, "Sent.", "Failed."));
    if (response.ok) {
      refresh();
    }
  }
  return <form action={submit} className={styles.inlineForm}>{fields.map(([name, placeholder]) => (
    <label className={styles.suffixField} key={name}>
      <input className="input" name={name} placeholder={placeholder} type={/password/i.test(name) ? "password" : "text"} />
      {suffixFor === name && suffix ? <span>{suffix}</span> : null}
    </label>
  ))}<Button type="submit" variant="secondary">{button}</Button>{message ? <span>{message}</span> : null}</form>;
}

function localPart(value: string, suffix?: string) {
  if (!suffix) {
    return value;
  }
  return value.endsWith(suffix) ? value.slice(0, -suffix.length) : value;
}

function loadHostingPanel(serviceId: string, setPanel: (panel: HostingPanel) => void) {
  fetch(`${API_BASE_URL}/services/${serviceId}/hosting-panel`, { headers: authHeaders("client") })
    .then(json)
    .then((payload) => payload && setPanel(payload))
    .catch(() => undefined);
}

function InvoicesTable({ invoices }: { invoices: ApiInvoice[] }) {
  return (
    <section className={styles.invoiceCards}>
      {invoices.map((invoice) => (
        <article className={styles.invoiceCard} key={invoice.id}>
          <div>
            <span>Invoice</span>
            <strong><a href={`/client/invoices/${invoice.id}`}>{invoice.invoiceNumber}</a></strong>
          </div>
          <div><span>Issued</span><strong>{dateLabel(invoice.issuedAt)}</strong></div>
          <div><span>Due</span><strong>{dateLabel(invoice.dueAt)}</strong></div>
          <div><span>Total</span><strong>{money(invoice.totalCents, invoice.currency)}</strong></div>
          <StatusPill label={invoiceStatusLabel(invoice.status, currentLocale())} tone={statusTone[invoice.status] ?? "neutral"} />
          {invoice.status === "PAID" ? <div><span>Paid</span><strong>{dateLabel(invoice.paidAt)}</strong></div> : null}
          {invoice.status === "PAID" ? <div><span>Gateway</span><strong>{paymentGateway(invoice)}</strong></div> : null}
          {invoice.status === "UNPAID" || invoice.status === "OVERDUE" ? (
            <Button href={`/client/billing/payment?invoice=${invoice.id}`} icon={CreditCard}>Pay</Button>
          ) : null}
        </article>
      ))}
    </section>
  );
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
        <StatusPill label={invoiceStatusLabel(invoice.status, currentLocale())} tone={invoice.status === "PAID" ? "good" : "warn"} />
      </div>
      <div className={styles.invoiceMeta}>
        <div><strong>{customer.companyName || customer.name}</strong><br />{address.line1}<br />{address.postalCode} {address.city}<br />{customer.countryCode}</div>
        <div>Rechnungsdatum: {dateLabel(invoice.issuedAt)}<br />Faellig: {dateLabel(invoice.dueAt)}<br />{invoice.status === "PAID" ? <>Bezahlt: {dateLabel(invoice.paidAt)}<br />Gateway: {paymentGateway(invoice)}<br /></> : null}E-Mail: {customer.email}</div>
      </div>
      <table className="table">
        <thead><tr><th>Beschreibung</th><th>Cycle</th><th>Menge</th><th>Einzelpreis</th><th>Summe</th></tr></thead>
        <tbody>{(invoice.items ?? []).map((item) => <tr key={item.description}><td>{item.description}</td><td>{item.billingCycle ? cycleLabel(item.billingCycle) : "-"}</td><td>{item.quantity}</td><td>{money(item.unitAmountCents, invoice.currency)}</td><td>{money(item.totalCents, invoice.currency)}</td></tr>)}</tbody>
      </table>
      <div className={styles.invoiceTotals}>
        <span>Zwischensumme {money(invoice.subtotalCents ?? invoice.totalCents, invoice.currency)}</span>
        {showVat ? <span>USt. {money(invoice.taxAmountCents ?? 0, invoice.currency)}</span> : null}
        <strong>Gesamt {money(invoice.totalCents, invoice.currency)}</strong>
      </div>
      {invoice.status === "UNPAID" || invoice.status === "OVERDUE" ? (
        <Button href={`/client/billing/payment?invoice=${invoice.id}`} icon={CreditCard}>Pay</Button>
      ) : null}
      <PdfDownloadButton invoice={invoice} />
      <footer className={styles.invoiceFooter}>{(invoice.footerLines ?? []).map((line) => <span key={line}>{line}</span>)}</footer>
    </section>
  );
}

function PdfDownloadButton({ invoice }: { invoice: ApiInvoice }) {
  const [message, setMessage] = useState("");
  async function download() {
    const response = await fetch(`${API_BASE_URL}/billing/invoices/${invoice.id}/pdf`, { headers: authHeaders("client") });
    if (!response.ok) {
      setMessage("PDF failed.");
      notify.error("PDF failed.");
      return;
    }
    const blob = await response.blob();
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `invoice-${invoice.invoiceNumber}.pdf`;
    link.click();
    URL.revokeObjectURL(url);
    setMessage("");
    notify.success("PDF ready.");
  }
  return <div className={styles.pdfAction}><Button type="button" variant="secondary" onClick={download}>Download PDF</Button>{message ? <span>{message}</span> : null}</div>;
}

function DomainRenewal({ service }: { service: ApiService }) {
  const [message, setMessage] = useState("");
  async function submit(formData: FormData) {
    const response = await fetch(`${API_BASE_URL}/services/${service.id}/renew-domain`, {
      body: JSON.stringify({ years: Number(formData.get("years") ?? 1) }),
      headers: { "Content-Type": "application/json", ...authHeaders("client") },
      method: "POST"
    });
    setMessage(await notifyResponse(response, "Renewal sent.", "Renewal failed."));
  }
  return <form action={submit} className={styles.inlineForm}><label>Renew for years<select name="years"><option>1</option><option>2</option><option>3</option><option>5</option></select></label><Button type="submit">Renew domain</Button>{message ? <p>{message}</p> : null}</form>;
}

function PlanChange({ service }: { service: ApiService }) {
  const [message, setMessage] = useState("");
  async function submit() {
    const response = await fetch(`${API_BASE_URL}/services/${service.id}/change-plan`, {
      body: JSON.stringify({}),
      headers: { "Content-Type": "application/json", ...authHeaders("client") },
      method: "POST"
    });
    setMessage(await notifyResponse(response, "Upgrade/downgrade request sent.", "Request failed."));
  }
  return <div className={styles.inlineForm}><Button type="button" onClick={submit}>Upgrade/Downgrade</Button>{message ? <p>{message}</p> : null}</div>;
}

function TicketsTable({ tickets }: { tickets: ApiTicket[] }) {
  return <section className={styles.block}><div className={styles.blockHeader}><div><span className="eyebrow">Support Tickets</span><h2>All Tickets</h2></div><Button href="/client/tickets/new" icon={Send}>New Ticket</Button></div><div className={styles.tableWrap}><table className="table"><thead><tr><th>ID</th><th>Department</th><th>Subject</th><th>Status</th><th>Last Update</th></tr></thead><tbody>{tickets.map((ticket) => <tr key={ticket.id}><td>#{ticket.publicId ?? ticket.id.slice(-6).toUpperCase()}</td><td>{ticket.department}</td><td><a href={`/client/tickets/${ticket.id}`}>{ticket.subject}</a></td><td><StatusPill label={ticketLabel(ticket.status)} tone={statusTone[ticket.status] ?? "neutral"} /></td><td>{dateLabel(ticket.updatedAt)}</td></tr>)}</tbody></table></div></section>;
}

function NewTicket({ services }: { services: ApiService[] }) {
  const [message, setMessage] = useState("");
  const [suggestions, setSuggestions] = useState<ApiKnowledgebaseArticle[]>([]);
  const [text, setText] = useState({ body: "", subject: "" });
  const query = `${text.subject} ${text.body}`.trim();

  useEffect(() => {
    if (query.length < 4) {
      setSuggestions([]);
      return;
    }
    const timer = window.setTimeout(() => {
      fetch(`${API_BASE_URL}/knowledgebase/suggest?q=${encodeURIComponent(query)}`).then(json).then((payload) => Array.isArray(payload) && setSuggestions(payload)).catch(() => undefined);
    }, 250);
    return () => window.clearTimeout(timer);
  }, [query]);

  async function submit(formData: FormData) {
    const response = await fetch(`${API_BASE_URL}/tickets`, {
      body: JSON.stringify({
        body: String(formData.get("body") ?? ""),
        department: String(formData.get("department") ?? "SUPPORT"),
        priority: String(formData.get("priority") ?? "NORMAL"),
        serviceId: String(formData.get("serviceId") ?? "") || undefined,
        subject: String(formData.get("subject") ?? "")
      }),
      headers: { "Content-Type": "application/json", ...authHeaders("client") },
      method: "POST"
    });
    const ticket = await response.clone().json().catch(() => undefined) as ApiTicket | undefined;
    if (response.ok && ticket?.id) {
      await uploadTicketFiles(ticket.id, filesFromForm(formData));
      window.location.assign(`/client/tickets/${ticket.id}`);
      return;
    }
    setMessage(await notifyResponse(response, "Ticket opened.", "Ticket failed."));
  }

  return (
    <form action={submit} className={styles.module}>
      <LifeBuoy aria-hidden />
      <h2>New Ticket</h2>
      <label>Department<select className="input" name="department"><option value="SUPPORT">Support</option><option value="SALES">Sales</option><option value="ABUSE">Abuse</option></select></label>
      <label>Related service<select className="input" name="serviceId"><option value="">No related service</option>{services.map((service) => <option key={service.id} value={service.id}>{serviceListTitle(service)}</option>)}</select></label>
      <label>Priority<select className="input" name="priority"><option value="NORMAL">Normal</option><option value="LOW">Low</option><option value="HIGH">High</option></select></label>
      <label>Subject<input className="input" name="subject" onChange={(event) => setText((current) => ({ ...current, subject: event.target.value }))} placeholder="Short subject" required /></label>
      <label>Message<textarea className="input" name="body" onChange={(event) => setText((current) => ({ ...current, body: event.target.value }))} required rows={6} /></label>
      <KnowledgebaseSuggestions articles={suggestions} />
      <label>Files<input accept="image/png,image/jpeg,image/webp,application/pdf" className="input" multiple name="files" type="file" /></label>
      <Button icon={Send} type="submit">Open Ticket</Button>
      {message ? <p>{message}</p> : null}
    </form>
  );
}

function KnowledgebaseSuggestions({ articles }: { articles: ApiKnowledgebaseArticle[] }) {
  if (articles.length === 0) {
    return null;
  }
  return (
    <div className={styles.suggestions}>
      <span className="eyebrow">Related articles</span>
      {articles.map((article) => (
        <a href={`/de/knowledgebase/${article.slug}`} key={article.id} target="_blank">
          <strong>{article.title}</strong>
          <span>{article.excerpt ?? previewText(article.body)}</span>
        </a>
      ))}
    </div>
  );
}

function KnowledgebaseList({ articles }: { articles: ApiKnowledgebaseArticle[] }) {
  return (
    <section className={styles.block}>
      <div className={styles.blockHeader}>
        <div><span className="eyebrow">Knowledgebase</span><h2>Articles</h2></div>
        <Button href="/de/knowledgebase" icon={BookOpen} variant="secondary">Public Help Center</Button>
      </div>
      <div className={styles.articleList}>
        {articles.map((article) => (
          <a href={`/de/knowledgebase/${article.slug}`} key={article.id}>
            <BookOpen aria-hidden />
            <div>
              <h3>{article.title}</h3>
              <p>{article.excerpt ?? previewText(article.body)}</p>
            </div>
          </a>
        ))}
      </div>
    </section>
  );
}

function TicketThread({ onTicketChange, ticket }: { onTicketChange: (ticket: ApiTicket) => void; ticket?: ApiTicket }) {
  const [message, setMessage] = useState("");
  if (!ticket) {
    return <section className={styles.module}><h2>Ticket</h2><p>Loading ticket.</p></section>;
  }
  const currentTicket = ticket;

  async function reply(formData: FormData) {
    const response = await fetch(`${API_BASE_URL}/tickets/${currentTicket.id}/replies`, {
      body: JSON.stringify({ body: String(formData.get("body") ?? "") }),
      headers: { "Content-Type": "application/json", ...authHeaders("client") },
      method: "POST"
    });
    const created = await response.clone().json().catch(() => undefined) as { id?: string } | undefined;
    if (response.ok) {
      await uploadTicketFiles(currentTicket.id, filesFromForm(formData), created?.id);
      const refreshed = await fetch(`${API_BASE_URL}/tickets/${currentTicket.id}`, { headers: authHeaders("client") }).then(json).catch(() => undefined);
      if (refreshed) {
        onTicketChange(refreshed);
      }
    }
    setMessage(await notifyResponse(response, "Reply sent.", "Reply failed."));
  }

  async function close() {
    const response = await fetch(`${API_BASE_URL}/tickets/${currentTicket.id}/close`, { headers: authHeaders("client"), method: "POST" });
    const refreshed = await response.clone().json().catch(() => undefined);
    if (response.ok && refreshed) {
      onTicketChange(refreshed);
    }
    setMessage(await notifyResponse(response, "Ticket closed.", "Close failed."));
  }

  return (
    <section className={styles.module}>
      <div className={styles.detailHeader}>
        <div>
          <span className="eyebrow">#{ticket.publicId ?? ticket.id.slice(-6).toUpperCase()}</span>
          <h2>{ticket.subject}</h2>
        </div>
        <StatusPill label={ticketLabel(ticket.status)} tone={statusTone[ticket.status] ?? "neutral"} />
      </div>
      <div className={styles.ticketMeta}>
        <span>{ticket.department}</span>
        <span>{ticket.service?.product?.name ?? "No related service"}</span>
        <span>{dateLabel(ticket.updatedAt)}</span>
      </div>
      <div className={styles.thread}>
        {(ticket.replies ?? []).map((reply) => (
          <article key={reply.id}>
            <header><strong>{reply.user?.name ?? reply.user?.email ?? "Support"}</strong><span>{dateTimeLabel(reply.createdAt)}</span></header>
            <p>{reply.body}</p>
            <AttachmentList files={reply.attachments ?? []} />
          </article>
        ))}
        <AttachmentList files={ticket.attachments ?? []} />
      </div>
      {ticket.status !== "CLOSED" ? (
        <form action={reply} className={styles.inlineForm}>
          <label>Reply<textarea className="input" name="body" required rows={4} /></label>
          <label>Files<input accept="image/png,image/jpeg,image/webp,application/pdf" className="input" multiple name="files" type="file" /></label>
          <Button icon={Send} type="submit">Send Reply</Button>
          <Button type="button" variant="secondary" onClick={close}>Close Ticket</Button>
        </form>
      ) : null}
      {message ? <p>{message}</p> : null}
    </section>
  );
}

function AttachmentList({ files }: { files: Array<{ fileName: string; id: string; storageKey: string }> }) {
  if (files.length === 0) {
    return null;
  }
  return <div className={styles.attachments}>{files.map((file) => <a href={file.storageKey} key={file.id} target="_blank"><Paperclip aria-hidden size={14} />{file.fileName}</a>)}</div>;
}

function AddFunds() {
  const [message, setMessage] = useState("");
  async function submit(formData: FormData) {
    const response = await fetch(`${API_BASE_URL}/billing/add-funds`, {
      body: JSON.stringify({
        amountCents: Math.round(Number(formData.get("amount") ?? 0) * 100),
        method: String(formData.get("method") ?? "PAYPAL")
      }),
      headers: { "Content-Type": "application/json", ...authHeaders("client") },
      method: "POST"
    });
    const payload = await response.clone().json().catch(() => undefined);
    if (response.ok) {
      if (payload?.paymentRedirectUrl) {
        window.location.assign(payload.paymentRedirectUrl);
        return;
      }
      if (payload?.status === "PAID" && payload?.invoiceId) {
        window.location.assign(`/client/invoices/${payload.invoiceId}`);
        return;
      }
      window.location.assign("/client");
      return;
    }
    setMessage(await notifyResponse(response, "Funds added.", "Add funds failed."));
  }
  return <form action={submit} className={styles.module}><Wallet aria-hidden /><h2>Add Funds</h2><p>Funds pay invoices automatically on due date. If credit is too low, saved payment info pays the rest.</p><label>Amount<input className="input" min="1" name="amount" placeholder="50.00" required step="0.01" type="number" /></label><label>Payment gateway<select className="input" name="method"><option value="SANDBOX">Sandbox</option><option value="PAYPAL">PayPal</option><option value="CREDIT_CARD">Mollie card</option><option value="SEPA">Mollie SEPA</option></select></label><Button icon={CreditCard} type="submit">Add Funds</Button>{message ? <p>{message}</p> : null}</form>;
}

function PaymentInfo() {
  const [methods, setMethods] = useState<ApiPaymentMethod[]>([]);
  const [message, setMessage] = useState("");
  const [method, setMethod] = useState("CREDIT_CARD");
  const needsIban = method === "SEPA";

  async function load() {
    fetch(`${API_BASE_URL}/billing/payment-methods`, { headers: authHeaders("client") }).then(json).then((payload) => Array.isArray(payload) && setMethods(payload)).catch(() => undefined);
  }

  useEffect(() => {
    void load();
  }, []);

  async function submit(formData: FormData) {
    const response = await fetch(`${API_BASE_URL}/billing/payment-methods/setup`, {
      body: JSON.stringify({
        iban: formData.get("iban") || undefined,
        method
      }),
      headers: { "Content-Type": "application/json", ...authHeaders("client") },
      method: "POST"
    });
    const payload = await response.clone().json().catch(() => undefined);
    if (response.ok && payload?.paymentRedirectUrl) {
      window.location.assign(payload.paymentRedirectUrl);
      return;
    }
    if (response.ok) {
      await load();
    }
    setMessage(await notifyResponse(response, "Payment method saved.", "Payment method failed."));
  }

  async function remove(id: string) {
    const response = await fetch(`${API_BASE_URL}/billing/payment-methods/${id}`, {
      headers: authHeaders("client"),
      method: "DELETE"
    });
    if (response.ok) {
      setMethods((items) => items.filter((item) => item.id !== id));
    }
  }

  return (
    <section className={styles.module}>
      <CreditCard aria-hidden />
      <h2>Payments</h2>
      <form action={submit} className={styles.inlineForm}>
        <label>Method<select className="input" value={method} onChange={(event) => setMethod(event.target.value)}><option value="CREDIT_CARD">Credit/debit card</option><option value="SEPA">SEPA Direct Debit</option><option value="PAYPAL">PayPal</option></select></label>
        {needsIban ? <label>IBAN<input className="input" name="iban" placeholder="DE00 0000 0000 0000 0000 00" required /></label> : null}
        <Button icon={CreditCard} type="submit">Authorize Automatic Payments</Button>
      </form>
      <div className={styles.tableWrap}>
        <table className="table">
          <thead><tr><th>Method</th><th>Status</th><th>Automatic</th><th></th></tr></thead>
          <tbody>{methods.length ? methods.map((item) => (
            <tr key={item.id}><td>{item.label}</td><td><StatusPill label={item.status.toLowerCase()} tone={item.status === "VALID" ? "good" : "warn"} /></td><td>{item.automatic ? "Enabled" : "Disabled"}</td><td><Button type="button" variant="secondary" onClick={() => void remove(item.id)}>Remove</Button></td></tr>
          )) : <tr><td colSpan={4}>No automatic payment method yet.</td></tr>}</tbody>
        </table>
      </div>
      {message ? <p>{message}</p> : null}
    </section>
  );
}

function ProfileForm({
  profile,
  setProfile
}: {
  profile?: {
    address?: { city?: string; line1?: string; postalCode?: string; state?: string };
    countryCode?: string;
    email?: string;
    name?: string;
    phone?: string;
    vatId?: string | null;
  };
  setProfile: (profile: any) => void;
}) {
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
      headers: { "Content-Type": "application/json", ...authHeaders("client") },
      method: "PATCH"
    });
    const payload = await response.clone().json().catch(() => undefined);
    if (response.ok && payload) {
      setProfile(payload);
    }
    setMessage(await notifyResponse(response, "Profile saved.", "Profile failed."));
  }
  return <form action={submit} className={styles.module} key={profile?.email ?? "profile"}><UserRound aria-hidden /><h2>Profile</h2><p>Changing profile information here does not change registered domain contact details. Open a support ticket for domain contact changes.</p><label>Name<input className="input" defaultValue={profile?.name ?? ""} name="name" /></label><label>Email<input className="input" defaultValue={profile?.email ?? ""} name="email" type="email" /></label><label>Address<input className="input" defaultValue={profile?.address?.line1 ?? ""} name="address" /></label><label>Postal code<input className="input" defaultValue={profile?.address?.postalCode ?? ""} name="postalCode" /></label><label>City<input className="input" defaultValue={profile?.address?.city ?? ""} name="city" /></label><label>State<input className="input" defaultValue={profile?.address?.state ?? ""} name="state" /></label><label>Country<input className="input" defaultValue={profile?.countryCode ?? "DE"} name="countryCode" /></label><label>Phone<input className="input" defaultValue={profile?.phone ?? ""} name="phone" /></label><label>VAT ID<input className="input" defaultValue={profile?.vatId ?? ""} name="vatId" /></label><Button icon={FileText} type="submit">Save Profile</Button>{message ? <p>{message}</p> : null}</form>;
}

function titleFor(view: ClientView, locale: Locale = currentLocale()) {
  const labels = {
    de: {
      "add-funds": "Guthaben aufladen",
      dashboard: "Dashboard",
      domains: "Domains",
      invoices: "Meine Rechnungen",
      knowledgebase: "Wissensdatenbank",
      "new-ticket": "Ticket eroeffnen",
      payment: "Zahlungen",
      profile: "Profil",
      services: "Services",
      tickets: "Meine Support Tickets"
    },
    en: {
      "add-funds": "Add Funds",
      dashboard: "Dashboard",
      domains: "Domains",
      invoices: "My Invoices",
      knowledgebase: "Knowledgebase",
      "new-ticket": "Open Ticket",
      payment: "Payments",
      profile: "Profile",
      services: "Services",
      tickets: "My Support Tickets"
    }
  } as const;
  return labels[locale][view];
}

function dateLabel(value?: string | null) {
  return formatDate(value, currentLocale());
}

function dateTimeLabel(value?: string | null) {
  return formatDate(value, currentLocale(), { dateStyle: "medium", timeStyle: "short" });
}

function announcementDateLabel(value?: string | null) {
  return formatDate(value, currentLocale(), { dateStyle: "medium", timeStyle: "short" });
}

function serviceName(service: ApiService) {
  return service.domainRecords?.[0]?.domain ?? stringConfig(service.configuration, "domainName") ?? service.product.name;
}

function serviceListTitle(service: ApiService) {
  return service.product.type === "DOMAIN" ? serviceName(service) : service.product.name;
}

function serviceListSubtitle(service: ApiService) {
  if (service.product.type === "DOMAIN") {
    return "Domain";
  }
  return serviceKind(service);
}

function serviceKind(service: ApiService) {
  if (service.product.type === "DOMAIN") {
    return "Domain";
  }
  if (service.product.type === "SHARED_HOSTING") {
    return `${service.product.name} Hosting`;
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
  return { ANSWERED: "answered", CUSTOMER_REPLY: "customer-reply", WAITING_ON_CLIENT: "answered", WAITING_ON_STAFF: "customer-reply" }[status] ?? status.toLowerCase();
}

function previewText(value: string) {
  return value.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim().slice(0, 160);
}

function filesFromForm(formData: FormData) {
  return formData.getAll("files").filter((file): file is File => typeof File !== "undefined" && file instanceof File && file.size > 0);
}

async function uploadTicketFiles(ticketId: string, files: File[], replyId?: string) {
  if (files.length === 0) {
    return;
  }
  const body = new FormData();
  for (const file of files) {
    body.append("files", file);
  }
  if (replyId) {
    body.append("replyId", replyId);
  }
  await fetch(`${API_BASE_URL}/tickets/${ticketId}/attachments`, {
    body,
    headers: authHeaders("client"),
    method: "POST"
  });
}

async function json(response: Response) {
  if (response.status === 401 && typeof window !== "undefined") {
    window.location.assign(`/login?next=${encodeURIComponent(window.location.pathname)}`);
    return null;
  }
  return response.ok ? response.json() : null;
}

function notifyServiceTransition(service: ApiService, previous?: string) {
  if (previous && previous !== "ACTIVE" && service.status === "ACTIVE") {
    notify.success(`${serviceName(service)} is now active.`);
  }
  for (const record of service.domainRecords ?? []) {
    const key = `${service.id}:${record.id ?? record.domain}`;
    const previousDomain = domainStatusMemory.get(key);
    if (previousDomain && previousDomain !== "ACTIVE" && record.status === "ACTIVE") {
      notify.success(`${record.domain} registration is active.`);
    }
    if (previousDomain && previousDomain !== "FAILED" && record.status === "FAILED") {
      notify.error(`${record.domain} registration failed.`);
    }
    domainStatusMemory.set(key, record.status);
  }
}

const domainStatusMemory = new Map<string, string>();

function domainRowsFromServices(services: ApiService[]): DomainRow[] {
  const rows = new Map<string, DomainRow>();
  for (const service of services) {
    if (service.product.type === "DOMAIN") {
      const record = service.domainRecords?.[0];
      const domain = record?.domain ?? stringConfig(service.configuration, "domainName") ?? service.product.name;
      rows.set(domain, {
        amountCents: service.productPrice.amountCents,
        billingCycle: service.productPrice.billingCycle,
        currency: service.productPrice.currency,
        domain,
        id: record?.id ?? service.id,
        renewsAt: service.renewsAt,
        status: record?.status ?? service.status
      });
      continue;
    }
    for (const record of service.domainRecords ?? []) {
      if (rows.has(record.domain)) {
        continue;
      }
      rows.set(record.domain, {
        amountCents: service.productPrice.amountCents,
        billingCycle: service.productPrice.billingCycle,
        currency: service.productPrice.currency,
        domain: record.domain,
        id: record.id ?? `${service.id}:${record.domain}`,
        renewsAt: service.renewsAt,
        status: record.status
      });
    }
  }
  return [...rows.values()];
}

function paymentGateway(invoice: ApiInvoice) {
  return invoice.transactions?.find((transaction) => transaction.status === "SUCCEEDED")?.method ?? "manual";
}
