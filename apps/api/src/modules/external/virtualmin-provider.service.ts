import { Injectable } from "@nestjs/common";
import { randomUUID } from "crypto";
import type { HostingProvider, ProvisioningRequest } from "./provider.types";

@Injectable()
export class VirtualminProviderService implements HostingProvider {
  async provision(request: ProvisioningRequest) {
    return {
      externalId: `virtualmin_${request.serviceId}`,
      status: "QUEUED" as const,
      metadata: {
        panel: "virtualmin",
        requestedOptions: request.options
      }
    };
  }

  async restart(serviceExternalId: string) {
    return {
      accepted: true,
      operationId: `vm-restart-${serviceExternalId}-${randomUUID()}`
    };
  }
}
