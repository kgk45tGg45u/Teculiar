import { redirect } from "next/navigation";
import { cycleLabel, money, type ApiService, type AuthUser } from "../../../../lib/api";
import { serviceStatusLabel } from "../../../../lib/status-labels";
import { apiGetAuth } from "../../../../lib/server-api";
import { AdminServiceStatusForm } from "../../../../components/admin/admin-forms";
import { LogoutButton } from "../../../../components/auth/logout-button";
import styles from "../../../../components/admin/admin-dashboard.module.css";
import { StatusPill } from "../../../../components/ui/status-pill";

export default async function AdminServicePage({ params }: { params: Promise<{ serviceId: string }> }) {
  const user = await apiGetAuth<AuthUser>("/users/me");
  if (!user?.roles.some((role) => role === "admin" || role === "staff")) {
    redirect("/admin/login" as never);
  }
  const { serviceId } = await params;
  const service = await apiGetAuth<ApiService>(`/services/${serviceId}`);
  if (!service) {
    return <main className="container"><h1>Service</h1><p>Not found.</p></main>;
  }
  const domain = service.domainRecords?.[0]?.domain ?? stringValue(service.configuration?.domainName);

  return (
    <main className="container">
      <div className={styles.headerActions}><a href="/admin/services">Back to services</a><LogoutButton scope="admin" redirectTo="/admin/login" /></div>
      <h1>{service.product.name}</h1>
      <StatusPill label={serviceStatusLabel(service.status)} tone={service.status === "ACTIVE" ? "good" : "warn"} />
      <section className={styles.panel}>
        <div className={styles.panelHeader}>
          <div>
            <span className="eyebrow">Service</span>
            <h2>{domain ? `${service.product.name} - ${domain}` : service.product.name}</h2>
          </div>
          <AdminServiceStatusForm serviceId={service.id} status={service.status} />
        </div>
        <table className="table">
          <tbody>
            <tr><th>ID</th><td>{service.id}</td></tr>
            <tr><th>Product</th><td>{service.product.name}</td></tr>
            <tr><th>Type</th><td>{serviceType(service.product.type)}</td></tr>
            <tr><th>Domain</th><td>{domain ?? "-"}</td></tr>
            <tr><th>Billing</th><td>{cycleLabel(service.productPrice.billingCycle)} / {money(service.productPrice.amountCents, service.productPrice.currency)}</td></tr>
            <tr><th>Next due</th><td>{dateLabel(service.renewsAt)}</td></tr>
            <tr><th>Provider ref</th><td>{service.externalId ?? "-"}</td></tr>
          </tbody>
        </table>
      </section>
      <section className={styles.panel}>
        <div className={styles.panelHeader}><h2>Domains</h2></div>
        <table className="table">
          <thead><tr><th>Domain</th><th>Status</th><th>Provider ref</th></tr></thead>
          <tbody>{(service.domainRecords ?? []).map((record) => (
            <tr key={record.id ?? record.domain}>
              <td>{record.domain}</td>
              <td>{serviceStatusLabel(record.status)}</td>
              <td>{record.externalId ?? "-"}</td>
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

function serviceType(type: string) {
  if (type === "DOMAIN") return "Domain";
  if (type === "SHARED_HOSTING") return "Shared hosting";
  return type.replaceAll("_", " ").toLowerCase();
}

function stringValue(value: unknown) {
  return typeof value === "string" && value ? value : undefined;
}
