import { BadRequestException, Inject, Injectable, Optional } from "@nestjs/common";
import type { FetchLike } from "../resellbiz-client/resellbiz-api";

type RdapBootstrap = {
  services?: Array<[string[], string[]]>;
};

export type DomainAvailabilityResult = {
  available: boolean;
  domain: string;
  error?: string;
  source: "rdap";
  tld: string;
};

const BOOTSTRAP_URL = "https://data.iana.org/rdap/dns.json";
const CACHE_TTL_MS = 1000 * 60 * 60 * 24;

@Injectable()
export class DomainAvailabilityService {
  private cache?: { fetchedAt: number; services: Array<[string[], string[]]> };

  constructor(@Optional() @Inject("DOMAIN_AVAILABILITY_FETCH") private readonly fetcher: FetchLike = globalThis.fetch) {}

  async check(input: string): Promise<DomainAvailabilityResult> {
    const domain = normalizeDomain(input);
    const tld = domain.split(".").at(-1);
    if (!tld) {
      throw new BadRequestException("Domain needs a TLD");
    }

    const baseUrl = await this.rdapBaseUrl(tld);
    if (!baseUrl) {
      return { available: false, domain, error: `No RDAP server found for .${tld}`, source: "rdap", tld };
    }

    const url = new URL(`domain/${encodeURIComponent(domain)}`, ensureTrailingSlash(baseUrl));
    const response = await this.fetcher(url);
    if (response.status === 404) {
      return { available: true, domain, source: "rdap", tld };
    }
    if (response.ok) {
      return { available: false, domain, source: "rdap", tld };
    }

    return { available: false, domain, error: `RDAP returned HTTP ${response.status}`, source: "rdap", tld };
  }

  private async rdapBaseUrl(tld: string) {
    if (tld === "de") {
      return "https://rdap.denic.de/";
    }

    const services = await this.bootstrapServices();
    const service = services.find(([tlds]) => tlds.some((candidate) => candidate.toLowerCase() === tld));

    return service?.[1][0];
  }

  private async bootstrapServices() {
    if (this.cache && Date.now() - this.cache.fetchedAt < CACHE_TTL_MS) {
      return this.cache.services;
    }

    const response = await this.fetcher(new URL(BOOTSTRAP_URL));
    if (!response.ok) {
      throw new BadRequestException(`IANA RDAP bootstrap returned HTTP ${response.status}`);
    }

    const payload = (await response.json()) as RdapBootstrap;
    const services = Array.isArray(payload.services) ? payload.services : [];
    this.cache = { fetchedAt: Date.now(), services };

    return services;
  }
}

function normalizeDomain(input: string) {
  const domain = input.trim().toLowerCase().replace(/^https?:\/\//, "").replace(/^www\./, "");
  if (!/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)+$/.test(domain)) {
    throw new BadRequestException("Invalid domain name");
  }

  return domain;
}

function ensureTrailingSlash(value: string) {
  return value.endsWith("/") ? value : `${value}/`;
}
