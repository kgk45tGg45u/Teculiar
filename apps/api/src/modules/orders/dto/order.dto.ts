import { IsArray, IsBoolean, IsEmail, IsIn, IsInt, IsObject, IsOptional, IsString, Min } from "class-validator";
import { billingCycles, productTypes } from "@teculiar/shared";

export class OrderItemDto {
  @IsString()
  productId: string;

  @IsOptional()
  @IsString()
  productPriceId?: string;

  @IsOptional()
  @IsString()
  domainName?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  quantity?: number;

  @IsOptional()
  @IsObject()
  configuration?: Record<string, unknown>;

  // Admin custom pricing: override the list price with an admin-entered amount (excl. VAT) and
  // billing cycle. `applyCustomToRenewals` (default true) also carries the custom amount onto the
  // service so Cron renewal invoices bill it; when false, only the first invoice uses it.
  @IsOptional()
  @IsInt()
  @Min(0)
  customAmountCents?: number;

  @IsOptional()
  @IsIn([...billingCycles])
  customBillingCycle?: string;

  @IsOptional()
  @IsBoolean()
  applyCustomToRenewals?: boolean;
}

export class OrderCustomerDto {
  @IsString()
  name: string;

  @IsEmail()
  email: string;

  @IsOptional()
  @IsString()
  password?: string;

  @IsOptional()
  @IsIn(["INDIVIDUAL", "BUSINESS"])
  customerType?: "INDIVIDUAL" | "BUSINESS";

  @IsOptional()
  @IsString()
  companyName?: string;

  @IsOptional()
  @IsString()
  countryCode?: string;

  @IsOptional()
  @IsString()
  vatId?: string;

  @IsOptional()
  @IsString()
  phone?: string;

  @IsOptional()
  @IsObject()
  address?: Record<string, unknown>;
}

export class PreviewOrderDto {
  @IsArray()
  items: OrderItemDto[];

  @IsOptional()
  @IsObject()
  customer?: OrderCustomerDto;
}

export class CheckoutOrderDto {
  @IsArray()
  items: OrderItemDto[];

  @IsObject()
  customer: OrderCustomerDto & { password: string };
}

export class AdminCreateOrderDto {
  @IsString()
  userId: string;

  @IsArray()
  items: OrderItemDto[];

  @IsOptional()
  @IsString()
  notes?: string;

  // Order-level discount (excl. VAT). "one-time" applies only to the first invoice; "recurring"
  // also carries onto the primary product's subscription so every renewal invoice keeps it.
  @IsOptional()
  @IsIn(["one-time", "recurring"])
  discountType?: "one-time" | "recurring";

  @IsOptional()
  @IsInt()
  @Min(0)
  discountAmountCents?: number;

  @IsOptional()
  @IsString()
  placedAt?: string;

  @IsOptional()
  @IsString()
  firstDueAt?: string;

  @IsOptional()
  @IsBoolean()
  skipEmail?: boolean;

  @IsOptional()
  @IsBoolean()
  runModules?: boolean;
}

export class PayOrderDto {
  @IsIn(["CREDIT_CARD", "PAYPAL", "SEPA", "CRYPTO", "BANK_TRANSFER"])
  method: "CREDIT_CARD" | "PAYPAL" | "SEPA" | "CRYPTO" | "BANK_TRANSFER";

  @IsString()
  paymentMethodId: string;

  @IsOptional()
  @IsString()
  iban?: string;
}

export class AdminProductPriceDto {
  @IsIn([...billingCycles])
  billingCycle: string;

  @IsInt()
  @Min(0)
  amountCents: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  setupFeeCents?: number;
}

export class AdminProductDto {
  @IsString()
  name: string;

  @IsIn([...productTypes])
  type: string;

  @IsString()
  slug: string;

  @IsString()
  description: string;

  @IsOptional()
  @IsBoolean()
  homepageVisible?: boolean;

  @IsOptional()
  @IsString()
  provisioningModule?: string;

  @IsArray()
  prices: AdminProductPriceDto[];

  @IsOptional()
  @IsArray()
  configurableOptions?: Array<{ key: string; label: string; required?: boolean; values: unknown[] }>;
}
