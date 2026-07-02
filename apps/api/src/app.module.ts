import { MiddlewareConsumer, Module, NestModule } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { ThrottlerModule } from "@nestjs/throttler";
import { CsrfMiddleware } from "./common/middleware/csrf.middleware";
import { HealthController } from "./health.controller";
import { AuthModule } from "./modules/auth/auth.module";
import { BillingModule } from "./modules/billing/billing.module";
import { CmsModule } from "./modules/cms/cms.module";
import { CronModule } from "./modules/cron/cron.module";
import { CustomizerModule } from "./modules/customizer/customizer.module";
import { DepartmentsModule } from "./modules/departments/departments.module";
import { EmailModule } from "./modules/email/email.module";
import { ExternalModule } from "./modules/external/external.module";
import { KnowledgebaseModule } from "./modules/knowledgebase/knowledgebase.module";
import { ModuleRegistryModule } from "./modules/module-registry/module-registry.module";
import { PrismaModule } from "./modules/prisma/prisma.module";
import { TenancyModule } from "./tenancy/tenancy.module";
import { TenantMiddleware } from "./tenancy/tenant.middleware";
import { OrdersModule } from "./modules/orders/orders.module";
import { ProductsModule } from "./modules/products/products.module";
import { RedirectsModule } from "./modules/redirects/redirects.module";
import { ThemeModule } from "./modules/theme/theme.module";
import { TicketsModule } from "./modules/tickets/tickets.module";
import { UsersModule } from "./modules/users/users.module";
import { VirtualminClientModule } from "./modules/virtualmin-client/virtualmin-client.module";
import { findDotEnv } from "./modules/resellbiz-client/resellbiz-env";

@Module({
  imports: [
    ConfigModule.forRoot({ envFilePath: findDotEnv(), isGlobal: true }),
    ThrottlerModule.forRoot([{ ttl: 60_000, limit: 120 }]),
    PrismaModule,
    TenancyModule,
    ModuleRegistryModule,
    AuthModule,
    UsersModule,
    OrdersModule,
    ProductsModule,
    BillingModule,
    EmailModule,
    DepartmentsModule,
    TicketsModule,
    KnowledgebaseModule,
    CmsModule,
    CronModule,
    ExternalModule,
    RedirectsModule,
    ThemeModule,
    CustomizerModule,
    VirtualminClientModule
  ],
  controllers: [HealthController]
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    // TenantMiddleware first: it establishes the AsyncLocalStorage tenant context that
    // wraps the entire request pipeline (CSRF, guards, controllers, services).
    consumer.apply(TenantMiddleware, CsrfMiddleware).forRoutes("*");
  }
}
