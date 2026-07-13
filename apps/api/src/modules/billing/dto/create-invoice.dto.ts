import { Type } from "class-transformer";
import {
  IsArray,
  IsDateString,
  IsIn,
  IsInt,
  IsObject,
  IsOptional,
  IsString,
  Min,
  ValidateNested
} from "class-validator";
import { billingCycles, invoiceStatuses } from "@teculiar/shared";

export class InvoiceLineDto {
  @IsOptional()
  @IsIn([...billingCycles])
  billingCycle?: string;

  @IsString()
  description: string;

  @IsInt()
  @Min(1)
  quantity: number;

  @IsInt()
  unitAmountCents: number;

  @IsOptional()
  @IsString()
  type?: string;

  @IsOptional()
  @IsString()
  orderItemId?: string;

  @IsOptional()
  @IsString()
  serviceId?: string;

  @IsOptional()
  @IsString()
  domainRecordId?: string;

  @IsOptional()
  @IsString()
  lifecycleAction?: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  vatRate?: number;

  @IsOptional()
  @IsObject()
  metadata?: Record<string, unknown>;

  @IsOptional()
  @IsDateString()
  servicePeriodStart?: string;

  @IsOptional()
  @IsDateString()
  servicePeriodEnd?: string;
}

export class CreateInvoiceDto {
  @IsString()
  userId: string;

  @IsOptional()
  @IsString()
  teamId?: string;

  @IsOptional()
  @IsIn([...invoiceStatuses])
  status?: string;

  @IsOptional()
  @IsDateString()
  issuedAt?: string;

  @IsDateString()
  dueAt: string;

  @IsOptional()
  @IsString()
  couponCode?: string;

  @IsOptional()
  @IsObject()
  customerSnapshot?: Record<string, unknown>;

  @IsOptional()
  @IsObject()
  orderSnapshot?: Record<string, unknown>;

  @IsString()
  buyerCountryCode: string;

  @IsOptional()
  @IsString()
  buyerVatId?: string;

  @IsOptional()
  isBusinessCustomer?: boolean;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => InvoiceLineDto)
  lines: InvoiceLineDto[];
}
