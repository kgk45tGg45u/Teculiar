export const billingCycles = [
  "ONE_TIME",
  "MONTHLY",
  "QUARTERLY",
  "SEMI_ANNUAL",
  "YEAR_1",
  "YEAR_2",
  "YEAR_3",
  "YEAR_4",
  "YEAR_5",
  "YEAR_6",
  "YEAR_7",
  "YEAR_8",
  "YEAR_9",
  "YEAR_10"
] as const;

export type BillingCycle = (typeof billingCycles)[number];

// A domain registration always bills on a yearly term — never monthly/quarterly. This maps the
// cycle an order item carries (the hosting cycle it was bundled with, or an explicitly chosen
// domain cycle) to a domain-appropriate yearly cycle: multi-year hosting (YEAR_2…) keeps its
// matching multi-year domain term, while anything shorter (monthly/quarterly/semi-annual/one-time)
// registers the domain annually (YEAR_1). Shared by the admin order form and the API so the UI
// preview and the priced/activated domain item always agree on the cadence.
export function domainCycleFor(cycle: string | null | undefined): BillingCycle {
  return isYearlyCycle(cycle) ? (cycle as BillingCycle) : "YEAR_1";
}

// True for YEAR_1…YEAR_10 (a recurring yearly domain cycle), false for MONTHLY/QUARTERLY/
// SEMI_ANNUAL/ONE_TIME. Used to guard that domains are only ever ordered on a yearly cadence.
export function isYearlyCycle(cycle: string | null | undefined): boolean {
  return /^YEAR_\d+$/.test(String(cycle ?? ""));
}

export const invoiceStatuses = [
  "PENDING",
  "PAID",
  "OVERDUE",
  "FAILED",
  "CANCELLED",
  "REFUNDED"
] as const;

export type InvoiceStatus = (typeof invoiceStatuses)[number];

export const orderStatuses = [
  "PENDING",
  "PROVISIONING",
  "COMPLETE",
  "FAILED",
  "CANCELLED"
] as const;

export type OrderStatus = (typeof orderStatuses)[number];

export const orderItemStatuses = ["PENDING", "PROVISIONING", "ACTIVE", "FAILED", "SKIPPED"] as const;

export type OrderItemStatus = (typeof orderItemStatuses)[number];

export const productTypes = [
  "SHARED_HOSTING",
  "DOMAIN",
  "VPS",
  "DEDICATED_SERVER",
  "NEXTCLOUD",
  "CRM_SERVER",
  "MANAGED_SERVICE",
  "SUPPORT_SUBSCRIPTION"
] as const;

export type ProductType = (typeof productTypes)[number];

// Whether a product can / must be ordered together with a domain registration.
// NECESSARY  – a domain is required (e.g. web hosting); same flow as before.
// OPTIONAL   – a domain can be added but may be skipped (e.g. virtual servers).
// NOT_NEEDED – no domain step at all (no whois search, no register/transfer).
export const domainRequirements = ["NECESSARY", "OPTIONAL", "NOT_NEEDED"] as const;

export type DomainRequirement = (typeof domainRequirements)[number];

export const serviceStatuses = [
  "PENDING",
  "PROVISIONING",
  "ACTIVE",
  "SUSPENDED",
  "CANCELLED",
  "TERMINATED",
  "FAILED",
  "PROVISIONING_FAILED"
] as const;

export type ServiceStatus = (typeof serviceStatuses)[number];

export type Money = {
  amountCents: number;
  currency: "EUR";
};

export type TaxContext = {
  sellerCountryCode: "DE";
  buyerCountryCode: string;
  buyerVatId?: string;
  isBusinessCustomer: boolean;
};

export type InvoiceLineInput = {
  billingCycle?: string;
  description: string;
  quantity: number;
  unitAmountCents: number;
  taxRate?: number;
  type?: string;
  orderItemId?: string;
  serviceId?: string;
  domainRecordId?: string;
  lifecycleAction?: string;
  metadata?: Record<string, unknown>;
  servicePeriodStart?: string;
  servicePeriodEnd?: string;
};
