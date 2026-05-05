import { IsArray, IsBoolean, IsIn, IsInt, IsOptional, IsString, Min } from "class-validator";
import { billingCycles, productTypes } from "@crimson/shared";

type PriceInput = {
  amountCents: number;
  billingCycle?: string;
  setupFeeCents?: number;
};

export class CreateProductDto {
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

  @IsOptional()
  @IsArray()
  prices?: PriceInput[];

  @IsIn([...billingCycles])
  @IsOptional()
  billingCycle: string;

  @IsInt()
  @Min(0)
  @IsOptional()
  amountCents?: number;

  @IsInt()
  @Min(0)
  @IsOptional()
  setupFeeCents?: number;

  @IsOptional()
  @IsArray()
  configurableOptions?: Array<{ key: string; label: string; required?: boolean; values: unknown[] }>;
}
