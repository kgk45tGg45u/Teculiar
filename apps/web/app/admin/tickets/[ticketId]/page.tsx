import { AdminDashboard } from "../../../../components/admin/admin-dashboard";

export default async function AdminTicketPage({ params }: { params: Promise<{ ticketId: string }> }) {
  const { ticketId } = await params;
  return <AdminDashboard ticketId={ticketId} view="tickets" />;
}
