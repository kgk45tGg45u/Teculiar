import { Injectable } from "@nestjs/common";
import { randomUUID } from "crypto";
import type { HostingProvider, ProvisioningRequest } from "./provider.types";

@Injectable()
export class HetznerProviderService implements HostingProvider {
  async provision(request: ProvisioningRequest) {
    return {
      externalId: `server_${randomUUID()}`,
      status: "PROVISIONING" as const,
      metadata: {
        region: "de",
        requestedOptions: request.options
      }
    };
  }

  async restart(serviceExternalId: string) {
    return {
      accepted: true,
      operationId: `server-restart-${serviceExternalId}-${randomUUID()}`
    };
  }
}
