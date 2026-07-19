import { IsArray, IsBoolean, IsIn, IsInt, IsObject, IsOptional, IsString, Min } from "class-validator";
import { billingCycles } from "@teculiar/shared";

export class AdminAddOnDto {
  @IsString()
  name: string;

  @IsString()
  slug: string;

  @IsOptional()
  @IsString()
  description?: string;

  // {"de": "Monatliche Wartung"} — per-locale overrides; name/description hold the main language.
  @IsOptional()
  @IsObject()
  nameTranslations?: Record<string, string>;

  @IsOptional()
  @IsObject()
  descriptionTranslations?: Record<string, string>;

  @IsInt()
  @Min(0)
  amountCents: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  setupFeeCents?: number;

  // Empty = the addon follows the billing cycle of the product it is ordered with.
  @IsOptional()
  @IsIn([...billingCycles, ""])
  billingCycle?: string;

  @IsOptional()
  @IsBoolean()
  recurring?: boolean;

  @IsOptional()
  @IsBoolean()
  active?: boolean;

  // Products this addon is choosable on (replaces the existing assignment set).
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  productIds?: string[];
}
