import { redirect } from "next/navigation";
import type { ReactNode } from "react";
import { money, type ApiClient, type ApiProduct, type AuthUser } from "../../../../lib/api";
import { apiGetAuth } from "../../../../lib/server-api";
import { ClientDetailModals } from "../../../../components/admin/admin-forms";
import { LogoutButton } from "../../../../components/auth/logout-button";
import styles from "../../../../components/admin/admin-dashboard.module.css";
import { StatusPill } from "../../../../components/ui/status-pill";

export default async function AdminClientPage({ params }: { params: Promise<{ clientId: string }> }) {
  const user = await apiGetAuth<AuthUser>("/users/me");
  if (!user?.roles.some((role) => role === "admin" || role === "staff")) {
    redirect("/admin/login" as never);
  }
  const { clientId } = await params;
  const client = await apiGetAuth<ApiClient>(`/users/${clientId}`);
  const products = (await apiGetAuth<ApiProduct[]>("/products")) ?? [];
  if (!client) {
    return <main className="container"><h1>Client</h1><p>Not found.</p></main>;
  }
  const paidRevenue = client.invoices?.filter((invoice) => invoice.status === "PAID").reduce((sum, invoice) => sum + invoice.totalCents, 0) ?? 0;

  return (
    <main className="container">
      <div className={styles.headerActions}><a href="/admin/clients">Back to clients</a><LogoutButton scope="admin" redirectTo="/admin/login" /></div>
      <h1>{client.name}</h1>
      <p>{client.email}</p>
      <ClientDetailModals client={client} products={products} />

      <section className="grid four">
        <div className="metric"><strong>{client.services?.filter((service) => service.status === "ACTIVE").length ?? 0}</strong><span>Active services</span></div>
        <div className="metric"><strong>{client.domainRecords?.length ?? 0}</strong><span>Domains</span></div>
        <div className="metric"><strong>{client.invoices?.filter((invoice) => invoice.status !== "PAID").length ?? 0}</strong><span>Unpaid invoices</span></div>
        <div className="metric"><strong>{money(paidRevenue)}</strong><span>Total revenue</span></div>
      </section>

      <Panel title="Client information">
        <table className="table"><tbody>
          <tr><th>Customer type</th><td>{client.customerType}</td></tr>
          <tr><th>Country</th><td>{client.countryCode}</td></tr>
          <tr><th>VAT ID</th><td>{client.vatId ?? "-"}</td></tr>
          <tr><th>Phone</th><td>{client.contacts?.[0]?.phone ?? "-"}</td></tr>
          <tr><th>Address</th><td>{addressLabel(client)}</td></tr>
        </tbody></table>
      </Panel>

      <Panel title="Services">
        <table className="table">
          <thead><tr><th>Service</th><th>Domain</th><th>Status</th><th>Next due</th></tr></thead>
          <tbody>{(client.services ?? []).map((service) => (
            <tr key={service.id}>
              <td><a href={`/admin/services/${service.id}`}>{service.product.name}</a></td>
              <td>{service.domainRecords?.[0]?.domain ?? "-"}</td>
              <td><StatusPill label={service.status.toLowerCase()} tone={service.status === "ACTIVE" ? "good" : "warn"} /></td>
              <td>{dateLabel(service.renewsAt)}</td>
            </tr>
          ))}</tbody>
        </table>
      </Panel>

      <Panel title="Invoices">
        <table className="table">
          <thead><tr><th>Invoice</th><th>Status</th><th>Due</th><th>Total</th></tr></thead>
          <tbody>{(client.invoices ?? []).map((invoice) => (
            <tr key={invoice.id}>
              <td><a href={`/admin/invoices/${invoice.id}`}>{invoice.invoiceNumber}</a></td>
              <td><StatusPill label={invoice.status.toLowerCase()} tone={invoice.status === "PAID" ? "good" : "warn"} /></td>
              <td>{dateLabel(invoice.dueAt)}</td>
              <td>{money(invoice.totalCents, invoice.currency)}</td>
            </tr>
          ))}</tbody>
        </table>
      </Panel>

      <Panel title="Orders">
        <table className="table">
          <thead><tr><th>Order</th><th>Status</th><th>Items</th><th>Total</th></tr></thead>
          <tbody>{(client.orders ?? []).map((order) => (
            <tr key={order.id}>
              <td>{order.orderNumber}</td>
              <td><StatusPill label={order.status.toLowerCase()} tone={order.status === "ACTIVE" ? "good" : "warn"} /></td>
              <td>{order.items?.map((item) => item.description).join(", ")}</td>
              <td>{money(order.totalCents, order.currency)}</td>
            </tr>
          ))}</tbody>
        </table>
      </Panel>
    </main>
  );
}

function Panel({ children, title }: { children: ReactNode; title: string }) {
  return <section className={styles.panel}><div className={styles.panelHeader}><h2>{title}</h2></div>{children}</section>;
}

function addressLabel(client: ApiClient) {
  const address = client.contacts?.[0]?.address;
  return [address?.line1, address?.postalCode, address?.city, address?.state].filter(Boolean).join(", ") || "-";
}

function dateLabel(value?: string | null) {
  return value ? new Intl.DateTimeFormat("de-DE", { dateStyle: "medium" }).format(new Date(value)) : "-";
}
