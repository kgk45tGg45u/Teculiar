"use client";

import { BarChart3, BookOpen, CreditCard, Database, ExternalLink, FileText, Globe, HardDrive, KeyRound, LifeBuoy, Mail, Paperclip, Send, Server, UserRound, UsersRound, Wallet, type LucideIcon } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import {
  API_BASE_URL,
  authHeaders,
  authToken,
  currentLocale,
  cycleLabel,
  dateLabel as formatDate,
  formatCustomerNumber,
  frozenMoney,
  invoiceDisplayNumber,
  money,
  type ApiAnnouncement,
  type ApiInvoice,
  type ApiKnowledgebaseArticle,
  type ApiService,
  type ApiTicket
} from "../../lib/api";
import { invoiceStatusLabel, serviceStatusLabel } from "../../lib/status-labels";
import { dictionary, type Locale } from "../../lib/i18n";
import { Button } from "../ui/button";
import { StatusPill } from "../ui/status-pill";
import { notify, notifyResponse } from "../ui/toast-provider";
import styles from "./client-dashboard.module.css";

type ClientView = "dashboard" | "services" | "domains" | "invoices" | "tickets" | "new-ticket" | "knowledgebase" | "add-funds" | "payment" | "profile";
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
type LoadingKey = "services" | "invoices" | "tickets" | "knowledgebase" | "announcements" | "profile";
type ClientProfile = {
  address?: { city?: string; line1?: string; postalCode?: string; state?: string };
  balanceCents?: number;
  countryCode?: string;
  customerNumber?: number | null;
  customerType?: string;
  email?: string;
  name?: string;
  phone?: string;
  vatId?: string | null;
};
type PortalDataCache = {
  announcementsByLocale?: Partial<Record<Locale, ApiAnnouncement[]>>;
  invoices?: ApiInvoice[];
  knowledgebaseByLocale?: Partial<Record<Locale, ApiKnowledgebaseArticle[]>>;
  profile?: ClientProfile;
  services?: ApiService[];
  tickets?: ApiTicket[];
};
type DashboardFeedItem = {
  date?: string | null;
  excerpt: string;
  href?: string;
  id: string;
  title: string;
};
type DashboardSummaryItem = {
  href: string;
  id: string;
  label: string;
};

const PORTAL_LOADING_TIMEOUT_MS = 4500;

