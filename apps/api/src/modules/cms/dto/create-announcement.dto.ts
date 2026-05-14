import { IsDateString, IsIn, IsOptional, IsString } from "class-validator";

export class CreateAnnouncementDto {
  @IsString()
  title: string;

  @IsString()
  body: string;

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
