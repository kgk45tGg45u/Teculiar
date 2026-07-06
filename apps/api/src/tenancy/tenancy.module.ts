import { Module } from "@nestjs/common";
import { ThemeModule } from "../modules/theme/theme.module";
import { UsersModule } from "../modules/users/users.module";
import { ControlPlaneService } from "./control-plane.service";
import { TenancyController } from "./tenancy.controller";
import { TenantDomainsController } from "./tenant-domains.controller";
import { TenantMiddleware } from "./tenant.middleware";
import { TenantProvisioningService } from "./tenant-provisioning.service";

/**
 * Wires the multi-tenant core (Phase 4.1). ConnectionRegistry + the tenant-aware
 * PrismaService live in the global PrismaModule (they underpin every module); this
 * module adds the control-plane registry, the request resolver middleware, and the
 * createTenant provisioning primitive. ThemeModule/UsersModule are imported so
 * provisioning can reuse their seeders.
 */
@Module({
  imports: [ThemeModule, UsersModule],
  controllers: [TenancyController, TenantDomainsController],
  providers: [ControlPlaneService, TenantProvisioningService, TenantMiddleware],
  exports: [ControlPlaneService, TenantProvisioningService, TenantMiddleware]
})
export class TenancyModule {}
