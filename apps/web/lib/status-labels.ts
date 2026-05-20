import type { Locale } from "./i18n";

export function orderStatusLabel(status: string, locale: Locale = "en") {
  const de = locale === "de";
  if (status === "COMPLETE") {
    return de ? "Abgeschlossen" : "Completed";
  }
  if (status === "CANCELLED") {
    return de ? "Storniert" : "Canceled";
  }
  if (["PENDING_PAYMENT", "PAID", "PROVISIONING"].includes(status)) {
    return de ? "Ausstehend" : "Pending";
  }
  return humanStatus(status, locale);
}

export function serviceStatusLabel(status: string, locale: Locale = "en") {
  const de = locale === "de";
  if (status === "ACTIVE") {
    return de ? "Aktiv" : "Active";
  }
  if (["ORDERED", "PENDING", "PROVISIONING"].includes(status)) {
    return de ? "Ausstehend" : "Pending";
  }
  return humanStatus(status, locale);
}

export function invoiceStatusLabel(status: string, locale: Locale = "en") {
  const labels: Record<string, Record<Locale, string>> = {
    PAID: { de: "Bezahlt", en: "Paid" },
    UNPAID: { de: "Unbezahlt", en: "Unpaid" },
    OVERDUE: { de: "Ueberfaellig", en: "Overdue" },
    FAILED: { de: "Fehlgeschlagen", en: "Failed" }
  };
  return labels[status]?.[locale] ?? humanStatus(status, locale);
}

function humanStatus(status: string, locale: Locale) {
  const value = status.toLowerCase().replaceAll("_", " ");
  return locale === "de" ? value : value.replace(/^\w/, (char) => char.toUpperCase());
}
