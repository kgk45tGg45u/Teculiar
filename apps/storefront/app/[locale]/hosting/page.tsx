import { redirect } from "next/navigation";

export default async function HostingRedirect({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  redirect(`/${locale}/webhosting` as never);
}
