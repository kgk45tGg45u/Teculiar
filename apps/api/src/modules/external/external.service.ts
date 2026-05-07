import { Injectable } from "@nestjs/common";
import { HetznerProviderService } from "./hetzner-provider.service";
import { ResellBizProviderService } from "./resellbiz-provider.service";
import { VirtualminProviderService } from "./virtualmin-provider.service";
import type { HostingProvider } from "./provider.types";

@Injectable()
export class ExternalService {
  constructor(
    readonly virtualmin: VirtualminProviderService,
    readonly resellBiz: ResellBizProviderService,
    readonly hetzner: HetznerProviderService
  ) {}

  hostingProvider(productType: string): HostingProvider {
    if (["VPS", "DEDICATED_SERVER"].includes(productType)) {
      return this.hetzner;
    }

    return this.virtualmin;
  }
}
