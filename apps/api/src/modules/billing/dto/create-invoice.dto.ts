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
import { invoiceStatuses } from "@crimson/shared";

export class InvoiceLineDto {
  @IsString()
  description: string;

  @IsInt()
  @Min(1)
  quantity: number;

  @IsInt()
  @Min(0)
  unitAmountCents: number;

  @IsOptional()
  @IsString()
  serviceId?: string;

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
