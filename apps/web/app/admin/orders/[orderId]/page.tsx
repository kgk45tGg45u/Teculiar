import { redirect } from "next/navigation";
import { cycleLabel, money, type ApiOrder, type AuthUser } from "../../../../lib/api";
import { orderStatusLabel, serviceStatusLabel } from "../../../../lib/status-labels";
import { apiGetAuth } from "../../../../lib/server-api";
import { OrderStatusForm } from "../../../../components/admin/admin-forms";
import { LogoutButton } from "../../../../components/auth/logout-button";
import styles from "../../../../components/admin/admin-dashboard.module.css";
import { StatusPill } from "../../../../components/ui/status-pill";

type AdminOrderItem = ApiOrder["items"][number] & {
  billingCycle?: string | null;
  service?: { id: string; product?: { name: string } | null; status: string } | null;
  totalCents?: number | null;
};

type AdminOrder = Omit<ApiOrder, "items"> & {
  items: AdminOrderItem[];
};

export default async function AdminOrderPage({ params }: { params: Promise<{ orderId: string }> }) {
  const user = await apiGetAuth<AuthUser>("/users/me");
  if (!user?.roles.some((role) => role === "admin" || role === "staff")) {
    redirect("/admin/login" as never);
  }
  const { orderId } = await params;
  const order = await apiGetAuth<AdminOrder>(`/orders/${orderId}`);
  if (!order) {
    return <main className="container"><h1>Order</h1><p>Not found.</p></main>;
  }

  return (
    <main className="container">
      <div className={styles.headerActions}><a href="/admin/orders">Back to orders</a><LogoutButton scope="admin" redirectTo="/admin/login" /></div>
      <h1>Order {order.orderNumber}</h1>
      <StatusPill label={orderStatusLabel(order.status)} tone={order.status === "COMPLETE" ? "good" : order.status === "CANCELLED" ? "neutral" : "warn"} />
      <section className={styles.panel}>
        <div className={styles.panelHeader}>
          <div>
            <span className="eyebrow">Order</span>
            <h2>{order.user?.email ?? "Unknown client"}</h2>
          </div>
          <OrderStatusForm orderId={order.id} status={order.status} />
        </div>
        <table className="table">
          <tbody>
            <tr><th>ID</th><td>{order.id}</td></tr>
            <tr><th>Status</th><td>{orderStatusLabel(order.status)}</td></tr>
            <tr><th>Invoice</th><td>{order.invoice ? <a href={`/admin/invoices/${order.invoice.id}`}>{order.invoice.invoiceNumber}</a> : "-"}</td></tr>
            <tr><th>Total</th><td>{money(order.totalCents, order.currency)}</td></tr>
            <tr><th>Created</th><td>{dateLabel(order.createdAt)}</td></tr>
          </tbody>
        </table>
      </section>
      <section className={styles.panel}>
        <div className={styles.panelHeader}><h2>Items</h2></div>
        <table className="table">
          <thead><tr><th>Item</th><th>Domain</th><th>Cycle</th><th>Status</th><th>Service</th><th>Total</th></tr></thead>
          <tbody>{order.items.map((item) => (
            <tr key={item.id}>
              <td>{item.description}</td>
              <td>{item.domainName ?? "-"}</td>
              <td>{item.billingCycle ? cycleLabel(item.billingCycle) : "-"}</td>
              <td>{serviceStatusLabel(item.provisioningStatus)}</td>
              <td>{item.service ? <a href={`/admin/services/${item.service.id}`}>{item.service.product?.name ?? item.service.id}</a> : "-"}</td>
              <td>{money(item.totalCents ?? 0, order.currency)}</td>
            </tr>
          ))}</tbody>
        </table>
      </section>
    </main>
  );
}

function dateLabel(value?: string | null) {
  return value ? new Intl.DateTimeFormat("de-DE", { dateStyle: "medium" }).format(new Date(value)) : "-";
}
