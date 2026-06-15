import { Injectable } from "@nestjs/common";
import {
  credentialsFromEnv,
  ResellBizClient,
  type ResellBizDomainPrice,
  type ResellBizDomainPriceAction
} from "../resellbiz-client/resellbiz-api";
import { ModuleRegistryService } from "../module-registry/module-registry.service";
import { PrismaService } from "../prisma/prisma.service";

type PriceResult = {
  amountCents: number;
  error?: string;
  source: "live" | "fallback";
  tld: string;
};

@Injectable()
export class DomainPricingService {
  constructor(
    private readonly prisma?: PrismaService,
    private readonly modules?: ModuleRegistryService
  ) {}

  async priceFor(
    domainName: string,
    fallbackCents: number,
    action: ResellBizDomainPriceAction = "register",
    years = 1
  ): Promise<PriceResult> {
    const tld = domainName.split(".").slice(1).join(".").toLowerCase();
    if (!tld) {
      return { amountCents: fallbackCents, error: "Missing domain TLD", source: "fallback", tld };
    }

    try {
      const amountCents = await this.storedPrice(tld, action, years);
      if (amountCents !== undefined) {
        return { amountCents, source: "live", tld };
      }

      return { amountCents: fallbackCents, error: `No live price for .${tld}`, source: "fallback", tld };
    } catch (error) {
      return {
        amountCents: fallbackCents,
        error: error instanceof Error ? error.message : "Domain price fetch failed",
        source: "fallback",
        tld
      };
    }
  }

  async syncFromResellBiz(customerId?: number) {
    const client = await this.resellbizClient();
    const prices = await client.getCustomerDomainPrices(customerId);
    await this.replaceStoredPrices(prices);

    return { count: prices.length, updatedAt: new Date().toISOString() };
  }

  // Build the sync client from the admin-configured Resell.biz module credentials (API key, Reseller
  // ID, Test/Live base URL). Falls back to .env only when the registry is unavailable (e.g. tests).
  private async resellbizClient(): Promise<ResellBizClient> {
    if (this.modules) {
      const config = await this.modules.resellbiz();
      if (config.apiKey && config.resellerId) {
        return new ResellBizClient({ apiKey: config.apiKey, baseUrl: config.baseUrl, resellerId: config.resellerId });
      }
    }
    return new ResellBizClient(
      credentialsFromEnv({
        ...process.env,
        RESELLBIZ_API_BASE_URL: process.env.RESELLBIZ_API_BASE_URL ?? "https://test.httpapi.com"
      })
    );
  }

  // Storefront pricing only ever shows TLDs that have a real price — rows left at 0 (unpriced or
  // "live" placeholders) are hidden so the public table never displays a €0.00 / blank row.
  async listStorefrontPrices() {
    if (!this.prisma) {
      return [];
    }
    return this.prisma.domainTldPrice.findMany({
      orderBy: [{ tld: "asc" }, { action: "asc" }, { years: "asc" }],
      select: { action: true, amountCents: true, currency: true, manual: true, suggested: true, tld: true, updatedAt: true, years: true },
      where: { amountCents: { gt: 0 } }
    });
  }

  async upsertStoredPrice(input: {
    action: string;
    amountCents?: number;
    manual?: boolean;
    suggested?: boolean;
    tld: string;
    years: number;
  }) {
    if (!this.prisma) {
      return undefined;
    }
    const tld = normalizeTld(input.tld);
    const years = normalizeYears(input.years);
    const amountCents = normalizeAmountCents(input.amountCents);

    if (amountCents === undefined && input.suggested) {
      await this.prisma.domainTldPrice.upsert({
        where: { tld_action_years: { action: input.action, tld, years } },
        create: { action: input.action, amountCents: 0, currency: "EUR", manual: false, suggested: true, tld, years },
        update: { suggested: true }
      });

      return { ...input, amountCents: 0, manual: false, suggested: true, tld, years };
    }

    if (amountCents === undefined) {
      throw new Error("Domain price amount is required unless only marking a TLD as suggested.");
    }

    await this.prisma.domainTldPrice.upsert({
      where: { tld_action_years: { action: input.action, tld, years } },
      create: {
        action: input.action,
        amountCents,
        currency: "EUR",
        manual: Boolean(input.manual),
        suggested: Boolean(input.suggested),
        tld,
        years
      },
      update: {
        amountCents,
        manual: Boolean(input.manual),
        suggested: Boolean(input.suggested)
      }
    });

    return { ...input, amountCents, tld, years };
  }

  async listStoredPrices() {
    if (!this.prisma) {
      return [];
    }

    return this.prisma.domainTldPrice.findMany({
      orderBy: [{ tld: "asc" }, { action: "asc" }, { years: "asc" }],
      select: { action: true, amountCents: true, currency: true, manual: true, suggested: true, tld: true, updatedAt: true, years: true }
    });
  }

  async listSuggestedTlds() {
    if (!this.prisma) {
      return ["com", "net", "org"];
    }

    const rows = await this.prisma.domainTldPrice.findMany({
      distinct: ["tld"],
      orderBy: { tld: "asc" },
      select: { tld: true },
      where: { suggested: true }
    });

    return rows.length > 0 ? rows.map((row) => row.tld) : ["com", "net", "org"];
  }

  async minimumRegisterPrice() {
    if (!this.prisma) {
      return undefined;
    }

    const result = await this.prisma.domainTldPrice.aggregate({
      _min: { amountCents: true },
      where: { action: "register", amountCents: { gt: 0 }, years: 1 }
    });

    return result._min.amountCents ?? undefined;
  }

  private async storedPrice(tld: string, action: ResellBizDomainPriceAction, years: number) {
    if (!this.prisma) {
      return undefined;
    }

    const row = await this.prisma.domainTldPrice.findFirst({
      select: { amountCents: true },
      where: { action, amountCents: { gt: 0 }, tld, years }
    });

    const amountCents = row?.amountCents;
    return amountCents && amountCents > 0 ? amountCents : undefined;
  }

  private async replaceStoredPrices(prices: ResellBizDomainPrice[]) {
    if (!this.prisma) {
      return;
    }

    await this.prisma.domainTldPrice.deleteMany({ where: { manual: false, suggested: false, tld: { not: "de" } } });
    const syncedPrices = prices.filter((price) => price.tld !== "de");
    for (let index = 0; index < syncedPrices.length; index += 400) {
      const batch = syncedPrices.slice(index, index + 400);
      await this.prisma.domainTldPrice.createMany({
        data: batch.map((price) => ({
          action: price.action,
          amountCents: price.amountCents,
          currency: "EUR",
          manual: false,
          suggested: false,
          tld: price.tld,
          years: price.years
        })),
        skipDuplicates: true
      });
    }
  }
}

function normalizeTld(input: string) {
  const tld = input.trim().toLowerCase().replace(/^\./, "");
  if (!/^[a-z0-9-]{2,63}$/.test(tld)) {
    throw new Error("Invalid TLD");
  }

  return tld;
}

function normalizeYears(input: number) {
  const years = Number(input);
  if (!Number.isInteger(years) || years < 1) {
    throw new Error("Domain price years must be a positive integer");
  }

  return years;
}

function normalizeAmountCents(input?: number) {
  if (input === undefined || input === null) {
    return undefined;
  }
  const amountCents = Number(input);
  if (!Number.isFinite(amountCents) || amountCents < 0) {
    throw new Error("Domain price amount must be zero or more");
  }

  return Math.round(amountCents);
}
