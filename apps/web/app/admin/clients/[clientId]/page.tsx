import { redirect } from "next/navigation";
import type { ReactNode } from "react";
import { formatCustomerNumber, invoiceDisplayNumber, money, type ApiClient, type AuthUser } from "../../../../lib/api";
import { apiGetAuth } from "../../../../lib/server-api";
import { requestLocale } from "../../../../lib/server-locale";
import { dictionary } from "../../../../lib/i18n";
import { AdminClientActions } from "../../../../components/admin/admin-forms";
import { AdminSidebar } from "../../../../components/admin/admin-sidebar";
import { Button } from "../../../../components/ui/button";
import styles from "../../../../components/admin/admin-dashboard.module.css";
import { StatusPill } from "../../../../components/ui/status-pill";
import { invoiceStatusLabel, serviceStatusLabel } from "../../../../lib/status-labels";

export default async function AdminClientPage({ params }: { params: Promise<{ clientId: string }> }) {
  const user = await apiGetAuth<AuthUser>("/users/me");
  if (!user?.roles.some((role) => role === "admin" || role === "staff")) {
    redirect("/admin/login" as never);
  }
  const { clientId } = await params;
  const [client, settings, locale] = await Promise.all([
    apiGetAuth<ApiClient>(`/users/${clientId}`),
    apiGetAuth<{ siteLogoUrl?: string }>("/admin/dev/billing/settings").then((r) => r ?? {}),
    requestLocale()
  ]);

  if (!client) {
    return (
      <div className={styles.page}>
        <AdminSidebar brandLogo={(settings as { siteLogoUrl?: string }).siteLogoUrl} />
        <main className={styles.main}><h1>Client</h1><p>Not found.</p></main>
      </div>
    );
  }

  const copy = dictionary[locale];
  const paidRevenue = client.invoices?.filter((inv) => inv.status === "PAID").reduce((sum, inv) => sum + inv.totalCents, 0) ?? 0;

  return (
    <div className={styles.page}>
      <AdminSidebar brandLogo={(settings as { siteLogoUrl?: string }).siteLogoUrl} />
      <main className={styles.main}>
        <header className={styles.header}>
          <div>
            <span className="eyebrow"><a href="/admin/clients">← Clients</a></span>
            <h1>{client.name}</h1>
            <p style={{ margin: "2px 0 0", color: "var(--muted)", fontSize: "0.9rem" }}>
              {client.email} · {copy.client.customerNumber} {formatCustomerNumber(client.customerNumber)}
            </p>
          </div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <Button href={`/admin/orders/new?clientId=${client.id}`} variant="secondary">New Order</Button>
          </div>
        </header>

        <section className={styles.panel}>
          <div className={styles.panelHeader}><h2>Actions</h2></div>
          <div style={{ padding: "16px" }}>
            <AdminClientActions client={client} />
          </div>
        </section>

        <section className={styles.metrics}>
          <div className="metric">
            <strong>{client.services?.filter((s) => s.status === "ACTIVE").length ?? 0}</strong>
            <span>Active services</span>
          </div>
          <div className="metric">
            <strong>{client.domainRecords?.length ?? 0}</strong>
            <span>Domains</span>
          </div>
          <div className="metric">
            <strong>{client.invoices?.filter((inv) => inv.status !== "PAID").length ?? 0}</strong>
            <span>Unpaid invoices</span>
          </div>
          <div className="metric">
            <strong>{money(paidRevenue, "EUR", locale)}</strong>
            <span>Total revenue</span>
          </div>
        </section>

        <Panel title="Client Information" actions={null}>
          <table className="table"><tbody>
            <tr><th>Customer type</th><td>{client.customerType}</td></tr>
            <tr><th>{copy.client.customerNumber}</th><td>{formatCustomerNumber(client.customerNumber)}</td></tr>
            <tr><th>Country</th><td>{client.countryCode}</td></tr>
            <tr><th>VAT ID</th><td>{client.vatId ?? "—"}</td></tr>
            <tr><th>Phone</th><td>{client.contacts?.[0]?.phone ?? "—"}</td></tr>
            <tr><th>Address</th><td>{addressLabel(client)}</td></tr>
          </tbody></table>
        </Panel>

        <Panel
          title="Services"
          actions={client.services?.length ? <StatusPill label={`${client.services.length}`} tone="neutral" /> : null}
        >
          {client.services?.length ? (
            <table className="table">
              <thead>
                <tr><th>Service</th><th>Domain</th><th>Status</th><th>Next due</th></tr>
              </thead>
              <tbody>
                {client.services.map((service) => (
                  <tr key={service.id}>
                    <td><a href={`/admin/services/${service.id}`}>{service.product.name}</a></td>
                    <td>{service.domainRecords?.[0]?.domain ?? "—"}</td>
                    <td><StatusPill label={serviceStatusLabel(service.status)} tone={service.status === "ACTIVE" ? "good" : "warn"} /></td>
                    <td>{dateLabel(service.renewsAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : <p style={{ padding: "16px", color: "var(--muted)", fontSize: "0.9rem" }}>No services yet.</p>}
        </Panel>

        <Panel
          title="Invoices"
          actions={
            <div style={{ display: "flex", gap: 8 }}>
              {client.invoices?.length ? <StatusPill label={`${client.invoices.length}`} tone="neutral" /> : null}
            </div>
          }
        >
          {client.invoices?.length ? (
            <table className="table">
              <thead>
                <tr><th>Invoice</th><th>Status</th><th>Due</th><th>Total</th></tr>
              </thead>
              <tbody>
                {client.invoices.map((invoice) => (
                  <tr key={invoice.id}>
                    <td><a href={`/admin/invoices/${invoice.id}`}>{invoiceDisplayNumber(invoice)}</a></td>
                    <td><StatusPill label={invoiceStatusLabel(invoice.status)} tone={invoice.status === "PAID" ? "good" : "warn"} /></td>
                    <td>{dateLabel(invoice.dueAt)}</td>
                    <td>{money(invoice.totalCents, invoice.currency, locale)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : <p style={{ padding: "16px", color: "var(--muted)", fontSize: "0.9rem" }}>No invoices yet.</p>}
        </Panel>

        <Panel
          title="Orders"
          actions={client.orders?.length ? <StatusPill label={`${client.orders.length}`} tone="neutral" /> : null}
        >
          {client.orders?.length ? (
            <table className="table">
              <thead>
                <tr><th>Order</th><th>Status</th><th>Items</th><th>Total</th></tr>
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
          ) : <p style={{ padding: "16px", color: "var(--muted)", fontSize: "0.9rem" }}>No orders yet.</p>}
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
