import { Injectable } from "@nestjs/common";
import { canonicalModuleName } from "../module-registry/module-catalog";
import { HetznerProviderService } from "./hetzner-provider.service";
import { ResellBizProviderService } from "./resellbiz-provider.service";
import { TecreatorProviderService } from "./tecreator-provider.service";
import { VirtualminProviderService } from "./virtualmin-provider.service";
import type { DomainProvider, HostingProvider } from "./provider.types";

@Injectable()
export class ExternalService {
  constructor(
    readonly virtualmin: VirtualminProviderService,
    readonly resellBiz: ResellBizProviderService,
    readonly hetzner: HetznerProviderService,
    readonly tecreator: TecreatorProviderService
  ) {}

  hostingProvider(moduleNameOrProductType: string | null | undefined, productType?: string): HostingProvider {
    const moduleName = productType ? moduleNameOrProductType : undefined;
    const type = productType ?? moduleNameOrProductType;
    // Tecreator (kind: "platform") provisions a whole tenant — "tecreator" is never a ProductType,
    // so match it in either argument position (callers without a loaded product still route right).
    if (moduleNameOrProductType === "tecreator") {
      return this.tecreator;
    }
    if (moduleNameOrProductType === "hetzner" || (!moduleName && ["VPS", "DEDICATED_SERVER"].includes(type ?? ""))) {
      return this.hetzner;
    }

    return this.virtualmin;
  }

  // Resolve the registrar provider that owns a stored registrar identifier (DomainRecord.registrarModule
  // / registrarProvider). Returns undefined for manual domains or registrars with no installed module —
  // future registrar modules add their case here without touching the cron.
  registrarProvider(registrar: string | null | undefined): DomainProvider | undefined {
    return canonicalModuleName(registrar) === "resellbiz" ? this.resellBiz : undefined;
  }
}
