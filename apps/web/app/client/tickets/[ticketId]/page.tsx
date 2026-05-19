import { ClientDashboard } from "../../../../components/portal/client-dashboard";

export default async function ClientTicketPage({ params }: { params: Promise<{ ticketId: string }> }) {
  const { ticketId } = await params;
  return <ClientDashboard ticketId={ticketId} view="tickets" />;
}
