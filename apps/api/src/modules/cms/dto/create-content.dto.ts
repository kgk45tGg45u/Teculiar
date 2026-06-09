import { IsArray, IsIn, IsObject, IsOptional, IsString } from "class-validator";

export class CreateContentDto {
  @IsIn(["PAGE", "POST", "LEGAL"])
  type: string;

  @IsString()
  slug: string;

  @IsIn(["de", "en"])
  locale: string;

  @IsString()
  title: string;

  @IsObject()
  content: Record<string, unknown>;

  @IsOptional()
  @IsString()
  excerpt?: string;

  @IsOptional()
  @IsString()
  seoTitle?: string;

  @IsOptional()
  @IsString()
  seoDescription?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  categoryIds?: string[];

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  tagIds?: string[];
}
