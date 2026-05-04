import { IsArray, IsIn, IsInt, IsOptional, IsString, Min } from "class-validator";
import { billingCycles, productTypes } from "@crimson/shared";

export class CreateProductDto {
  @IsString()
  name: string;

  @IsIn([...productTypes])
  type: string;

  @IsString()
  slug: string;

  @IsString()
  description: string;

  @IsIn([...billingCycles])
  billingCycle: string;

  @IsInt()
  @Min(0)
  amountCents: number;

  @IsInt()
  @Min(0)
  setupFeeCents: number;

  @IsOptional()
  @IsArray()
  configurableOptions?: Array<{ key: string; label: string; values: unknown[] }>;
}
