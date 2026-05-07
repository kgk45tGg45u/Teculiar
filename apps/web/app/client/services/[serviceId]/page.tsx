import { ClientDashboard } from "../../../../components/portal/client-dashboard";

export default async function ServicePage({ params }: { params: Promise<{ serviceId: string }> }) {
  const { serviceId } = await params;
  return <ClientDashboard serviceId={serviceId} view="services" />;
}
