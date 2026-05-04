import { Injectable } from "@nestjs/common";
import { HetznerProviderService } from "./hetzner-provider.service";
import { ResellBizProviderService } from "./resellbiz-provider.service";
import { VirtualminProviderService } from "./virtualmin-provider.service";

@Injectable()
export class ExternalService {
  constructor(
    readonly virtualmin: VirtualminProviderService,
    readonly resellBiz: ResellBizProviderService,
    readonly hetzner: HetznerProviderService
  ) {}

  hostingProvider(productType: string) {
    if (["VPS", "DEDICATED_SERVER"].includes(productType)) {
      return this.hetzner;
    }

    return this.virtualmin;
  }
}
