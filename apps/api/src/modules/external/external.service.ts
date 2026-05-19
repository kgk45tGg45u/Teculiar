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

  hostingProvider(moduleNameOrProductType: string | null | undefined, productType?: string): HostingProvider {
    const moduleName = productType ? moduleNameOrProductType : undefined;
    const type = productType ?? moduleNameOrProductType;
    if (moduleName === "hetzner" || (!moduleName && ["VPS", "DEDICATED_SERVER"].includes(type ?? ""))) {
      return this.hetzner;
    }

    return this.virtualmin;
  }
}
