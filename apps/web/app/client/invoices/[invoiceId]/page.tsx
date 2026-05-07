import { ClientDashboard } from "../../../../components/portal/client-dashboard";

export default async function InvoicePage({ params }: { params: Promise<{ invoiceId: string }> }) {
  const { invoiceId } = await params;
  return <ClientDashboard invoiceId={invoiceId} view="invoices" />;
}
