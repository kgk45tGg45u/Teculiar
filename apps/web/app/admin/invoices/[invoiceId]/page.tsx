import { redirect } from "next/navigation";
import { API_BASE_URL, cycleLabel, formatCustomerNumber, invoiceDisplayNumber, money, type ApiInvoice, type AuthUser } from "../../../../lib/api";
import { invoiceStatusLabel } from "../../../../lib/status-labels";
import { apiGetAuth } from "../../../../lib/server-api";
import { AdminInvoiceActions } from "../../../../components/admin/admin-forms";
import { LogoutButton } from "../../../../components/auth/logout-button";
import styles from "../../../../components/portal/client-dashboard.module.css";
import { StatusPill } from "../../../../components/ui/status-pill";

export default async function AdminInvoicePage({ params }: { params: Promise<{ invoiceId: string }> }) {
  const user = await apiGetAuth<AuthUser>("/users/me");
  if (!user?.roles.some((role) => role === "admin" || role === "staff")) {
    redirect("/admin/login" as never);
  }
  const { invoiceId } = await params;
  const invoice = await apiGetAuth<ApiInvoice>(`/billing/invoices/${invoiceId}`);
  if (!invoice) {
    return <main className="container"><h1>Invoice</h1><p>Not found.</p></main>;
  }
  const customer = invoice.customerSnapshot ?? {};
  const address = customer.address ?? {};
  const showVat = (invoice.taxAmountCents ?? 0) > 0;

  return (
    <main className="container">
      <div className="inlineForm"><a href="/admin/invoices">Back to invoices</a><LogoutButton scope="admin" redirectTo="/admin/login" /></div>
      <section className={styles.invoice}>
        <div className={styles.invoiceTop}>
          <div><span className="eyebrow">Dezhost</span><h1>Rechnung {invoiceDisplayNumber(invoice)}</h1></div>
          <StatusPill label={invoiceStatusLabel(invoice.status)} tone={invoice.status === "PAID" ? "good" : invoice.status === "REFUNDED" ? "neutral" : "warn"} />
        </div>
        <div className={styles.invoiceMeta}>
          <div><strong>{customer.companyName || customer.name}</strong><br />{address.line1}<br />{address.postalCode} {address.city}<br />{customer.countryCode}</div>
          <div>Rechnungsdatum: {dateLabel(invoice.issuedAt)}<br />Fällig: {dateLabel(invoice.dueAt)}<br />Kundennummer: {formatCustomerNumber(customer.customerNumber ?? invoice.user?.customerNumber)}<br />{invoice.status === "PAID" ? <>Bezahlt: {dateLabel(invoice.paidAt)}<br />Gateway: {paymentGateway(invoice)}<br /></> : null}E-Mail: {customer.email}</div>
        </div>
        <table className="table">
          <thead><tr><th>Beschreibung</th><th>Cycle</th><th>Menge</th><th>Einzelpreis</th><th>Summe</th></tr></thead>
          <tbody>{(invoice.items ?? []).map((item) => (
            <tr key={item.description}>
              <td>{item.description}</td>
              <td>{item.billingCycle ? cycleLabel(item.billingCycle) : "-"}</td>
              <td>{item.quantity}</td>
              <td>{money(item.unitAmountCents, invoice.currency)}</td>
              <td>{money(item.totalCents, invoice.currency)}</td>
            </tr>
          ))}</tbody>
        </table>
        <div className={styles.invoiceTotals}>
          <span>Zwischensumme {money(invoice.subtotalCents ?? invoice.totalCents, invoice.currency)}</span>
          {showVat ? <span>USt. {money(invoice.taxAmountCents ?? 0, invoice.currency)}</span> : null}
          <strong>Gesamt {money(invoice.totalCents, invoice.currency)}</strong>
        </div>
        <AdminInvoiceActions invoice={invoice} />
        <p><a href={`${API_BASE_URL}/billing/invoices/${invoice.id}/pdf`}>PDF preview/download</a></p>
        <footer className={styles.invoiceFooter}>{(invoice.footerLines ?? []).map((line) => <span key={line}>{line}</span>)}</footer>
      </section>
    </main>
  );
}

function dateLabel(value?: string | null) {
  return value ? new Intl.DateTimeFormat("de-DE", { dateStyle: "medium" }).format(new Date(value)) : "-";
}

function paymentGateway(invoice: ApiInvoice) {
  return invoice.transactions?.find((transaction) => transaction.status === "SUCCEEDED")?.method ?? "manual";
}