const initialLoading: Record<LoadingKey, boolean> = {
  announcements: true,
  invoices: true,
  knowledgebase: true,
  profile: true,
  services: true,
  tickets: true
};
const allLoaded: Record<LoadingKey, boolean> = {
  announcements: false,
  invoices: false,
  knowledgebase: false,
  profile: false,
  services: false,
  tickets: false
};
const portalDataCache: PortalDataCache = {};

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
  const copy = dictionary[locale].client;
  const [authChecked, setAuthChecked] = useState(false);
  const [profile, setProfile] = useState<ClientProfile>();
  const [services, setServices] = useState<ApiService[]>([]);
  const [selectedService, setSelectedService] = useState<ApiService>();
  const [invoices, setInvoices] = useState<ApiInvoice[]>([]);
  const [selectedInvoice, setSelectedInvoice] = useState<ApiInvoice>();
  const [tickets, setTickets] = useState<ApiTicket[]>([]);
  const [selectedTicket, setSelectedTicket] = useState<ApiTicket>();
  const [knowledgebase, setKnowledgebase] = useState<ApiKnowledgebaseArticle[]>([]);
  const [announcements, setAnnouncements] = useState<ApiAnnouncement[]>([]);
  const [loading, setLoading] = useState<Record<LoadingKey, boolean>>(initialLoading);
  const [refreshVersion, setRefreshVersion] = useState(0);
  const seenServiceStatuses = useRef(new Map<string, string>());
  const servicePollingReady = useRef(false);
  const servicesRef = useRef<ApiService[]>([]);
  const finishLoading = (key: LoadingKey) => setLoading((current) => ({ ...current, [key]: false }));

  useEffect(() => {
    if (!authToken("client")) {
      window.location.replace(`/login?next=${encodeURIComponent(window.location.pathname + window.location.search)}`);
    } else {
      setAuthChecked(true);
    }
  }, []);

  usePortalLoadingFallback(setLoading);
  usePortalNavigationRecovery(setLoading, setRefreshVersion);

  useEffect(() => {
    applyPortalCache(locale, {
      setAnnouncements,
      setInvoices,
      setKnowledgebase,
      setProfile,
      setServices,
      setTickets
    });
    if (portalDataCache.services) {
      servicesRef.current = portalDataCache.services;
    }
    setLoading((current) => ({
      ...current,
      announcements: !(portalDataCache.announcementsByLocale?.[locale]),
      invoices: !(portalDataCache.invoices),
      knowledgebase: !(portalDataCache.knowledgebaseByLocale?.[locale]),
      profile: !(portalDataCache.profile),
      services: !(portalDataCache.services),
      tickets: !(portalDataCache.tickets)
    }));
  }, [locale]);

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
      fetchPortalJson<ApiService[]>(serviceListUrl(), { headers }).then((payload) => {
        if (Array.isArray(payload)) {
          portalDataCache.services = payload;
          applyServices(payload);
        }
      }).catch(() => undefined).finally(() => finishLoading("services"));
    };
    loadServices();
  }, [refreshVersion, serviceId, view]);

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
        portalDataCache.services = next;
        servicesRef.current = next;
        return next;
      });
    };
    const loadService = () => {
      fetchPortalJson<ApiService>(serviceDetailUrl(serviceId), { headers }).then(applyService).catch(() => undefined).finally(() => finishLoading("services"));
    };
    loadService();
  }, [refreshVersion, serviceId]);

  useEffect(() => {
    if (!invoiceId) {
      return;
    }
    const headers = authHeaders("client");
    fetchPortalJson<ApiInvoice>(`${API_BASE_URL}/billing/invoices/${invoiceId}`, { headers }).then((payload) => payload && setSelectedInvoice(payload)).catch(() => undefined).finally(() => finishLoading("invoices"));
  }, [invoiceId, refreshVersion]);

  useEffect(() => {
    if (!ticketId) {
      return;
    }
    const headers = authHeaders("client");
    fetchPortalJson<ApiTicket>(`${API_BASE_URL}/tickets/${ticketId}`, { headers }).then((payload) => payload && setSelectedTicket(payload)).catch(() => undefined).finally(() => finishLoading("tickets"));
  }, [refreshVersion, ticketId]);

  useEffect(() => {
    const headers = authHeaders("client");
    fetchPortalJson<ApiInvoice[]>(`${API_BASE_URL}/billing/invoices`, { headers }).then((payload) => {
      if (Array.isArray(payload)) {
        portalDataCache.invoices = payload;
        setInvoices(payload);
      }
    }).catch(() => undefined).finally(() => finishLoading("invoices"));
    fetchPortalJson<ApiTicket[]>(`${API_BASE_URL}/tickets`, { headers }).then((payload) => {
      if (Array.isArray(payload)) {
        portalDataCache.tickets = payload;
        setTickets(payload);
      }
    }).catch(() => undefined).finally(() => finishLoading("tickets"));
    fetchPortalJson<ApiKnowledgebaseArticle[]>(`${API_BASE_URL}/knowledgebase?locale=${locale}`).then((payload) => {
      if (Array.isArray(payload)) {
        portalDataCache.knowledgebaseByLocale = { ...(portalDataCache.knowledgebaseByLocale ?? {}), [locale]: payload };
        setKnowledgebase(payload);
      }
    }).catch(() => undefined).finally(() => finishLoading("knowledgebase"));
    fetchPortalJson<ClientProfile>(`${API_BASE_URL}/users/me`, { headers }).then((payload) => {
      if (payload) {
        portalDataCache.profile = payload;
        setProfile(payload);
      }
    }).catch(() => undefined).finally(() => finishLoading("profile"));
    fetchPortalJson<ApiAnnouncement[]>(`${API_BASE_URL}/cms/announcements?locale=${locale}`, { headers }).then((payload) => {
      if (Array.isArray(payload)) {
        portalDataCache.announcementsByLocale = { ...(portalDataCache.announcementsByLocale ?? {}), [locale]: payload };
        setAnnouncements(payload);
      }
    }).catch(() => undefined).finally(() => finishLoading("announcements"));
  }, [locale, refreshVersion]);

  const serviceRows = services.filter((service) => service.product.type !== "DOMAIN");
  const domainRows = domainRowsFromServices(services);
  const openInvoices = invoices.filter((invoice) => invoice.status !== "PAID").length;
  const openTickets = tickets.filter((ticket) => !["CLOSED", "RESOLVED"].includes(ticket.status)).length;
  const serviceSummaryItems = serviceRows
    .filter((service) => service.status === "ACTIVE")
    .slice(0, 4)
    .map((service) => ({ href: `/client/services/${service.id}`, id: service.id, label: serviceListTitle(service) }));
  const domainSummaryItems = domainRows
    .slice(0, 4)
    .map((domain) => ({ href: "/client/domains", id: domain.id, label: domain.domain }));
  const ticketSummaryItems = tickets
    .filter((ticket) => !["CLOSED", "RESOLVED"].includes(ticket.status))
    .slice(0, 4)
    .map((ticket) => ({ href: `/client/tickets/${ticket.id}`, id: ticket.id, label: ticket.subject }));
  const invoiceSummaryItems = invoices
    .slice(0, 4)
    .map((invoice) => ({ href: `/client/invoices/${invoice.id}`, id: invoice.id, label: `${invoiceDisplayNumber(invoice)} · ${money(invoice.totalCents, invoice.currency)}` }));

  if (!authChecked) {
    return null;
  }

  return (
    <div className={styles.page}>
      <aside className={styles.sidebar}>
        <nav aria-label="Client">
          <a aria-current={clientNavCurrent(view, "dashboard")} href="/client">{copy.overview}</a>
          <a aria-current={clientNavCurrent(view, "services")} href="/client/services">{copy.services}</a>
          <a aria-current={clientNavCurrent(view, "domains")} href="/client/domains">{copy.domains}</a>
          <a aria-current={clientNavCurrent(view, "invoices")} href="/client/invoices">{copy.invoices}</a>
          <a aria-current={clientNavCurrent(view, "add-funds")} className={styles.subNav} href="/client/billing/add-funds">{copy.addFunds}</a>
          <a aria-current={clientNavCurrent(view, "payment")} href="/client/payments">{copy.payments}</a>
          <a aria-current={clientNavCurrent(view, "knowledgebase")} href="/client/knowledgebase">{copy.knowledgebase}</a>
          <a aria-current={clientNavCurrent(view, "tickets")} href="/client/tickets">{copy.tickets}</a>
          <a aria-current={clientNavCurrent(view, "new-ticket")} className={styles.subNav} href="/client/tickets/new">{copy.newTicket}</a>
          <a aria-current={clientNavCurrent(view, "profile")} href="/client/profile">{copy.profile}</a>
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
            <Button href={`/${locale}/pricing`} icon={CreditCard}>
              {copy.newService}
            </Button>
          </div>
        </header>

        <section className={styles.overviewGrid} aria-label="Overview">
          <DashboardSummaryCard empty={copy.noActiveServices} href="/client/services" icon={Server} items={serviceSummaryItems} label={copy.services} loading={loading.services} loadingLabel={copy.loadingServices} value={serviceRows.length} />
          <DashboardSummaryCard empty={copy.noDomains} href="/client/domains" icon={Globe} items={domainSummaryItems} label={copy.domains} loading={loading.services} loadingLabel={copy.loadingDomains} value={domainRows.length} />
          <DashboardSummaryCard empty={copy.noTickets} href="/client/tickets" icon={LifeBuoy} items={ticketSummaryItems} label={copy.openTickets} loading={loading.tickets} loadingLabel={copy.loadingTickets} value={openTickets} />
          <DashboardSummaryCard empty={copy.noInvoices} href="/client/invoices" icon={FileText} items={invoiceSummaryItems} label={copy.openInvoices} loading={loading.invoices} loadingLabel={copy.loadingInvoices} value={openInvoices} />
        </section>

        {(view === "dashboard" || view === "services") && !serviceId ? <ServicesTable loading={loading.services} services={serviceRows} /> : null}
        {view === "dashboard" && !serviceId ? <DashboardKnowledgeFeed announcements={announcements} knowledgebase={knowledgebase} loading={loading.announcements || loading.knowledgebase} /> : null}
        {view === "domains" ? <DomainsTable domains={domainRows} loading={loading.services} /> : null}
        {serviceId ? <ServiceDetail loading={loading.services} service={selectedService ?? services.find((service) => service.id === serviceId)} /> : null}
        {view === "invoices" && !invoiceId ? <InvoicesTable invoices={invoices} loading={loading.invoices} /> : null}
        {invoiceId ? <InvoiceDetail invoice={selectedInvoice ?? invoices.find((invoice) => invoice.id === invoiceId)} loading={loading.invoices} /> : null}
        {view === "tickets" && !ticketId ? <TicketsTable loading={loading.tickets} tickets={tickets} /> : null}
        {ticketId ? <TicketThread loading={loading.tickets} ticket={selectedTicket} onTicketChange={setSelectedTicket} /> : null}
        {view === "new-ticket" ? <NewTicket services={services} /> : null}
        {view === "knowledgebase" ? <KnowledgebaseList articles={knowledgebase} loading={loading.knowledgebase} /> : null}
        {view === "add-funds" ? <AddFunds /> : null}
        {view === "payment" ? <PaymentInfo /> : null}
        {view === "profile" ? <ProfileForm profile={profile} setProfile={setProfile} /> : null}
      </main>
    </div>
  );
}

