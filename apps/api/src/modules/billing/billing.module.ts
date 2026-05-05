import { Module } from "@nestjs/common";
import { BillingController, BillingDevController } from "./billing.controller";
import { BillingEngineService } from "./billing-engine.service";
import { BillingRepository } from "./billing.repository";
import { BillingService } from "./billing.service";
import { AbstractPaymentService } from "./processors/abstract-payment.service";
import { TaxService } from "./tax.service";

@Module({
  controllers: [BillingController, BillingDevController],
  providers: [BillingService, BillingRepository, BillingEngineService, TaxService, AbstractPaymentService],
  exports: [BillingService]
})
export class BillingModule {}
