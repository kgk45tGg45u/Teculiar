import { IsIn, IsString } from "class-validator";

export class PayInvoiceDto {
  @IsIn(["CREDIT_CARD", "PAYPAL", "SEPA", "CRYPTO", "BANK_TRANSFER"])
  method: string;

  @IsString()
  paymentMethodId: string;
}
