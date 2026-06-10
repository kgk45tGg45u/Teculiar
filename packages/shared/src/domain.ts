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
