import { cookies, headers } from "next/headers";
import { ADMIN_LOCALE_COOKIE, LOCALE_COOKIE, getLocale, localeFromAcceptLanguage, type Locale } from "./i18n";

export async function requestLocale(): Promise<Locale> {
  const headerStore = await headers();
  // The admin panel reads its own locale cookie so it never shares language with the client scope.
  const onAdmin = (headerStore.get("x-pathname") ?? "").startsWith("/admin");
  const cookieStore = await cookies();
  const saved = cookieStore.get(onAdmin ? ADMIN_LOCALE_COOKIE : LOCALE_COOKIE)?.value;
  if (saved) {
    return getLocale(saved);
  }
  return localeFromAcceptLanguage(headerStore.get("accept-language"));
}
