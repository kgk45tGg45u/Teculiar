import { IsArray, IsBoolean, IsIn, IsInt, IsOptional, IsString, Min } from "class-validator";
import { billingCycles, domainRequirements, productTypes } from "@teculiar/shared";

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
  @IsString()
  categoryId?: string | null;

  @IsOptional()
  @IsBoolean()
  homepageVisible?: boolean;

  @IsOptional()
  @IsBoolean()
  featured?: boolean;

  @IsOptional()
  @IsString()
  provisioningModule?: string;

  @IsOptional()
  @IsIn([...domainRequirements])
  domainRequirement?: string;

  @IsOptional()
  @IsIn([...billingCycles, ""])
  freeDomainBillingCycle?: string | null;

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

  @IsInt()
  @Min(0)
  @IsOptional()
  sortOrder?: number;
}

export class ProductCategoryDto {
  @IsString()
  name: string;

  @IsString()
  slug: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsString()
  provisioningModule?: string | null;

  @IsInt()
  @IsOptional()
  sortOrder?: number;
}
