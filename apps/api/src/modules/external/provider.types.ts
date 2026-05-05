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

export type DomainRegistrationRequest = {
  autoRenew?: boolean;
  contactId?: string;
  customerContact?: DomainCustomerContactRequest;
  customerId?: string;
  domain: string;
  extraAttributes?: Record<string, boolean | number | string>;
  nameServers?: string[];
  years: number;
};

export type DomainTransferRequest = DomainRegistrationRequest & {
  authCode: string;
};

export type DomainCustomerContactRequest = {
  addressLine1: string;
  addressLine2?: string;
  city: string;
  company?: string;
  country: string;
  email: string;
  name: string;
  phone: string;
  phoneCountryCode: string;
  state?: string;
  vatId?: string;
  zipCode: string;
};

export type DomainCustomerContactResult = {
  contactId: number;
  customerId: number;
  metadata?: Record<string, unknown>;
};

export interface HostingProvider {
  provision(request: ProvisioningRequest): Promise<ProvisioningResult>;
  restart(serviceExternalId: string): Promise<{ accepted: boolean; operationId: string }>;
}

export interface DomainProvider {
  search(domain: string): Promise<{ domain: string; available: boolean; premium: boolean }>;
  ensureCustomerContact(request: DomainCustomerContactRequest): Promise<DomainCustomerContactResult>;
  register(request: DomainRegistrationRequest): Promise<ProvisioningResult>;
  transfer(request: DomainTransferRequest): Promise<ProvisioningResult>;
}
