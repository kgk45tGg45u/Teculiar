import { Global, Module } from "@nestjs/common";
import { ConnectionRegistry } from "../../tenancy/connection-registry.service";
import { createTenantAwarePrisma, PrismaService } from "./prisma.service";

/**
 * Provides the tenant-aware PrismaService (a Proxy routed by AsyncLocalStorage) plus
 * the ConnectionRegistry that owns every live connection. Global so every module that
 * injects PrismaService automatically hits the right tenant DB. The registry is
 * exported for the tenancy layer (middleware, provisioning).
 */
@Global()
@Module({
  providers: [
    ConnectionRegistry,
    {
      provide: PrismaService,
      useFactory: (registry: ConnectionRegistry) => createTenantAwarePrisma(registry),
      inject: [ConnectionRegistry]
    }
  ],
  exports: [PrismaService, ConnectionRegistry]
})
export class PrismaModule {}
