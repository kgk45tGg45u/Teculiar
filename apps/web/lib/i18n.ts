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
      hosting: "Hosting",
      vps: "VPS",
      domains: "Domains",
      pricing: "Preise",
      blog: "Blog",
      contact: "Kontakt",
      client: "Portal"
    },
    cta: "Projekt starten"
  },
  en: {
    nav: {
      hosting: "Hosting",
      vps: "VPS",
      domains: "Domains",
      pricing: "Pricing",
      blog: "Blog",
      contact: "Contact",
      client: "Portal"
    },
    cta: "Start project"
  }
} as const;
