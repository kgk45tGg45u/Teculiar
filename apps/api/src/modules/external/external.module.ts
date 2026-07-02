import { Module } from "@nestjs/common";
import { TenancyModule } from "../../tenancy/tenancy.module";
import { ExternalController } from "./external.controller";
import { ExternalService } from "./external.service";
import { HetznerProviderService } from "./hetzner-provider.service";
import { ResellBizProviderService } from "./resellbiz-provider.service";
import { TecreatorProviderService } from "./tecreator-provider.service";
import { VirtualminProviderService } from "./virtualmin-provider.service";

// TenancyModule exports TenantProvisioningService + ControlPlaneService, which the Tecreator
// platform provider uses to create/register tenants. No cycle: TenancyModule imports only Theme/Users.
@Module({
  imports: [TenancyModule],
  controllers: [ExternalController],
  providers: [ExternalService, VirtualminProviderService, ResellBizProviderService, HetznerProviderService, TecreatorProviderService],
  exports: [ExternalService]
})
export class ExternalModule {}
