export type Locale = "de" | "en";

export const locales: Locale[] = ["de", "en"];
export const LOCALE_COOKIE = "dezhost_locale";

export const localeNames: Record<Locale, string> = {
  de: "Deutsch",
  en: "English"
};

export function getLocale(value?: string | null): Locale {
  return value === "en" ? "en" : "de";
}

export function browserLocale(value?: string | null): Locale {
  return value?.toLowerCase().startsWith("en") ? "en" : "de";
}

export function localeFromAcceptLanguage(value?: string | null): Locale {
  const first = value?.split(",").map((part) => part.trim()).filter(Boolean)[0];
  return browserLocale(first);
}

export const dictionary = {
  de: {
    nav: {
      hosting: "Webhosting",
      vps: "IT-Lösungen",
      domains: "Domains",
      pricing: "Preisliste",
      blog: "Blog",
      contact: "Kontakt",
      about: "Über uns",
      webdesign: "Webdesign",
      client: "Mein Konto"
    },
    cta: "Kostenlos beraten lassen"
  },
  en: {
    nav: {
      hosting: "Web Hosting",
      vps: "IT Solutions",
      domains: "Domains",
      pricing: "Pricing",
      blog: "Blog",
      contact: "Contact",
      about: "About",
      webdesign: "Web Design",
      client: "My Account"
    },
    cta: "Get free consultation"
  }
} as const;
