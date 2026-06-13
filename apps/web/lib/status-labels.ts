import type { Locale } from "./i18n";

export function orderStatusLabel(status: string, locale: Locale = "en") {
  const de = locale === "de";
  if (status === "COMPLETE") {
    return de ? "Abgeschlossen" : "Completed";
  }
  if (status === "CANCELLED") {
    return de ? "Storniert" : "Canceled";
  }
  if (["PENDING", "PROVISIONING"].includes(status)) {
    return de ? "Ausstehend" : "Pending";
  }
  return humanStatus(status, locale);
}

export function serviceStatusLabel(status: string, locale: Locale = "en") {
  const de = locale === "de";
  if (status === "ACTIVE") {
    return de ? "Aktiv" : "Active";
  }
  if (["PENDING", "PROVISIONING"].includes(status)) {
    return de ? "Ausstehend" : "Pending";
  }
  return humanStatus(status, locale);
}

// Invoices only surface "Pending" (awaiting payment) and "Overdue". Paid invoices are the normal
// case and show no badge at all (callers skip rendering for PAID). CANCELLED/REFUNDED/FAILED keep
// their own label for the rare cases they occur.
export function invoiceStatusLabel(status: string, locale: Locale = "en") {
  const labels: Record<string, Record<Locale, string>> = {
    PENDING: { de: "Ausstehend", en: "Pending" },
    OVERDUE: { de: "Überfällig", en: "Overdue" },
    PAID: { de: "Bezahlt", en: "Paid" },
    FAILED: { de: "Fehlgeschlagen", en: "Failed" },
    CANCELLED: { de: "Storniert", en: "Canceled" },
    REFUNDED: { de: "Erstattet", en: "Refunded" }
  };
  return labels[status]?.[locale] ?? humanStatus(status, locale);
}

// Whether an invoice status should render a visible badge. Paid invoices (the normal, final state)
// intentionally show nothing.
export function invoiceStatusVisible(status: string) {
  return status !== "PAID";
}

// Friendly, localized ticket status names (OPEN / ANSWERED / CUSTOMER_REPLY / CLOSED)
// so clients and admins never see ALL_CAPS_WITH_UNDERSCORES.
export const TICKET_STATUS_VALUES = ["OPEN", "ANSWERED", "CUSTOMER_REPLY", "CLOSED"] as const;

export function ticketStatusLabel(status: string, locale: Locale = "en") {
  const labels: Record<string, Record<Locale, string>> = {
    OPEN: { de: "Offen", en: "Open" },
    ANSWERED: { de: "Beantwortet", en: "Answered" },
    CUSTOMER_REPLY: { de: "Kundenantwort", en: "Customer reply" },
    CLOSED: { de: "Geschlossen", en: "Closed" }
  };
  return labels[status]?.[locale] ?? humanStatus(status, locale);
}

export function ticketStatusTone(status: string): "good" | "warn" | "neutral" {
  if (status === "ANSWERED") {
    return "good";
  }
  if (status === "CLOSED") {
    return "neutral";
  }
  return "warn"; // OPEN, CUSTOMER_REPLY — needs attention
}

function humanStatus(status: string, locale: Locale) {
  const value = status.toLowerCase().replaceAll("_", " ");
  return locale === "de" ? value : value.replace(/^\w/, (char) => char.toUpperCase());
}
