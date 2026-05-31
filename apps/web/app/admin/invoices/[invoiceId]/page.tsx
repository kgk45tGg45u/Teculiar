import { redirect } from "next/navigation";
import { cycleLabel, formatCustomerNumber, frozenMoney, invoiceDisplayNumber, money, type ApiInvoice, type AuthUser } from "../../../../lib/api";
import { requestLocale } from "../../../../lib/server-locale";
import { dictionary } from "../../../../lib/i18n";
import { invoiceStatusLabel } from "../../../../lib/status-labels";
import { apiGetAuth } from "../../../../lib/server-api";
import { AdminInvoiceActions, AdminPdfDownloadButton } from "../../../../components/admin/admin-forms";
import { AdminSidebar } from "../../../../components/admin/admin-sidebar";
import styles from "../../../../components/portal/client-dashboard.module.css";
import adminStyles from "../../../../components/admin/admin-dashboard.module.css";
import { StatusPill } from "../../../../components/ui/status-pill";

export default async function AdminInvoicePage({ params }: { params: Promise<{ invoiceId: string }> }) {
  const user = await apiGetAuth<AuthUser>("/users/me");
  if (!user?.roles.some((role) => role === "admin" || role === "staff")) {
    redirect("/admin/login" as never);
  }
  const { invoiceId } = await params;
  const [invoice, settings, locale] = await Promise.all([
    apiGetAuth<ApiInvoice>(`/billing/invoices/${invoiceId}`),
    apiGetAuth<{ siteLogoUrl?: string }>("/admin/dev/billing/settings").then((r) => r ?? {}),
    requestLocale()
  ]);

  if (!invoice) {
    return (
      <div className={adminStyles.page}>
        <AdminSidebar brandLogo={(settings as { siteLogoUrl?: string }).siteLogoUrl} />
        <main className={adminStyles.main}><h1>Invoice</h1><p>Not found.</p></main>
      </div>
    );
  }

  const copy = dictionary[locale].client;
  const customer = invoice.customerSnapshot ?? {};
  const address = customer.address ?? {};
  const seller = invoice.sellerSnapshot ?? {};
  const showVat = (invoice.taxAmountCents ?? 0) > 0;

  // Paid invoices: display the frozen amount in stored currency; unpaid: use admin locale
  const fmt = (cents: number) => invoice.status === "PAID"
    ? frozenMoney(cents, invoice.currency, locale)
    : money(cents, invoice.currency, locale);

  function itemPeriod(item: NonNullable<ApiInvoice["items"]>[number]) {
    if (item.servicePeriodStart || item.servicePeriodEnd) {
      const d = (v?: string | null) => v ? new Intl.DateTimeFormat(locale === "en" ? "en-US" : "de-DE", { dateStyle: "medium" }).format(new Date(v)) : "";
      return [d(item.servicePeriodStart), d(item.servicePeriodEnd)].filter(Boolean).join(" – ");
    }
    return item.billingCycle ? cycleLabel(item.billingCycle, locale) : "—";
  }

  return (
    <div className={adminStyles.page}>
      <AdminSidebar brandLogo={(settings as { siteLogoUrl?: string }).siteLogoUrl} />
      <main className={adminStyles.main}>
        <header className={adminStyles.header}>
          <div>
            <span className="eyebrow"><a href="/admin/invoices">← Invoices</a></span>
            <h1>{copy.invoiceTitle} {invoiceDisplayNumber(invoice)}</h1>
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <AdminPdfDownloadButton invoiceId={invoice.id} invoiceNumber={invoiceDisplayNumber(invoice)} />
          </div>
        </header>

        <div style={{ display: "grid", gap: 16 }}>
          {/* Admin actions */}
          <section className={adminStyles.panel}>
            <div className={adminStyles.panelHeader}><h2>Admin Actions</h2></div>
            <AdminInvoiceActions invoice={invoice} />
          </section>

          {/* Invoice sheet */}
          <section className={adminStyles.panel} style={{ overflow: "visible" }}>
            <div className={styles.invoicePaper} style={{ padding: "24px" }}>
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
                  <div>
                    <span className="eyebrow">{copy.invoiceTitle}</span>
                    <h2>{copy.invoiceTitle} {invoiceDisplayNumber(invoice)}</h2>
                  </div>
                  <StatusPill label={invoiceStatusLabel(invoice.status, locale)} tone={invoice.status === "PAID" ? "good" : invoice.status === "REFUNDED" ? "neutral" : "warn"} />
                </div>

                <div className={styles.invoiceMetaGrid}>
                  <div className={styles.invoiceMetaGroup}>
                    <span>{copy.invoiceDate}</span><strong>{dateLabel(invoice.issuedAt, locale)}</strong>
                    {invoice.status === "PAID" ? <><span>{copy.invoicePaidDate}</span><strong>{dateLabel(invoice.paidAt, locale)}</strong></> : null}
                    <span>{copy.customerNumber}</span><strong>{formatCustomerNumber(customer.customerNumber ?? invoice.user?.customerNumber)}</strong>
                  </div>
                  <div className={styles.invoiceMetaGroup}>
                    <span>{copy.invoiceDueDate}</span><strong>{dateLabel(invoice.dueAt, locale)}</strong>
                    {invoice.status === "PAID" ? <><span>{copy.invoicePaymentMethod}</span><strong>{paymentGateway(invoice)}</strong></> : null}
                    <span>E-Mail</span><strong>{customer.email}</strong>
                  </div>
                </div>

                <p className={styles.invoiceIntro}>{copy.invoiceIntro}</p>

                <table className="table">
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
                        <td>{itemPeriod(item)}</td>
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
            </div>
          </section>
        </div>
      </main>
    </div>
  );
}

function dateLabel(value?: string | null, locale = "de") {
  return value ? new Intl.DateTimeFormat(locale === "en" ? "en-US" : "de-DE", { dateStyle: "medium" }).format(new Date(value)) : "—";
}

function paymentGateway(invoice: ApiInvoice) {
  const tx = invoice.transactions?.find((t) => t.status === "SUCCEEDED");
  return tx?.method ?? "manual";
}
