import { IsIn, IsOptional, IsString } from "class-validator";

export class CreateTicketDto {
  @IsString()
  subject: string;

  @IsString()
  body: string;

  @IsIn(["SALES", "SUPPORT", "ABUSE"])
  department: string;

  @IsOptional()
  @IsIn(["LOW", "NORMAL", "HIGH", "URGENT"])
  priority?: string;

  @IsOptional()
  @IsString()
  serviceId?: string;

  @IsOptional()
  paid?: boolean;
}
