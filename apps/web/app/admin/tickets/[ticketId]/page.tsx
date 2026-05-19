import { redirect } from "next/navigation";
import { AdminTicketThread } from "../../../../components/admin/admin-support";
import { type ApiKnowledgebaseArticle, type ApiTicket, type AuthUser } from "../../../../lib/api";
import { apiGetAuth } from "../../../../lib/server-api";

export default async function AdminTicketPage({ params }: { params: Promise<{ ticketId: string }> }) {
  const user = await apiGetAuth<AuthUser>("/users/me");
  if (!user?.roles.some((role) => role === "admin" || role === "staff")) {
    redirect("/admin/login" as never);
  }
  const { ticketId } = await params;
  const ticket = await apiGetAuth<ApiTicket>(`/tickets/${ticketId}`);
  const articles = (await apiGetAuth<ApiKnowledgebaseArticle[]>("/admin/dev/knowledgebase")) ?? [];
  if (!ticket) {
    return <main className="container"><h1>Ticket</h1><p>Not found.</p></main>;
  }

  return (
    <main className="container">
      <a href="/admin/tickets">Back to tickets</a>
      <AdminTicketThread articles={articles} initialTicket={ticket} />
    </main>
  );
}