function clientNavCurrent(current: ClientView, target: ClientView) {
  return current === target ? "page" : undefined;
}

function serviceListUrl() {
  return `${API_BASE_URL}/services`;
}

function serviceDetailUrl(serviceId: string) {
  return `${API_BASE_URL}/services/${serviceId}?refresh=1`;
}

function usePortalLoadingFallback(setLoading: (loading: Record<LoadingKey, boolean>) => void) {
  useEffect(() => {
    const timer = window.setTimeout(() => setLoading(allLoaded), PORTAL_LOADING_TIMEOUT_MS);
    return () => window.clearTimeout(timer);
  }, [setLoading]);
}

function usePortalNavigationRecovery(
  setLoading: (loading: Record<LoadingKey, boolean>) => void,
  setRefreshVersion: (update: (current: number) => number) => void
) {
  useEffect(() => {
    const reloadRestoredPage = (event: PageTransitionEvent) => {
      if (event.persisted) {
        window.location.reload();
      }
    };
    const revalidateHistoryNavigation = () => {
      setLoading(allLoaded);
      setRefreshVersion((current) => current + 1);
    };
    window.addEventListener("pageshow", reloadRestoredPage);
    window.addEventListener("popstate", revalidateHistoryNavigation);
    return () => {
      window.removeEventListener("pageshow", reloadRestoredPage);
      window.removeEventListener("popstate", revalidateHistoryNavigation);
    };
  }, [setLoading, setRefreshVersion]);
}

function applyPortalCache(
  locale: Locale,
  setters: {
    setAnnouncements: (items: ApiAnnouncement[]) => void;
    setInvoices: (items: ApiInvoice[]) => void;
    setKnowledgebase: (items: ApiKnowledgebaseArticle[]) => void;
    setProfile: (profile: ClientProfile) => void;
    setServices: (items: ApiService[]) => void;
    setTickets: (items: ApiTicket[]) => void;
  }
) {
  if (portalDataCache.services) {
    setters.setServices(portalDataCache.services);
  }
  if (portalDataCache.invoices) {
    setters.setInvoices(portalDataCache.invoices);
  }
  if (portalDataCache.tickets) {
    setters.setTickets(portalDataCache.tickets);
  }
  const articles = portalDataCache.knowledgebaseByLocale?.[locale];
  if (articles) {
    setters.setKnowledgebase(articles);
  }
  const announcements = portalDataCache.announcementsByLocale?.[locale];
  if (announcements) {
    setters.setAnnouncements(announcements);
  }
  if (portalDataCache.profile) {
    setters.setProfile(portalDataCache.profile);
  }
}

async function fetchPortalJson<T>(url: string, init: RequestInit = {}) {
  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), PORTAL_LOADING_TIMEOUT_MS);
  try {
    const response = await fetch(url, { ...init, signal: controller.signal });
    return await json(response) as T | null;
  } catch {
    return null;
  } finally {
    window.clearTimeout(timer);
  }
}

function MetricValue({ label, loading, value }: { label: string; loading: boolean; value: number }) {
  return <strong>{loading ? <LoadingSpinner label={label} /> : value}</strong>;
}

function DashboardSummaryCard({
  empty,
  href,
  icon: Icon,
  items,
  label,
  loading,
  loadingLabel,
  value
}: {
  empty: string;
  href: string;
  icon: LucideIcon;
  items: DashboardSummaryItem[];
  label: string;
  loading: boolean;
  loadingLabel: string;
  value: number;
}) {
  return (
    <article className={styles.overviewCard}>
      <div className={styles.metricHead}>
        <Icon aria-hidden />
        <MetricValue loading={loading} label={loadingLabel} value={value} />
        <a className={styles.metricTitle} href={href}>{label}</a>
      </div>
      <DashboardSummaryList empty={empty} items={items} />
    </article>
  );
}

