import { IsArray, IsBoolean, IsEmail, IsIn, IsInt, IsObject, IsOptional, IsString, Min } from "class-validator";
import { billingCycles, productTypes } from "@dezhost/shared";

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
  @IsIn(["CREDIT_CARD", "PAYPAL", "SEPA", "CRYPTO"])
  method: "CREDIT_CARD" | "PAYPAL" | "SEPA" | "CRYPTO";

  @IsString()
  paymentMethodId: string;
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
