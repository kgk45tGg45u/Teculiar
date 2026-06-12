import { cycleLabel, money, serviceUnitPriceCents, type ApiService, type AuthUser } from "../../../../lib/api";
import { requestLocale } from "../../../../lib/server-locale";
import { serviceStatusLabel } from "../../../../lib/status-labels";
import { apiGetAuth, redirectToAdminLogin } from "../../../../lib/server-api";
import { AdminServiceDueDateForm, AdminServiceStatusForm } from "../../../../components/admin/admin-forms";
import { AdminSidebar } from "../../../../components/admin/admin-sidebar";
import styles from "../../../../components/admin/admin-dashboard.module.css";
import { StatusPill } from "../../../../components/ui/status-pill";

export default async function AdminServicePage({ params }: { params: Promise<{ serviceId: string }> }) {
  const user = await apiGetAuth<AuthUser>("/users/me");
  if (!user?.roles.some((role) => role === "admin" || role === "staff")) {
    await redirectToAdminLogin();
  }
  const { serviceId } = await params;
  const [service, settings, locale] = await Promise.all([
    apiGetAuth<ApiService>(`/services/${serviceId}`),
    apiGetAuth<{ siteLogoUrl?: string }>("/admin/dev/billing/settings").then((r) => r ?? {}),
    requestLocale()
  ]);
  if (!service) {
    return (
      <div className={styles.page}>
        <AdminSidebar brandLogo={(settings as { siteLogoUrl?: string }).siteLogoUrl} />
        <main className={styles.main}><h1>Service</h1><p>Not found.</p></main>
      </div>
    );
  }
  const domain = service.domainRecords?.[0]?.domain ?? stringValue(service.configuration?.domainName);

  return (
    <div className={styles.page}>
      <AdminSidebar brandLogo={(settings as { siteLogoUrl?: string }).siteLogoUrl} />
      <main className={styles.main}>
        <header className={styles.header}>
          <div>
            <span className="eyebrow"><a href="/admin/services">← Services</a></span>
            <h1>{domain ? `${service.product.name} — ${domain}` : service.product.name}</h1>
          </div>
          <StatusPill label={serviceStatusLabel(service.status)} tone={service.status === "ACTIVE" ? "good" : "warn"} />
        </header>

        <section className={styles.panel}>
          <div className={styles.panelHeader}>
            <h2>Details</h2>
            <AdminServiceStatusForm serviceId={service.id} status={service.status} />
          </div>
          <table className="table"><tbody>
            <tr><th>ID</th><td>{service.id}</td></tr>
            <tr><th>Product</th><td>{service.product.name}</td></tr>
            <tr><th>Type</th><td>{serviceType(service.product.type)}</td></tr>
            <tr><th>Domain</th><td>{domain ?? "—"}</td></tr>
            <tr><th>Billing</th><td>{cycleLabel(service.productPrice.billingCycle, locale)} / {money(serviceUnitPriceCents(service), service.productPrice.currency, locale)}</td></tr>
            <tr><th>Next due</th><td>{dateLabel(service.renewsAt)}</td></tr>
            <tr><th>Provider ref</th><td>{service.externalId ?? "—"}</td></tr>
          </tbody></table>
        </section>

        <section className={styles.panel}>
          <div className={styles.panelHeader}><h2>Change Due Date</h2></div>
          <div style={{ padding: "16px" }}>
            <AdminServiceDueDateForm renewsAt={service.renewsAt} serviceId={service.id} />
          </div>
        </section>

        {(service.domainRecords ?? []).length > 0 ? (
          <section className={styles.panel}>
            <div className={styles.panelHeader}><h2>Domains</h2></div>
            <table className="table">
              <thead><tr><th>Domain</th><th>Status</th><th>Provider ref</th></tr></thead>
              <tbody>{service.domainRecords!.map((record) => (
                <tr key={record.id ?? record.domain}>
                  <td>{record.domain}</td>
                  <td>{serviceStatusLabel(record.status)}</td>
                  <td>{record.externalId ?? "—"}</td>
                </tr>
              ))}</tbody>
            </table>
          </section>
        ) : null}
      </main>
    </div>
  );
}

function dateLabel(value?: string | null) {
  return value ? new Intl.DateTimeFormat("de-DE", { dateStyle: "medium" }).format(new Date(value)) : "—";
}

function serviceType(type: string) {
  if (type === "DOMAIN") return "Domain";
  if (type === "SHARED_HOSTING") return "Shared hosting";
  return type.replaceAll("_", " ").toLowerCase();
}

function stringValue(value: unknown) {
  return typeof value === "string" && value ? value : undefined;
}
