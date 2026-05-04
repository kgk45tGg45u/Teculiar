import { IsIn, IsString } from "class-validator";

export class AutoTranslateDto {
  @IsString()
  sourceContentId: string;

  @IsIn(["de", "en"])
  targetLocale: string;
}
