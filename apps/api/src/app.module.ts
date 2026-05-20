import { MiddlewareConsumer, Module, NestModule } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { ThrottlerModule } from "@nestjs/throttler";
import { CsrfMiddleware } from "./common/middleware/csrf.middleware";
import { AuthModule } from "./modules/auth/auth.module";
import { BillingModule } from "./modules/billing/billing.module";
import { CmsModule } from "./modules/cms/cms.module";
import { CronModule } from "./modules/cron/cron.module";
import { EmailModule } from "./modules/email/email.module";
import { ExternalModule } from "./modules/external/external.module";
import { KnowledgebaseModule } from "./modules/knowledgebase/knowledgebase.module";
import { PrismaModule } from "./modules/prisma/prisma.module";
import { OrdersModule } from "./modules/orders/orders.module";
import { ProductsModule } from "./modules/products/products.module";
import { TicketsModule } from "./modules/tickets/tickets.module";
import { UsersModule } from "./modules/users/users.module";
import { VirtualminClientModule } from "./modules/virtualmin-client/virtualmin-client.module";
import { findDotEnv } from "./modules/resellbiz-client/resellbiz-env";

@Module({
  imports: [
    ConfigModule.forRoot({ envFilePath: findDotEnv(), isGlobal: true }),
    ThrottlerModule.forRoot([{ ttl: 60_000, limit: 120 }]),
    PrismaModule,
    AuthModule,
    UsersModule,
    OrdersModule,
    ProductsModule,
    BillingModule,
    EmailModule,
    TicketsModule,
    KnowledgebaseModule,
    CmsModule,
    CronModule,
    ExternalModule,
    VirtualminClientModule
  ]
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(CsrfMiddleware).forRoutes("*");
  }
}
