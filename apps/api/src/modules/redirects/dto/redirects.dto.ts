import { IsBoolean, IsOptional, IsString, MaxLength } from "class-validator";

export class CreateRedirectDto {
  @IsString()
  @MaxLength(191)
  fromPath!: string;

  @IsString()
  @MaxLength(191)
  toPath!: string;

  @IsOptional()
  @IsBoolean()
  permanent?: boolean;

  @IsOptional()
  @IsBoolean()
  enabled?: boolean;
}

export class UpdateRedirectDto {
  @IsOptional()
  @IsString()
  @MaxLength(191)
  fromPath?: string;

  @IsOptional()
  @IsString()
  @MaxLength(191)
  toPath?: string;

  @IsOptional()
  @IsBoolean()
  permanent?: boolean;

  @IsOptional()
  @IsBoolean()
  enabled?: boolean;
}
