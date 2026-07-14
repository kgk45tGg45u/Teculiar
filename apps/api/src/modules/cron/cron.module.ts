import { Module } from "@nestjs/common";
import { TenancyModule } from "../../tenancy/tenancy.module";
import { BillingModule } from "../billing/billing.module";
import { CmsModule } from "../cms/cms.module";
import { OrdersModule } from "../orders/orders.module";
import { ProductsModule } from "../products/products.module";
import { ThemeModule } from "../theme/theme.module";
import { TicketsModule } from "../tickets/tickets.module";
import { CronController } from "./cron.controller";
import { CronService } from "./cron.service";

@Module({
  // TenancyModule: the cron loop iterates the control-plane tenant registry (Phase 3.1).
  imports: [BillingModule, CmsModule, OrdersModule, ProductsModule, TenancyModule, ThemeModule, TicketsModule],
  controllers: [CronController],
  providers: [CronService]
})
export class CronModule {}