function DashboardSummaryList({ empty, items }: { empty: string; items: DashboardSummaryItem[] }) {
  if (!items.length) {
    return <div className={styles.metricBody}><span className={styles.metricEmpty}>{empty}</span></div>;
  }
  return (
    <div className={styles.metricBody}>
      <ul className={styles.metricList}>
        {items.map((item) => <li key={item.id}><a href={item.href}>{item.label}</a></li>)}
      </ul>
    </div>
  );
}

function LoadingSpinner({ label }: { label: string }) {
  return <span aria-label={label} className={styles.spinner} role="status" />;
}

function LoadingBlock({ title }: { title: string }) {
  return (
    <section className={styles.module}>
      <div className={styles.loadingBlock}>
        <LoadingSpinner label={`Loading ${title.toLowerCase()}`} />
        <div>
          <h2>{title}</h2>
          <p>Loading data.</p>
        </div>
      </div>
    </section>
  );
}

function LoadingTableRow({ colSpan, label }: { colSpan: number; label: string }) {
  return <tr><td colSpan={colSpan}><span className={styles.loadingInline}><LoadingSpinner label={label} />Loading...</span></td></tr>;
}

function DashboardKnowledgeFeed({
  announcements,
  knowledgebase,
  loading
}: {
  announcements: ApiAnnouncement[];
  knowledgebase: ApiKnowledgebaseArticle[];
  loading: boolean;
}) {
  const items = dashboardFeedItems(announcements, knowledgebase);
  const locale = currentLocale();
  const copy = dictionary[locale].client;
  return (
    <section className={styles.dashboardFeed}>
      <div className={styles.blockHeader}>
        <div>
          <span className="eyebrow">Portal</span>
          <h2>{copy.announcementsAndArticles}</h2>
        </div>
      </div>
      <div className={styles.feedList}>
        {loading ? <span className={styles.loadingInline}><LoadingSpinner label={copy.loadingArticles} />{copy.loadingArticles}</span> : null}
        {!loading && items.map((item) => item.href ? (
          <a className={styles.feedItem} href={item.href} key={item.id}>
            <strong>{item.title}</strong>
            <span>{announcementDateLabel(item.date)}</span>
            <p>{item.excerpt}</p>
          </a>
        ) : (
          <article className={styles.feedItem} key={item.id}>
            <strong>{item.title}</strong>
            <span>{announcementDateLabel(item.date)}</span>
            <p>{item.excerpt}</p>
          </article>
        ))}
        {!loading && !items.length ? <p className={styles.emptySmart}>{copy.noArticles}</p> : null}
      </div>
    </section>
  );
}

function dashboardFeedItems(announcements: ApiAnnouncement[], articles: ApiKnowledgebaseArticle[]): DashboardFeedItem[] {
  return [
    ...announcements.map((item) => ({
      date: item.publishedAt ?? item.createdAt,
      excerpt: item.excerpt ?? previewText(item.body ?? ""),
      id: `announcement-${item.id}`,
      title: item.title
    })),
    ...articles.map((item) => ({
      date: item.updatedAt ?? item.createdAt,
      excerpt: item.excerpt ?? previewText(item.body),
      href: `/${currentLocale()}/knowledgebase/${item.slug}`,
      id: `article-${item.id}`,
      title: item.title
    }))
  ]
    .sort((a, b) => dateValue(b.date) - dateValue(a.date))
    .slice(0, 6);
}

