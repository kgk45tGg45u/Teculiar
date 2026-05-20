import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { BillingModule } from "../billing/billing.module";
import { EmailModule } from "../email/email.module";
import { ExternalModule } from "../external/external.module";
import { UsersModule } from "../users/users.module";
import { DomainAvailabilityService } from "./domain-availability.service";
import { DomainPricingService } from "./domain-pricing.service";
import { OrdersController } from "./orders.controller";
import { OrdersRepository } from "./orders.repository";
import { OrdersService } from "./orders.service";

@Module({
  imports: [AuthModule, BillingModule, EmailModule, ExternalModule, UsersModule],
  controllers: [OrdersController],
  providers: [OrdersService, OrdersRepository, DomainPricingService, DomainAvailabilityService],
  exports: [OrdersService]
})
export class OrdersModule {}
