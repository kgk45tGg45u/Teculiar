import { MiddlewareConsumer, Module, NestModule } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { ThrottlerModule } from "@nestjs/throttler";
import { CsrfMiddleware } from "./common/middleware/csrf.middleware";
import { AuthModule } from "./modules/auth/auth.module";
import { BillingModule } from "./modules/billing/billing.module";
import { CmsModule } from "./modules/cms/cms.module";
import { ExternalModule } from "./modules/external/external.module";
import { PrismaModule } from "./modules/prisma/prisma.module";
import { ProductsModule } from "./modules/products/products.module";
import { TicketsModule } from "./modules/tickets/tickets.module";
import { UsersModule } from "./modules/users/users.module";
import { VirtualminClientModule } from "./modules/virtualmin-client/virtualmin-client.module";

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    ThrottlerModule.forRoot([{ ttl: 60_000, limit: 120 }]),
    PrismaModule,
    AuthModule,
    UsersModule,
    ProductsModule,
    BillingModule,
    TicketsModule,
    CmsModule,
    ExternalModule,
    VirtualminClientModule
  ]
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(CsrfMiddleware).forRoutes("*");
  }
}
