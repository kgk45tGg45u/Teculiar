import { IsDateString, IsIn, IsOptional, IsString } from "class-validator";
import { billingCycles } from "@teculiar/shared";

export class CreateSubscriptionDto {
  @IsString()
  userId: string;

  @IsString()
  serviceId: string;

  @IsString()
  productPriceId: string;

  @IsIn([...billingCycles])
  billingCycle: string;

  @IsDateString()
  nextInvoiceAt: string;

  @IsOptional()
  @IsString()
  couponCode?: string;
}
