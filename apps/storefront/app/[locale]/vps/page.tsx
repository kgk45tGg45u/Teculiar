import { redirect } from "next/navigation";

export default async function VpsRedirect({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  redirect(`/${locale}/it-losungen` as never);
}
