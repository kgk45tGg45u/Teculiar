import { SignupForm } from "../../../components/auth/signup-form";
import { createChallenge } from "@dezhost/web-core/lib/bot-challenge";
import { countriesForLocale } from "@dezhost/web-core/lib/countries";
import { getLocale } from "@dezhost/web-core/lib/i18n";

export default async function SignupPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale: rawLocale } = await params;
  const locale = getLocale(rawLocale);
  // Both computed server-side: same values on server & client → zero hydration mismatch
  const countries = countriesForLocale(locale);
  const initialChallenge = createChallenge(locale);
  return <SignupForm countries={countries} initialChallenge={initialChallenge} locale={locale} />;
}
