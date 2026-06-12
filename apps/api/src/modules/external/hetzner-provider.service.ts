import { Injectable } from "@nestjs/common";
import { randomUUID } from "crypto";
import type { HostingProvider, ProvisioningRequest } from "./provider.types";

@Injectable()
export class HetznerProviderService implements HostingProvider {
  async provision(request: ProvisioningRequest) {
    // Stub: returns ACTIVE immediately so the provisioning email fires on payment.
    // A real Hetzner integration would return PROVISIONING and poll for server readiness.
    return {
      externalId: `server_${randomUUID()}`,
      status: "ACTIVE" as const,
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
