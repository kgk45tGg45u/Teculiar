import { Suspense } from "react";
import { LoginForm } from "../../components/auth/login-form";
import { requestLocale } from "@teculiar/web-core/lib/server-locale";
import { requestSurface } from "@teculiar/web-core/lib/server-api";

export default async function LoginPage() {
  const locale = await requestLocale();
  return (
    <Suspense>
      <LoginForm locale={locale} surface={await requestSurface()} />
    </Suspense>
  );
}
