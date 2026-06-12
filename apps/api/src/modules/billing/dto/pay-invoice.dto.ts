import { IsBoolean, IsIn, IsOptional, IsString } from "class-validator";

export class PayInvoiceDto {
  @IsIn(["CREDIT_CARD", "PAYPAL", "SEPA", "CRYPTO", "BANK_TRANSFER"])
  method: string;

  @IsString()
  paymentMethodId: string;

  @IsOptional()
  @IsString()
  iban?: string;

  // Manual payments only: the client must explicitly opt in to spend their account balance.
  // (The automatic cron payment path always applies the balance — that is intentional.)
  @IsOptional()
  @IsBoolean()
  useAccountBalance?: boolean;
}
