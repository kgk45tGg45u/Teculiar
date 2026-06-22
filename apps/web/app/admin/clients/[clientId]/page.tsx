import type { ReactNode } from "react";
import { formatCustomerNumber, invoiceDisplayNumber, money, type ApiClient, type AuthUser } from "../../../../lib/api";
import { apiGetAuth, redirectToAdminLogin } from "../../../../lib/server-api";
import { requestLocale } from "../../../../lib/server-locale";
import { getDictionary } from "../../../../lib/dictionary";
import { AdminClientActions } from "../../../../components/admin/admin-forms";
import { AdminSidebar } from "../../../../components/admin/admin-sidebar";
import { Button } from "../../../../components/ui/button";
import styles from "../../../../components/admin/admin-dashboard.module.css";
import { StatusPill } from "../../../../components/ui/status-pill";
import { invoiceStatusLabel, serviceStatusLabel } from "../../../../lib/status-labels";

export default async function AdminClientPage({ params }: { params: Promise<{ clientId: string }> }) {
  const user = await apiGetAuth<AuthUser>("/users/me");
  if (!user?.roles.some((role) => role === "admin" || role === "staff")) {
    await redirectToAdminLogin();
  }
  const { clientId } = await params;
  const [client, settings, locale] = await Promise.all([
    apiGetAuth<ApiClient>(`/users/${clientId}`),
    apiGetAuth<{ siteLogoUrl?: string }>("/admin/dev/billing/settings").then((r) => r ?? {}),
    requestLocale()
  ]);

  const copy = getDictionary(locale);
  const a = copy.admin;
  if (!client) {
    return (
      <div className={styles.page}>
        <AdminSidebar brandLogo={(settings as { siteLogoUrl?: string }).siteLogoUrl} />
        <main className={styles.main}><h1>{a.client}</h1><p>{a.detail.notFound}</p></main>
      </div>
    );
  }

  const paidRevenue = client.invoices?.filter((inv) => inv.status === "PAID").reduce((sum, inv) => sum + inv.totalCents, 0) ?? 0;

  return (
    <div className={styles.page}>
      <AdminSidebar brandLogo={(settings as { siteLogoUrl?: string }).siteLogoUrl} />
      <main className={styles.main}>
        <header className={styles.header}>
          <div>
            <span className="eyebrow"><a href="/admin/clients">{a.detail.backClients}</a></span>
            <h1>{client.name}</h1>
            <p style={{ margin: "2px 0 0", color: "var(--muted)", fontSize: "0.9rem" }}>
              {client.email} · {copy.client.customerNumber} {formatCustomerNumber(client.customerNumber)}
            </p>
          </div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <Button href={`/admin/orders/new?clientId=${client.id}`} variant="secondary">{a.view.newOrder}</Button>
          </div>
        </header>

        <section className={styles.panel}>
          <div className={styles.panelHeader}><h2>{a.detail.actions}</h2></div>
          <div style={{ padding: "16px" }}>
            <AdminClientActions client={client} />
          </div>
        </section>

        <section className={styles.metrics}>
          <div className="metric">
            <strong>{client.services?.filter((s) => s.status === "ACTIVE").length ?? 0}</strong>
            <span>{a.activeServices}</span>
          </div>
          <div className="metric">
            <strong>{client.domainRecords?.length ?? 0}</strong>
            <span>{a.eyebrow.domains}</span>
          </div>
          <div className="metric">
            <strong>{client.invoices?.filter((inv) => inv.status !== "PAID").length ?? 0}</strong>
            <span>{a.detail.unpaidInvoices}</span>
          </div>
          <div className="metric">
            <strong>{money(paidRevenue, "EUR", locale)}</strong>
            <span>{a.detail.totalRevenue}</span>
          </div>
        </section>

        <Panel title={a.detail.clientInfo} actions={null}>
          <table className="table"><tbody>
            <tr><th>{a.forms.customerType}</th><td>{client.customerType}</td></tr>
            <tr><th>{copy.client.customerNumber}</th><td>{formatCustomerNumber(client.customerNumber)}</td></tr>
            <tr><th>{a.forms.country}</th><td>{client.countryCode}</td></tr>
            <tr><th>{a.forms.vatId}</th><td>{client.vatId ?? "—"}</td></tr>
            <tr><th>{a.forms.phone}</th><td>{client.contacts?.[0]?.phone ?? "—"}</td></tr>
            <tr><th>{a.forms.address}</th><td>{addressLabel(client)}</td></tr>
          </tbody></table>
        </Panel>

        <Panel
          title={a.services}
          actions={client.services?.length ? <StatusPill label={`${client.services.length}`} tone="neutral" /> : null}
        >
          {client.services?.length ? (
            <table className="table">
              <thead>
                <tr><th>{a.col.service}</th><th>{a.detail.domain}</th><th>{a.status}</th><th>{a.detail.nextDue}</th></tr>
              </thead>
              <tbody>
                {client.services.map((service) => (
                  <tr key={service.id}>
                    <td><a href={`/admin/services/${service.id}`}>{service.product.name}</a></td>
                    <td>{service.domainRecords?.[0]?.domain ?? "—"}</td>
                    <td><StatusPill label={serviceStatusLabel(service.status, locale)} tone={service.status === "ACTIVE" ? "good" : "warn"} /></td>
                    <td>{dateLabel(service.renewsAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : <p style={{ padding: "16px", color: "var(--muted)", fontSize: "0.9rem" }}>{a.noServices}</p>}
        </Panel>

        <Panel
          title={a.invoices}
          actions={
            <div style={{ display: "flex", gap: 8 }}>
              {client.invoices?.length ? <StatusPill label={`${client.invoices.length}`} tone="neutral" /> : null}
            </div>
          }
        >
          {client.invoices?.length ? (
            <table className="table">
              <thead>
                <tr><th>{a.col.invoice}</th><th>{a.status}</th><th>{a.detail.due}</th><th>{a.total}</th></tr>
              </thead>
              <tbody>
                {client.invoices.map((invoice) => (
                  <tr key={invoice.id}>
                    <td><a href={`/admin/invoices/${invoice.id}`}>{invoiceDisplayNumber(invoice)}</a></td>
                    <td><StatusPill label={invoiceStatusLabel(invoice.status, locale)} tone={invoice.status === "PAID" ? "good" : "warn"} /></td>
                    <td>{dateLabel(invoice.dueAt)}</td>
                    <td>{money(invoice.totalCents, invoice.currency, locale)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : <p style={{ padding: "16px", color: "var(--muted)", fontSize: "0.9rem" }}>{a.misc.noInvoicesYet}</p>}
        </Panel>

        <Panel
          title={a.orders}
          actions={client.orders?.length ? <StatusPill label={`${client.orders.length}`} tone="neutral" /> : null}
        >
          {client.orders?.length ? (
            <table className="table">
              <thead>
                <tr><th>{a.order}</th><th>{a.status}</th><th>{a.col.items}</th><th>{a.total}</th></tr>
              </thead>
              <tbody>
                {client.orders.map((order) => (
                  <tr key={order.id}>
                    <td><a href={`/admin/orders/${order.id}`}>{order.orderNumber}</a></td>
                    <td><StatusPill label={order.status.toLowerCase()} tone={order.status === "ACTIVE" ? "good" : "warn"} /></td>
                    <td style={{ maxWidth: 260, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {order.items?.map((item) => item.description).join(", ")}
                    </td>
                    <td>{money(order.totalCents, order.currency, locale)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : <p style={{ padding: "16px", color: "var(--muted)", fontSize: "0.9rem" }}>{a.noOrders}</p>}
        </Panel>
      </main>
    </div>
  );
}

function Panel({ actions, children, title }: { actions: ReactNode; children: ReactNode; title: string }) {
  return (
    <section className={styles.panel}>
      <div className={styles.panelHeader}>
        <h2>{title}</h2>
        {actions}
      </div>
      {children}
    </section>
  );
}

function addressLabel(client: ApiClient) {
  const address = client.contacts?.[0]?.address;
  return [address?.line1, address?.postalCode, address?.city, address?.state].filter(Boolean).join(", ") || "—";
}

function dateLabel(value?: string | null) {
  return value ? new Intl.DateTimeFormat("de-DE", { dateStyle: "medium" }).format(new Date(value)) : "—";
}
