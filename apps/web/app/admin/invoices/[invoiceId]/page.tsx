import { redirect } from "next/navigation";
import { API_BASE_URL, cycleLabel, money, type ApiInvoice, type AuthUser } from "../../../../lib/api";
import { invoiceStatusLabel } from "../../../../lib/status-labels";
import { apiGetAuth } from "../../../../lib/server-api";
import { AdminInvoiceActions } from "../../../../components/admin/admin-forms";
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

  return (
    <main className="container">
      <a href="/admin/invoices">Back to invoices</a>
      <h1>Invoice {invoice.invoiceNumber}</h1>
      <StatusPill label={invoiceStatusLabel(invoice.status)} tone={invoice.status === "PAID" ? "good" : "warn"} />
      <p>Issued {dateLabel(invoice.issuedAt)} / Due {dateLabel(invoice.dueAt)}{invoice.status === "PAID" ? ` / Paid ${dateLabel(invoice.paidAt)} / Gateway ${paymentGateway(invoice)}` : ""}</p>
      <table className="table">
        <thead><tr><th>Description</th><th>Cycle</th><th>Qty</th><th>Unit</th><th>VAT</th><th>Total</th></tr></thead>
        <tbody>{(invoice.items ?? []).map((item) => (
          <tr key={item.description}>
            <td>{item.description}</td>
            <td>{item.billingCycle ? cycleLabel(item.billingCycle) : "-"}</td>
            <td>{item.quantity}</td>
            <td>{money(item.unitAmountCents, invoice.currency)}</td>
            <td>{money(item.taxAmountCents, invoice.currency)}</td>
            <td>{money(item.totalCents, invoice.currency)}</td>
          </tr>
        ))}</tbody>
      </table>
      <p><strong>Total:</strong> {money(invoice.totalCents, invoice.currency)}</p>
      <AdminInvoiceActions invoice={invoice} />
      <p><a href={`${API_BASE_URL}/billing/invoices/${invoice.id}/pdf`}>PDF preview/download</a></p>
    </main>
  );
}

function dateLabel(value?: string | null) {
  return value ? new Intl.DateTimeFormat("de-DE", { dateStyle: "medium" }).format(new Date(value)) : "-";
}

function paymentGateway(invoice: ApiInvoice) {
  return invoice.transactions?.find((transaction) => transaction.status === "SUCCEEDED")?.method ?? "manual";
}
