import { IsDateString, IsIn, IsOptional, IsString } from "class-validator";

export class UpdateAnnouncementDto {
  @IsOptional()
  @IsString()
  title?: string;

  @IsOptional()
  @IsString()
  body?: string;

  @IsOptional()
  @IsString()
  excerpt?: string;

  @IsOptional()
  @IsIn(["de", "en"])
  locale?: string;

  @IsOptional()
  @IsDateString()
  publishedAt?: string;
}
