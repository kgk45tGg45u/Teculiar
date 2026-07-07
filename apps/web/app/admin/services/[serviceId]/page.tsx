import { cycleLabel, isAdminRole, money, serviceUnitPriceCents, type ApiService, type AuthUser } from "@dezhost/web-core/lib/api";
import { requestLocale } from "@dezhost/web-core/lib/server-locale";
import { getDictionary } from "@dezhost/web-core/lib/dictionary";
import { serviceStatusLabel } from "@dezhost/web-core/lib/status-labels";
import { apiGetAuth, redirectToAdminLogin } from "@dezhost/web-core/lib/server-api";
import { AdminServiceDueDateForm, AdminServiceStatusForm } from "../../../../components/admin/admin-forms";
import { AdminSidebar } from "../../../../components/admin/admin-sidebar";
import styles from "../../../../components/admin/admin-dashboard.module.css";
import { StatusPill } from "@dezhost/web-core/components/ui/status-pill";

export default async function AdminServicePage({ params }: { params: Promise<{ serviceId: string }> }) {
  const user = await apiGetAuth<AuthUser>("/users/me");
  if (!isAdminRole(user?.roles)) {
    await redirectToAdminLogin();
  }
  const { serviceId } = await params;
  const [service, settings, locale] = await Promise.all([
    apiGetAuth<ApiService>(`/services/${serviceId}`),
    apiGetAuth<{ siteLogoUrl?: string }>("/admin/dev/billing/settings").then((r) => r ?? {}),
    requestLocale()
  ]);
  const a = getDictionary(locale).admin;
  if (!service) {
    return (
      <div className={styles.page}>
        <AdminSidebar brandLogo={(settings as { siteLogoUrl?: string }).siteLogoUrl} />
        <main className={styles.main}><h1>{a.col.service}</h1><p>{a.detail.notFound}</p></main>
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
            <span className="eyebrow"><a href="/admin/services">{a.detail.backServices}</a></span>
            <h1>{domain ? `${service.product.name} — ${domain}` : service.product.name}</h1>
          </div>
          <StatusPill label={serviceStatusLabel(service.status, locale)} tone={service.status === "ACTIVE" ? "good" : "warn"} />
        </header>

        <section className={styles.panel}>
          <div className={styles.panelHeader}>
            <h2>{a.detail.details}</h2>
            <AdminServiceStatusForm serviceId={service.id} status={service.status} />
          </div>
          <table className="table"><tbody>
            <tr><th>{a.detail.id}</th><td>{service.id}</td></tr>
            <tr><th>{a.detail.product}</th><td>{service.product.name}</td></tr>
            <tr><th>{a.detail.type}</th><td>{serviceType(service.product.type, a)}</td></tr>
            <tr><th>{a.detail.domain}</th><td>{domain ?? "—"}</td></tr>
            <tr><th>{a.detail.billing}</th><td>{cycleLabel(service.productPrice.billingCycle, locale)} / {money(serviceUnitPriceCents(service), service.productPrice.currency, locale)}</td></tr>
            <tr><th>{a.detail.nextDue}</th><td>{dateLabel(service.renewsAt)}</td></tr>
            <tr><th>{a.detail.providerRef}</th><td>{service.externalId ?? "—"}</td></tr>
          </tbody></table>
        </section>

        <section className={styles.panel}>
          <div className={styles.panelHeader}><h2>{a.detail.changeDueDate}</h2></div>
          <div style={{ padding: "16px" }}>
            <AdminServiceDueDateForm renewsAt={service.renewsAt} serviceId={service.id} />
          </div>
        </section>

        {(service.domainRecords ?? []).length > 0 ? (
          <section className={styles.panel}>
            <div className={styles.panelHeader}><h2>{a.eyebrow.domains}</h2></div>
            <table className="table">
              <thead><tr><th>{a.detail.domain}</th><th>{a.status}</th><th>{a.detail.providerRef}</th></tr></thead>
              <tbody>{service.domainRecords!.map((record) => (
                <tr key={record.id ?? record.domain}>
                  <td>{record.domain}</td>
                  <td>{serviceStatusLabel(record.status, locale)}</td>
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

function serviceType(type: string, a: ReturnType<typeof getDictionary>["admin"]) {
  if (type === "DOMAIN") return a.detail.typeDomain;
  if (type === "SHARED_HOSTING") return a.detail.typeSharedHosting;
  return type.replaceAll("_", " ").toLowerCase();
}

function stringValue(value: unknown) {
  return typeof value === "string" && value ? value : undefined;
}
