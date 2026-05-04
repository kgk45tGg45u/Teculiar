export type ProvisioningRequest = {
  serviceId: string;
  productType: string;
  options: Record<string, unknown>;
};

export type ProvisioningResult = {
  externalId: string;
  status: "QUEUED" | "PROVISIONING" | "ACTIVE" | "FAILED";
  metadata?: Record<string, unknown>;
};

export interface HostingProvider {
  provision(request: ProvisioningRequest): Promise<ProvisioningResult>;
  restart(serviceExternalId: string): Promise<{ accepted: boolean; operationId: string }>;
}

export interface DomainProvider {
  search(domain: string): Promise<{ domain: string; available: boolean; premium: boolean }>;
  register(domain: string, years: number, contactId: string): Promise<ProvisioningResult>;
  transfer(domain: string, authCode: string, contactId: string): Promise<ProvisioningResult>;
}
