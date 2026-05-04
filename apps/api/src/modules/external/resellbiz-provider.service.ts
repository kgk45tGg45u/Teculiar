import { Injectable } from "@nestjs/common";
import type { DomainProvider } from "./provider.types";

@Injectable()
export class ResellBizProviderService implements DomainProvider {
  async search(domain: string) {
    return {
      domain,
      available: !domain.startsWith("taken-"),
      premium: domain.endsWith(".io")
    };
  }

  async register(domain: string, years: number, contactId: string) {
    return {
      externalId: `resellbiz_${domain}`,
      status: "QUEUED" as const,
      metadata: { years, contactId }
    };
  }

  async transfer(domain: string, authCode: string, contactId: string) {
    return {
      externalId: `resellbiz_transfer_${domain}`,
      status: "QUEUED" as const,
      metadata: { authCodePresent: Boolean(authCode), contactId }
    };
  }
}
