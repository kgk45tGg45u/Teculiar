import { IsIn, IsString } from "class-validator";

export class PayInvoiceDto {
  @IsIn(["CREDIT_CARD", "PAYPAL", "SEPA", "CRYPTO"])
  method: string;

  @IsString()
  paymentMethodId: string;
}