function ServicesTable({ loading, services }: { loading: boolean; services: ApiService[] }) {
  const locale = currentLocale();
  const copy = dictionary[locale].client;
  return (
    <section className={styles.block} id="services">
          <div className={styles.blockHeader}>
            <div>
              <span className="eyebrow">Services</span>
              <h2>{copy.services}</h2>
            </div>
          </div>
          <div className={styles.tableWrap}>
            <table className="table">
              <thead>
                <tr>
                  <th>{copy.product}</th>
                  <th>{copy.pricing}</th>
                  <th>{copy.nextDueDate}</th>
                  <th>{copy.status}</th>
                </tr>
              </thead>
              <tbody>
                {loading ? <tr><td colSpan={4}><span className={styles.loadingInline}><LoadingSpinner label={copy.loadingServices} />{copy.loadingServices}</span></td></tr> : null}
                {!loading && services.map((service) => (
                  <tr key={service.id}>
                    <td><a href={`/client/services/${service.id}`}><strong>{serviceListTitle(service)}</strong></a><br />{serviceListSubtitle(service)}</td>
                    <td>{money(service.productPrice.amountCents, service.productPrice.currency)}<br />{cycleLabel(service.productPrice.billingCycle)}</td>
                    <td>{dateLabel(service.renewsAt)}</td>
                    <td>
                      <StatusPill label={serviceStatusLabel(service.status, locale)} tone={statusTone[service.status] ?? "neutral"} />
                    </td>
                  </tr>
                ))}
                {!loading && services.length === 0 ? <tr><td colSpan={4}>{copy.noServices}</td></tr> : null}
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

function DomainsTable({ domains, loading }: { domains: DomainRow[]; loading: boolean }) {
  const locale = currentLocale();
  const copy = dictionary[locale].client;
  return (
    <section className={styles.block} id="domains">
      <div className={styles.blockHeader}>
        <div>
          <span className="eyebrow">Domains</span>
          <h2>{copy.domains}</h2>
        </div>
      </div>
      <div className={styles.tableWrap}>
        <table className="table">
          <thead>
            <tr>
              <th>{copy.domain}</th>
              <th>{copy.pricing}</th>
              <th>{copy.nextDueDate}</th>
              <th>{copy.status}</th>
            </tr>
          </thead>
          <tbody>
            {loading ? <LoadingTableRow colSpan={4} label={copy.loadingDomains} /> : null}
            {!loading && domains.length ? domains.map((domain) => (
              <tr key={domain.id}>
                <td><strong>{domain.domain}</strong></td>
                <td>{money(domain.amountCents, domain.currency)}<br />{cycleLabel(domain.billingCycle)}</td>
                <td>{dateLabel(domain.renewsAt)}</td>
                <td><StatusPill label={serviceStatusLabel(domain.status, locale)} tone={statusTone[domain.status] ?? "neutral"} /></td>
              </tr>
            )) : null}
            {!loading && domains.length === 0 ? <tr><td colSpan={4}>{copy.noDomains}</td></tr> : null}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function ServiceDetail({ loading, service }: { loading: boolean; service?: ApiService }) {
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
    return loading ? <LoadingBlock title="Service" /> : <section className={styles.module}><h2>Service</h2><p>Service not found.</p></section>;
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
          <span>Domain</span>
          <strong>{serviceDomainLabel(service)}</strong>
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
      <div className={styles.hostingShell}>
        <div className={styles.panelTitle}>
          <div>
            <span className="eyebrow">Hosting Control Panel</span>
            <h3>{panel?.domain ?? serviceName(service)}</h3>
          </div>
        </div>
        <div className={styles.hostingSection}>
          <div className={styles.usageGrid}>
            <UsageGraph icon="disk" label="Disk space" usage={panel?.diskUsage} />
            <UsageGraph icon="bandwidth" label="Bandwidth" usage={panel?.bandwidthUsage} />
          </div>
        </div>
        <div className={styles.hostingSection}>
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
        </div>
        {panel?.errors.length ? <p className={styles.warn}>{panel.errors.join(" ")}</p> : null}
      </div>
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
      <strong>{usage ? `${usage.used} / ${usage.limit}` : <LoadingSpinner label={`Loading ${label.toLowerCase()}`} />}</strong>
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
    <div className={styles.hostingSection}>
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
            <div className={styles.entryActions}>
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
              <div className={styles.entryDelete}><ActionForm intent={removeIntent} refresh={refresh} service={service} hiddenFields={[[nameField, localPart(entry.name, suffix)]]} fields={[]} button="Delete" /></div>
            </div>
          </article>
        ))}
        {!entries.length ? <span>No items found.</span> : null}
      </div>
    </div>
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

function InvoicesTable({ invoices, loading }: { invoices: ApiInvoice[]; loading: boolean }) {
  const copy = dictionary[currentLocale()].client;
  return (
    <section className={styles.invoiceCards}>
      {loading ? <section className={styles.module}><span className={styles.loadingInline}><LoadingSpinner label={copy.loadingInvoices} />{copy.loadingInvoices}</span></section> : null}
      {!loading && invoices.map((invoice) => {
        const payable = invoice.status === "UNPAID" || invoice.status === "OVERDUE";
        return (
          <article className={styles.invoiceCard} key={invoice.id}>
            <div className={styles.invoiceCardLead}>
              <span>{copy.invoiceDetail}</span>
              <strong><a href={`/client/invoices/${invoice.id}`}>{invoiceDisplayNumber(invoice)}</a></strong>
              {invoice.status === "PAID" ? <small>{copy.paidAt} {dateLabel(invoice.paidAt)} · {paymentGateway(invoice)}</small> : null}
            </div>
            <div className={styles.invoiceCardMeta}><span>{copy.issuedAt}</span><strong>{dateLabel(invoice.issuedAt)}</strong></div>
            <div className={styles.invoiceCardMeta}><span>{copy.dueAt}</span><strong>{dateLabel(invoice.dueAt)}</strong></div>
            <div className={styles.invoiceCardTotal}><span>{copy.total}</span><strong>{money(invoice.totalCents, invoice.currency)}</strong></div>
            <div className={styles.invoiceListAction}>
              <StatusPill label={invoiceStatusLabel(invoice.status, currentLocale())} tone={statusTone[invoice.status] ?? "neutral"} />
              {payable ? <a className={styles.invoicePayLink} href={`/client/billing/payment?invoice=${invoice.id}`}><CreditCard size={13} />Pay now</a> : null}
            </div>
          </article>
        );
      })}
      {!loading && invoices.length === 0 ? <section className={styles.module}><p>{copy.noInvoices}</p></section> : null}
    </section>
  );
}

function InvoiceDetail({ invoice, loading }: { invoice?: ApiInvoice; loading: boolean }) {
  if (!invoice) {
    return loading ? <LoadingBlock title="Invoice" /> : <section className={styles.module}><h2>Invoice</h2><p>Invoice not found.</p></section>;
  }
  const locale = currentLocale();
  const copy = dictionary[locale].client;
  const customer = invoice.customerSnapshot ?? {};
  const address = customer.address ?? {};
  const seller = invoice.sellerSnapshot ?? {};
  const showVat = (invoice.taxAmountCents ?? 0) > 0;
  const payable = invoice.status === "UNPAID" || invoice.status === "OVERDUE";
  // Paid invoices: always show the exact stored amount in the stored currency
  const fmt = (cents: number) => invoice.status === "PAID"
    ? frozenMoney(cents, invoice.currency, locale)
    : money(cents, invoice.currency);

  return (
    <section className={styles.invoicePaper}>
      <div className={styles.invoiceActionBar}>
        <div>
          <span>{payable ? (locale === "de" ? "Zahlung fällig" : "Payment due") : (locale === "de" ? "Rechnung bereit" : "Invoice ready")}</span>
          <strong>{fmt(invoice.totalCents)}</strong>
          <small>{copy.dueAt} {dateLabel(invoice.dueAt)}</small>
        </div>
        <div className={styles.invoiceActions}>
          {payable ? <Button href={`/client/billing/payment?invoice=${invoice.id}`} icon={CreditCard}>{locale === "de" ? "Rechnung bezahlen" : "Pay invoice"}</Button> : null}
          <InvoiceHtmlButton invoice={invoice} />
          <PdfDownloadButton invoice={invoice} />
        </div>
      </div>

      <div className={styles.invoiceSheet}>
        <header className={styles.invoiceLetterhead}>
          <div>
            <strong>{seller.companyName || "Dezhost"}</strong>
            <span>{[seller.address, seller.zip, seller.city, seller.country].filter(Boolean).join(", ")}</span>
          </div>
          <div>
            {seller.vatNumber ? <span>USt-IdNr. {seller.vatNumber}</span> : null}
            {seller.email ? <span>{seller.email}</span> : null}
            {seller.phone ? <span>{seller.phone}</span> : null}
          </div>
        </header>

        <div className={styles.invoiceSender}>{[seller.companyName, seller.address, seller.zip, seller.city].filter(Boolean).join(", ")}</div>
        <div className={styles.invoiceRecipient}>
          <strong>{customer.companyName || customer.name}</strong>
          {customer.companyName && customer.name ? <span>{customer.name}</span> : null}
          <span>{address.line1}</span>
          <span>{address.postalCode} {address.city}</span>
          <span>{customer.countryCode}</span>
          {customer.vatId ? <span>USt-IdNr. {customer.vatId}</span> : null}
        </div>

        <div className={styles.invoiceTitleRow}>
          <div><span className="eyebrow">{copy.invoiceTitle}</span><h2>{copy.invoiceTitle} {invoiceDisplayNumber(invoice)}</h2></div>
          <StatusPill label={invoiceStatusLabel(invoice.status, locale)} tone={invoice.status === "PAID" ? "good" : "warn"} />
        </div>

        <div className={styles.invoiceMetaGrid}>
          <div className={styles.invoiceMetaGroup}>
            <span>{copy.invoiceDate}</span><strong>{dateLabel(invoice.issuedAt)}</strong>
            {invoice.status === "PAID" ? <><span>{copy.invoicePaidDate}</span><strong>{dateLabel(invoice.paidAt)}</strong></> : null}
            <span>{copy.customerNumber}</span><strong>{formatCustomerNumber(customer.customerNumber ?? invoice.user?.customerNumber)}</strong>
          </div>
          <div className={styles.invoiceMetaGroup}>
            <span>{copy.invoiceDueDate}</span><strong>{dateLabel(invoice.dueAt)}</strong>
            {invoice.status === "PAID" ? <><span>{copy.invoicePaymentMethod}</span><strong>{paymentGateway(invoice)}</strong></> : null}
            <span>E-Mail</span><strong>{customer.email}</strong>
          </div>
        </div>

        <p className={styles.invoiceIntro}>{copy.invoiceIntro}</p>

        <table className={`table ${styles.invoiceTable}`}>
          <thead>
            <tr>
              <th>{copy.invoiceDescription}</th>
              <th>{copy.invoicePeriod}</th>
              <th>{copy.invoiceQty}</th>
              <th>{copy.invoiceUnitPrice}</th>
              {showVat ? <th>{copy.invoiceVat}</th> : null}
              <th>{copy.invoiceLineTotal}</th>
            </tr>
          </thead>
          <tbody>
            {(invoice.items ?? []).map((item) => (
              <tr key={item.description}>
                <td>{item.description}</td>
                <td>{itemPeriod(item, locale)}</td>
                <td>{item.quantity}</td>
                <td>{fmt(item.unitAmountCents)}</td>
                {showVat ? <td>{fmt(item.taxAmountCents)}</td> : null}
                <td>{fmt(item.totalCents)}</td>
              </tr>
            ))}
          </tbody>
        </table>

        <div className={styles.invoiceTotals}>
          <span>{copy.invoiceSubtotal} <strong>{fmt(invoice.subtotalCents ?? invoice.totalCents)}</strong></span>
          {showVat ? <span>{copy.invoiceVat} <strong>{fmt(invoice.taxAmountCents ?? 0)}</strong></span> : null}
          <strong>{copy.invoiceGrandTotal} {fmt(invoice.totalCents)}</strong>
        </div>

        {invoice.taxAmountCents === 0 && invoice.taxReason ? <p className={styles.invoiceNote}>{invoice.taxReason}</p> : null}
        {seller.paymentInstructions || seller.bankDetails ? <p className={styles.invoiceNote}>{seller.paymentInstructions}<br />{seller.bankDetails}</p> : null}
        <footer className={styles.invoiceFooter}>{(invoice.footerLines ?? []).map((line) => <span key={line}>{line}</span>)}</footer>
      </div>
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
    link.download = `invoice-${invoiceDisplayNumber(invoice)}.pdf`;
    link.click();
    URL.revokeObjectURL(url);
    setMessage("");
    notify.success("PDF ready.");
  }
  return <div className={styles.pdfAction}><Button type="button" variant="secondary" onClick={download}>Download PDF</Button>{message ? <span>{message}</span> : null}</div>;
}

function InvoiceHtmlButton({ invoice }: { invoice: ApiInvoice }) {
  const [message, setMessage] = useState("");
  async function openHtml() {
    const response = await fetch(`${API_BASE_URL}/billing/invoices/${invoice.id}/html`, { headers: authHeaders("client") });
    if (!response.ok) {
      setMessage("HTML failed.");
      notify.error("HTML failed.");
      return;
    }
    const blob = new Blob([await response.text()], { type: "text/html" });
    const url = URL.createObjectURL(blob);
    window.open(url, "_blank", "noopener,noreferrer");
    window.setTimeout(() => URL.revokeObjectURL(url), 30_000);
    setMessage("");
  }
  return <div className={styles.pdfAction}><Button type="button" variant="secondary" onClick={openHtml}>HTML ansehen</Button>{message ? <span>{message}</span> : null}</div>;
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

function TicketsTable({ loading, tickets }: { loading: boolean; tickets: ApiTicket[] }) {
  const copy = dictionary[currentLocale()].client;
  return (
    <section className={styles.block}>
      <div className={styles.blockHeader}>
        <div><span className="eyebrow">Support Tickets</span><h2>{copy.tickets}</h2></div>
        <Button href="/client/tickets/new" icon={Send}>{copy.newTicket}</Button>
      </div>
      {loading ? <section className={styles.module}><span className={styles.loadingInline}><LoadingSpinner label={copy.loadingTickets} />{copy.loadingTickets}</span></section> : null}
      {!loading && tickets.length ? (
        <div className={styles.ticketCards}>
          {tickets.map((ticket) => (
            <a className={styles.ticketCard} href={`/client/tickets/${ticket.id}`} key={ticket.id}>
              <div>
                <span>#{ticket.publicId ?? ticket.id.slice(-6).toUpperCase()}</span>
                <strong>{ticket.subject}</strong>
                <small>{ticket.department} · {ticket.service?.product?.name ?? "No related service"}</small>
              </div>
              <div>
                <StatusPill label={ticketLabel(ticket.status)} tone={statusTone[ticket.status] ?? "neutral"} />
                <time>{dateLabel(ticket.updatedAt)}</time>
              </div>
            </a>
          ))}
        </div>
      ) : null}
      {!loading && tickets.length === 0 ? <section className={styles.module}><p>{copy.noTickets}</p></section> : null}
    </section>
  );
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
        <a href={`/${currentLocale()}/knowledgebase/${article.slug}`} key={article.id} target="_blank">
          <strong>{article.title}</strong>
          <span>{article.excerpt ?? previewText(article.body)}</span>
        </a>
      ))}
    </div>
  );
}

