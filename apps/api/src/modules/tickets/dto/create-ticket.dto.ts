import { IsIn, IsOptional, IsString } from "class-validator";

export class CreateTicketDto {
  @IsString()
  subject: string;

  @IsString()
  body: string;

  @IsString()
  departmentId: string;

  @IsOptional()
  @IsIn(["LOW", "NORMAL", "HIGH", "URGENT"])
  priority?: string;

  @IsOptional()
  @IsString()
  serviceId?: string;

  @IsOptional()
  paid?: boolean;
}
