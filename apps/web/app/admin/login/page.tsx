import { Suspense } from "react";
import { LoginForm } from "../../../components/auth/login-form";
import { requestLocale } from "@dezhost/web-core/lib/server-locale";
import { requestSurface } from "@dezhost/web-core/lib/server-api";

export default async function AdminLoginPage() {
  const locale = await requestLocale();
  return (
    <Suspense>
      <LoginForm admin locale={locale} surface={await requestSurface()} />
    </Suspense>
  );
}
