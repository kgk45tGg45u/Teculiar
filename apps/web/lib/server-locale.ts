import { cookies, headers } from "next/headers";
import { LOCALE_COOKIE, getLocale, localeFromAcceptLanguage, type Locale } from "./i18n";

export async function requestLocale(): Promise<Locale> {
  const cookieStore = await cookies();
  const saved = cookieStore.get(LOCALE_COOKIE)?.value;
  if (saved) {
    return getLocale(saved);
  }
  const headerStore = await headers();
  return localeFromAcceptLanguage(headerStore.get("accept-language"));
}
