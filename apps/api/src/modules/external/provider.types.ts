export type ProvisioningRequest = {
  serviceId: string;
  productType: string;
  options: Record<string, unknown>;
};

export type ProvisioningResult = {
  externalId: string;
  expiresAt?: string;
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

export type DomainRenewalRequest = {
  autoRenew?: boolean;
  domain?: string;
  expDate: number;
  extraAttributes?: Record<string, boolean | number | string>;
  orderId: number;
  years: number;
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
  status?(serviceExternalId: string): Promise<ProvisioningResult>;
  // Optional lifecycle hooks the billing engine calls on non-payment / reactivation. Providers that
  // support suspension implement them (Virtualmin disables the panel account; Tecreator suspends the
  // whole tenant — the "license"); providers without them are simply skipped, so nothing is terminated.
  disable?(serviceExternalId: string): Promise<unknown>;
  enable?(serviceExternalId: string): Promise<unknown>;
}

// Domains can additionally be CANCELLED (the registrar/panel reports the domain no longer exists),
// which hosting provisioning never returns — hence a distinct status type for domain lookups.
export type DomainStatusResult = {
  externalId: string;
  expiresAt?: string;
  status: "QUEUED" | "PROVISIONING" | "ACTIVE" | "FAILED" | "CANCELLED";
  metadata?: Record<string, unknown>;
};

export interface DomainProvider {
  search(domain: string): Promise<{ domain: string; available: boolean; premium: boolean }>;
  ensureCustomerContact(request: DomainCustomerContactRequest): Promise<DomainCustomerContactResult>;
  register(request: DomainRegistrationRequest): Promise<ProvisioningResult>;
  renew(request: DomainRenewalRequest): Promise<ProvisioningResult>;
  status?(domain: string): Promise<DomainStatusResult>;
  transfer(request: DomainTransferRequest): Promise<ProvisioningResult>;
}
