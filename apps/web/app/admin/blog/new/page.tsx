import { AdminDashboard } from "../../../../components/admin/admin-dashboard";

export default async function AdminNewBlogPostPage({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const params = await searchParams;
  return <AdminDashboard view="blog-new" blogEditId={params.edit} />;
}
