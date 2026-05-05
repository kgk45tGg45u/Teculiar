export const billingCycles = [
  "MONTHLY",
  "QUARTERLY",
  "SEMI_ANNUAL",
  "YEAR_1",
  "YEAR_2",
  "YEAR_3",
  "YEAR_4"
] as const;

export type BillingCycle = (typeof billingCycles)[number];

export const invoiceStatuses = [
  "DRAFT",
  "UNSENT",
  "PENDING",
  "UNPAID",
  "PAID",
  "OVERDUE",
  "FAILED"
] as const;

export type InvoiceStatus = (typeof invoiceStatuses)[number];

export const orderStatuses = [
  "PENDING_PAYMENT",
  "PAID",
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

export const serviceStatuses = [
  "ORDERED",
  "PROVISIONING",
  "ACTIVE",
  "SUSPENDED",
  "PENDING_CANCEL",
  "CANCELLED",
  "TERMINATED",
  "FAILED"
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
  description: string;
  quantity: number;
  unitAmountCents: number;
  taxRate: number;
  servicePeriodStart?: string;
  servicePeriodEnd?: string;
};
