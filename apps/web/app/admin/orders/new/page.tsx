import { AdminDashboard } from "../../../../components/admin/admin-dashboard";

export default async function AdminNewOrderPage({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const params = await searchParams;
  return <AdminDashboard view="orders-new" preselectedClientId={params.clientId} />;
}
