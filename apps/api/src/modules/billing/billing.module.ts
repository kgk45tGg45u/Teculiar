import { Module } from "@nestjs/common";
import { JwtModule } from "@nestjs/jwt";
import { AgentAuditService } from "../../common/agent-audit.service";
import { EmailModule } from "../email/email.module";
import { ExternalModule } from "../external/external.module";
import { TicketsModule } from "../tickets/tickets.module";
import { BillingConfirmController, BillingController, BillingDevController, BillingStorefrontController, BillingWebhookController } from "./billing.controller";
import { BillingEngineService } from "./billing-engine.service";
import { BillingRepository } from "./billing.repository";
import { BillingService } from "./billing.service";
import { AbstractPaymentService } from "./processors/abstract-payment.service";
import { TaxService } from "./tax.service";

@Module({
  imports: [EmailModule, ExternalModule, JwtModule.register({}), TicketsModule],
  controllers: [BillingController, BillingConfirmController, BillingDevController, BillingStorefrontController, BillingWebhookController],
  providers: [BillingService, BillingRepository, BillingEngineService, TaxService, AbstractPaymentService, AgentAuditService],
  exports: [BillingService]
})
export class BillingModule {}
