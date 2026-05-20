import { Module } from "@nestjs/common";
import { BillingModule } from "../billing/billing.module";
import { OrdersModule } from "../orders/orders.module";
import { ProductsModule } from "../products/products.module";
import { TicketsModule } from "../tickets/tickets.module";
import { CronController } from "./cron.controller";
import { CronService } from "./cron.service";

@Module({
  imports: [BillingModule, OrdersModule, ProductsModule, TicketsModule],
  controllers: [CronController],
  providers: [CronService]
})
export class CronModule {}
