import { IsBoolean, IsOptional, IsString } from "class-validator";

export class CreateReplyDto {
  @IsString()
  body: string;

  @IsOptional()
  @IsBoolean()
  internal?: boolean;
}
