export type Locale = "de" | "en";

export const locales: Locale[] = ["de", "en"];

export const localeNames: Record<Locale, string> = {
  de: "Deutsch",
  en: "English"
};

export function getLocale(value: string): Locale {
  return value === "en" ? "en" : "de";
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
