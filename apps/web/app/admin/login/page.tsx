import { Suspense } from "react";
import { LoginForm } from "../../../components/auth/login-form";
import { requestLocale } from "../../../lib/server-locale";

export default async function AdminLoginPage() {
  const locale = await requestLocale();
  return (
    <Suspense>
      <LoginForm admin locale={locale} />
    </Suspense>
  );
}
