import { IsBoolean, IsIn, IsInt, IsObject, IsOptional, IsString, MaxLength } from "class-validator";

// Per-locale text map, e.g. { en: "IT Solutions", de: "IT-Lösungen" }. Arbitrary locale keys, so the
// whole object is validated with @IsObject() (nested values are sanitized in the service).
export type LocaleMap = Record<string, string>;

export class CreatePageDto {
  @IsOptional()
  @IsString()
  @MaxLength(120)
  key?: string;

  @IsObject()
  name!: LocaleMap;

  @IsObject()
  slug!: LocaleMap;

  @IsOptional()
  @IsObject()
  seoTitle?: LocaleMap;

  @IsOptional()
  @IsObject()
  seoDescription?: LocaleMap;

  @IsOptional()
  @IsBoolean()
  published?: boolean;

  @IsOptional()
  @IsInt()
  order?: number;
}

export class UpdatePageDto {
  @IsOptional()
  @IsObject()
  name?: LocaleMap;

  @IsOptional()
  @IsObject()
  slug?: LocaleMap;

  @IsOptional()
  @IsObject()
  seoTitle?: LocaleMap;

  @IsOptional()
  @IsObject()
  seoDescription?: LocaleMap;

  @IsOptional()
  @IsBoolean()
  published?: boolean;

  @IsOptional()
  @IsInt()
  order?: number;
}

export class CreateMenuItemDto {
  @IsString()
  @IsIn(["MAIN", "LEGAL"])
  menu!: "MAIN" | "LEGAL";

  @IsObject()
  label!: LocaleMap;

  @IsOptional()
  @IsString()
  parentId?: string | null;

  @IsOptional()
  @IsString()
  pageId?: string | null;

  @IsOptional()
  @IsString()
  externalUrl?: string | null;

  @IsOptional()
  @IsBoolean()
  newTab?: boolean;

  @IsOptional()
  @IsInt()
  order?: number;
}

export class UpdateMenuItemDto {
  @IsOptional()
  @IsString()
  @IsIn(["MAIN", "LEGAL"])
  menu?: "MAIN" | "LEGAL";

  @IsOptional()
  @IsObject()
  label?: LocaleMap;

  @IsOptional()
  @IsString()
  parentId?: string | null;

  @IsOptional()
  @IsString()
  pageId?: string | null;

  @IsOptional()
  @IsString()
  externalUrl?: string | null;

  @IsOptional()
  @IsBoolean()
  newTab?: boolean;

  @IsOptional()
  @IsInt()
  order?: number;
}

export class UpdateFooterDto {
  @IsObject()
  footer!: Record<string, unknown>;
}
