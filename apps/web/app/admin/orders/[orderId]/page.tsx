import { cycleLabel, invoiceDisplayNumber, money, type ApiOrder, type AuthUser } from "@dezhost/web-core/lib/api";
import { orderStatusLabel, serviceStatusLabel } from "@dezhost/web-core/lib/status-labels";
import { requestLocale } from "@dezhost/web-core/lib/server-locale";
import { getDictionary } from "@dezhost/web-core/lib/dictionary";
import { apiGetAuth, redirectToAdminLogin } from "@dezhost/web-core/lib/server-api";
import { OrderStatusForm } from "../../../../components/admin/admin-forms";
import { AdminSidebar } from "../../../../components/admin/admin-sidebar";
import styles from "../../../../components/admin/admin-dashboard.module.css";
import { StatusPill } from "@dezhost/web-core/components/ui/status-pill";

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
    await redirectToAdminLogin();
  }
  const { orderId } = await params;
  const [order, settings, locale] = await Promise.all([
    apiGetAuth<AdminOrder>(`/orders/${orderId}`),
    apiGetAuth<{ siteLogoUrl?: string }>("/admin/dev/billing/settings").then((r) => r ?? {}),
    requestLocale()
  ]);
  const a = getDictionary(locale).admin;
  if (!order) {
    return (
      <div className={styles.page}>
        <AdminSidebar brandLogo={(settings as { siteLogoUrl?: string }).siteLogoUrl} />
        <main className={styles.main}><h1>{a.order}</h1><p>{a.detail.notFound}</p></main>
      </div>
    );
  }

  return (
    <div className={styles.page}>
      <AdminSidebar brandLogo={(settings as { siteLogoUrl?: string }).siteLogoUrl} />
      <main className={styles.main}>
        <header className={styles.header}>
          <div>
            <span className="eyebrow"><a href="/admin/orders">{a.detail.backOrders}</a></span>
            <h1>{a.order} {order.orderNumber}</h1>
          </div>
          <StatusPill label={orderStatusLabel(order.status, locale)} tone={order.status === "COMPLETE" ? "good" : order.status === "CANCELLED" ? "neutral" : "warn"} />
        </header>

        <section className={styles.panel}>
          <div className={styles.panelHeader}>
            <div>
              <span className="eyebrow">{a.eyebrow.orders}</span>
              <h2>{order.user?.email ?? a.detail.unknownClient}</h2>
            </div>
            <OrderStatusForm orderId={order.id} status={order.status} />
          </div>
          <table className="table">
            <tbody>
              <tr><th>{a.detail.id}</th><td>{order.id}</td></tr>
              <tr><th>{a.status}</th><td>{orderStatusLabel(order.status, locale)}</td></tr>
              <tr><th>{a.col.invoice}</th><td>{order.invoice ? <a href={`/admin/invoices/${order.invoice.id}`}>{invoiceDisplayNumber(order.invoice)}</a> : "-"}</td></tr>
              <tr><th>{a.total}</th><td>{money(order.totalCents, order.currency, locale)}</td></tr>
              <tr><th>{a.detail.created}</th><td>{dateLabel(order.createdAt)}</td></tr>
            </tbody>
          </table>
        </section>

        <section className={styles.panel}>
          <div className={styles.panelHeader}><h2>{a.col.items}</h2></div>
          <table className="table">
            <thead><tr><th>{a.detail.item}</th><th>{a.detail.domain}</th><th>{a.detail.cycle}</th><th>{a.status}</th><th>{a.col.service}</th><th>{a.total}</th></tr></thead>
            <tbody>{order.items.map((item) => (
              <tr key={item.id}>
                <td>{item.description}</td>
                <td>{item.domainName ?? "-"}</td>
                <td>{item.billingCycle ? cycleLabel(item.billingCycle, locale) : "-"}</td>
                <td>{serviceStatusLabel(item.provisioningStatus, locale)}</td>
                <td>{item.service ? <a href={`/admin/services/${item.service.id}`}>{item.service.product?.name ?? item.service.id}</a> : "-"}</td>
                <td>{money(item.totalCents ?? 0, order.currency, locale)}</td>
              </tr>
            ))}</tbody>
          </table>
        </section>
      </main>
    </div>
  );
}

function dateLabel(value?: string | null) {
  return value ? new Intl.DateTimeFormat("de-DE", { dateStyle: "medium" }).format(new Date(value)) : "-";
}
