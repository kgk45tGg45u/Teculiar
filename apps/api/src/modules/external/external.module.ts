import { Module } from "@nestjs/common";
import { ExternalController } from "./external.controller";
import { ExternalService } from "./external.service";
import { HetznerProviderService } from "./hetzner-provider.service";
import { ResellBizProviderService } from "./resellbiz-provider.service";
import { VirtualminProviderService } from "./virtualmin-provider.service";

@Module({
  controllers: [ExternalController],
  providers: [ExternalService, VirtualminProviderService, ResellBizProviderService, HetznerProviderService],
  exports: [ExternalService]
})
export class ExternalModule {}