function KnowledgebaseList({ articles, loading }: { articles: ApiKnowledgebaseArticle[]; loading: boolean }) {
  const locale = currentLocale();
  const copy = dictionary[locale].client;
  return (
    <section className={styles.block}>
      <div className={styles.blockHeader}>
        <div><span className="eyebrow">Knowledgebase</span><h2>{copy.knowledgebase}</h2></div>
        <Button href={`/${locale}/knowledgebase`} icon={BookOpen} variant="secondary">{copy.knowledgebase}</Button>
      </div>
      <div className={styles.articleList}>
        {loading ? <span className={styles.loadingInline}><LoadingSpinner label={copy.loadingArticles} />{copy.loadingArticles}</span> : null}
        {!loading && articles.map((article) => (
          <a href={`/${locale}/knowledgebase/${article.slug}`} key={article.id}>
            <BookOpen aria-hidden />
            <div>
              <h3>{article.title}</h3>
              <p>{article.excerpt ?? previewText(article.body)}</p>
            </div>
          </a>
        ))}
        {!loading && articles.length === 0 ? <p className={styles.emptySmart}>{copy.noArticles}</p> : null}
      </div>
    </section>
  );
}

function TicketThread({ loading, onTicketChange, ticket }: { loading: boolean; onTicketChange: (ticket: ApiTicket) => void; ticket?: ApiTicket }) {
  const [message, setMessage] = useState("");
  if (!ticket) {
    return loading ? <LoadingBlock title="Ticket" /> : <section className={styles.module}><h2>Ticket</h2><p>Ticket not found.</p></section>;
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
        <TicketMessage
          attachments={ticket.attachments ?? []}
          body={ticket.subject}
          meta={`${ticket.department} · ${dateTimeLabel(ticket.createdAt ?? ticket.updatedAt)}`}
          title="Ticket opened"
        />
        {(ticket.replies ?? []).map((reply) => (
          <TicketMessage
            attachments={reply.attachments ?? []}
            body={reply.body}
            key={reply.id}
            meta={dateTimeLabel(reply.createdAt)}
            title={reply.user?.name ?? reply.user?.email ?? "Support"}
          />
        ))}
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

function TicketMessage({ attachments, body, meta, title }: { attachments: Array<{ fileName: string; id: string; storageKey: string }>; body: string; meta: string; title: string }) {
  return (
    <article className={styles.ticketMessage}>
      <header>
        <div>
          <strong>{title}</strong>
          <span>{meta}</span>
        </div>
      </header>
      <p>{body}</p>
      <AttachmentList files={attachments} />
    </article>
  );
}

function AttachmentList({ files }: { files: Array<{ fileName: string; id: string; storageKey: string }> }) {
  if (files.length === 0) {
    return null;
  }
  return <div className={styles.attachmentLinks}>{files.map((file) => <a href={file.storageKey} key={file.id} target="_blank"><Paperclip aria-hidden size={13} />{file.fileName}</a>)}</div>;
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

function isStrongPassword(password: string) {
  return (
    password.length >= 9 &&
    password.length <= 16 &&
    /[A-Z]/.test(password) &&
    /[a-z]/.test(password) &&
    /\d/.test(password) &&
    /[~*!@$#%_+.?:,{}]/.test(password)
  );
}

function ProfileForm({
  profile,
  setProfile
}: {
  profile?: {
    address?: { city?: string; line1?: string; postalCode?: string; state?: string };
    countryCode?: string;
    customerNumber?: number | null;
    email?: string;
    name?: string;
    phone?: string;
    vatId?: string | null;
  };
  setProfile: (profile: any) => void;
}) {
  const [message, setMessage] = useState("");
  const [pwMessage, setPwMessage] = useState("");
  const [newPassword, setNewPassword] = useState("");

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

  async function changePassword(formData: FormData) {
    const currentPassword = String(formData.get("currentPassword") ?? "");
    const newPw = String(formData.get("newPassword") ?? "");
    const confirmPw = String(formData.get("confirmPassword") ?? "");
    if (newPw !== confirmPw) {
      setPwMessage("New passwords do not match.");
      notify.error("New passwords do not match.");
      return;
    }
    if (!isStrongPassword(newPw)) {
      setPwMessage("Password must be 9-16 characters with uppercase, lowercase, number, and special character (~*!@$#%_+.?:,{}).");
      notify.error("Password does not meet requirements.");
      return;
    }
    const response = await fetch(`${API_BASE_URL}/auth/change-password`, {
      body: JSON.stringify({ currentPassword, newPassword: newPw }),
      headers: { "Content-Type": "application/json", ...authHeaders("client") },
      method: "POST"
    });
    setPwMessage(await notifyResponse(response, "Password changed successfully.", "Password change failed."));
    if (response.ok) {
      setNewPassword("");
    }
  }

  const passwordRules = [
    { label: "9–16 characters", passed: newPassword.length >= 9 && newPassword.length <= 16 },
    { label: "Uppercase letter", passed: /[A-Z]/.test(newPassword) },
    { label: "Lowercase letter", passed: /[a-z]/.test(newPassword) },
    { label: "Number", passed: /\d/.test(newPassword) },
    { label: "Special character (~*!@$#%_+.?:,{})", passed: /[~*!@$#%_+.?:,{}]/.test(newPassword) }
  ];

  return (
    <div className={styles.module}>
      <UserRound aria-hidden />
      <h2>Profile</h2>
      <p>Kundennummer: <strong>{formatCustomerNumber(profile?.customerNumber)}</strong></p>
      <p>Changing profile information here does not change registered domain contact details. Open a support ticket for domain contact changes.</p>
      <form action={submit} key={profile?.email ?? "profile"} className={styles.inlineForm}>
        <label className={styles.fullField}>Name<input className="input" defaultValue={profile?.name ?? ""} name="name" /></label>
        <label className={styles.fullField}>Email<input className="input" defaultValue={profile?.email ?? ""} name="email" type="email" /></label>
        <label className={styles.fullField}>Address<input className="input" defaultValue={profile?.address?.line1 ?? ""} name="address" /></label>
        <label>Postal code<input className="input" defaultValue={profile?.address?.postalCode ?? ""} name="postalCode" /></label>
        <label>City<input className="input" defaultValue={profile?.address?.city ?? ""} name="city" /></label>
        <label>State<input className="input" defaultValue={profile?.address?.state ?? ""} name="state" /></label>
        <label>Country<input className="input" defaultValue={profile?.countryCode ?? "DE"} name="countryCode" /></label>
        <label>Phone<input className="input" defaultValue={profile?.phone ?? ""} name="phone" /></label>
        <label>VAT ID<input className="input" defaultValue={profile?.vatId ?? ""} name="vatId" /></label>
        <Button icon={FileText} type="submit">Save Profile</Button>
        {message ? <p>{message}</p> : null}
      </form>

      <hr className={styles.sectionDivider} />
      <h3>Change Password</h3>
      <p className={styles.passwordNote}>Must be 9–16 characters with uppercase, lowercase, a number, and a special character.</p>
      <form action={changePassword} className={styles.inlineForm}>
        <label className={styles.fullField}>Current Password<input autoComplete="current-password" className="input" name="currentPassword" required type="password" /></label>
        <label className={styles.fullField}>New Password
          <input
            autoComplete="new-password"
            className="input"
            name="newPassword"
            required
            type="password"
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
          />
        </label>
        {newPassword.length > 0 && (
          <div className={styles.passwordRules}>
            {passwordRules.map((rule) => (
              <span key={rule.label} className={rule.passed ? styles.rulePassed : styles.ruleFailed}>
                {rule.passed ? "✓" : "○"} {rule.label}
              </span>
            ))}
          </div>
        )}
        <label className={styles.fullField}>Confirm New Password<input autoComplete="new-password" className="input" name="confirmPassword" required type="password" /></label>
        <Button type="submit" variant="secondary">Change Password</Button>
        {pwMessage ? <p>{pwMessage}</p> : null}
      </form>
    </div>
  );
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

function dateValue(value?: string | null) {
  const date = value ? new Date(value).getTime() : 0;
  return Number.isFinite(date) ? date : 0;
}

function itemPeriod(item: NonNullable<ApiInvoice["items"]>[number], locale = currentLocale()) {
  if (item.servicePeriodStart || item.servicePeriodEnd) {
    return [dateLabel(item.servicePeriodStart), dateLabel(item.servicePeriodEnd)].filter((value) => value !== "-").join(" – ");
  }
  return item.billingCycle ? cycleLabel(item.billingCycle, locale) : "-";
}

function primaryServiceDomain(service: ApiService) {
  return service.domainRecords?.find((record) => record.domain)?.domain ?? stringConfig(service.configuration, "domainName");
}

function serviceName(service: ApiService) {
  return service.product.type === "DOMAIN" ? primaryServiceDomain(service) ?? service.product.name : service.product.name;
}

function serviceListTitle(service: ApiService) {
  return service.product.type === "DOMAIN" ? serviceName(service) : service.product.name;
}

function serviceListSubtitle(service: ApiService) {
  if (service.product.type === "DOMAIN") {
    return "Domain";
  }
  return primaryServiceDomain(service) ?? "";
}

function serviceDomainLabel(service: ApiService) {
  return primaryServiceDomain(service) ?? "-";
}

function serviceKind(service: ApiService) {
  if (service.product.type === "DOMAIN") {
    return "Domain";
  }
  if (service.product.type === "SHARED_HOSTING") {
    return service.product.name;
  }
  if (service.product.type === "VPS") {
    return `VPS: ${service.product.name}`;
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
