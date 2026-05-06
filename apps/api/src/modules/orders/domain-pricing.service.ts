import { Injectable } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { randomUUID } from "node:crypto";
import {
  credentialsFromEnv,
  ResellBizClient,
  type ResellBizDomainPrice,
  type ResellBizDomainPriceAction
} from "../resellbiz-client/resellbiz-api";
import { PrismaService } from "../prisma/prisma.service";

type PriceResult = {
  amountCents: number;
  error?: string;
  source: "live" | "fallback";
  tld: string;
};

@Injectable()
export class DomainPricingService {
  constructor(private readonly prisma?: PrismaService) {}

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
    const client = new ResellBizClient(
      credentialsFromEnv({
        ...process.env,
        RESELLBIZ_API_BASE_URL: process.env.RESELLBIZ_API_BASE_URL ?? "https://test.httpapi.com"
      })
    );
    const prices = await client.getCustomerDomainPrices(customerId);
    await this.replaceStoredPrices(prices);

    return { count: prices.length, updatedAt: new Date().toISOString() };
  }

  async upsertStoredPrice(input: {
    action: string;
    amountCents: number;
    manual?: boolean;
    suggested?: boolean;
    tld: string;
    years: number;
  }) {
    if (!this.prisma) {
      return undefined;
    }
    const tld = normalizeTld(input.tld);

    await this.prisma.$executeRaw`
      INSERT INTO "DomainTldPrice" ("id", "tld", "action", "years", "amountCents", "currency", "manual", "suggested", "createdAt", "updatedAt")
      VALUES (${randomUUID()}, ${tld}, ${input.action}, ${input.years}, ${input.amountCents}, 'EUR', ${Boolean(input.manual)}, ${Boolean(input.suggested)}, NOW(), NOW())
      ON CONFLICT ("tld", "action", "years") DO UPDATE SET
        "amountCents" = EXCLUDED."amountCents",
        "manual" = EXCLUDED."manual",
        "suggested" = EXCLUDED."suggested",
        "updatedAt" = NOW()
    `;

    return { ...input, tld };
  }

  async listStoredPrices() {
    if (!this.prisma) {
      return [];
    }

    return this.prisma.$queryRaw`
      SELECT "tld", "action", "years", "amountCents", "currency", "manual", "suggested", "updatedAt"
      FROM "DomainTldPrice"
      ORDER BY "tld" ASC, "action" ASC, "years" ASC
    `;
  }

  async listSuggestedTlds() {
    if (!this.prisma) {
      return ["com", "net", "org"];
    }

    const rows = await this.prisma.$queryRaw<Array<{ tld: string }>>`
      SELECT DISTINCT "tld"
      FROM "DomainTldPrice"
      WHERE "suggested" = true
      ORDER BY "tld" ASC
    `;

    return rows.length > 0 ? rows.map((row) => row.tld) : ["com", "net", "org"];
  }

  async minimumRegisterPrice() {
    if (!this.prisma) {
      return undefined;
    }

    const rows = await this.prisma.$queryRaw<Array<{ amountCents: number }>>`
      SELECT MIN("amountCents")::int AS "amountCents"
      FROM "DomainTldPrice"
      WHERE "action" = 'register' AND "years" = 1 AND "amountCents" > 0
    `;

    return rows[0]?.amountCents;
  }

  private async storedPrice(tld: string, action: ResellBizDomainPriceAction, years: number) {
    if (!this.prisma) {
      return undefined;
    }

    const rows = await this.prisma.$queryRaw<Array<{ amountCents: number }>>`
      SELECT "amountCents"
      FROM "DomainTldPrice"
      WHERE "tld" = ${tld} AND "action" = ${action} AND "years" = ${years}
      LIMIT 1
    `;

    return rows[0]?.amountCents;
  }

  private async replaceStoredPrices(prices: ResellBizDomainPrice[]) {
    if (!this.prisma) {
      return;
    }

    await this.prisma.$executeRaw`DELETE FROM "DomainTldPrice" WHERE "manual" = false AND "suggested" = false AND "tld" <> 'de'`;
    const syncedPrices = prices.filter((price) => price.tld !== "de");
    for (let index = 0; index < syncedPrices.length; index += 400) {
      const batch = syncedPrices.slice(index, index + 400);
      await this.prisma.$executeRaw`
          INSERT INTO "DomainTldPrice" ("id", "tld", "action", "years", "amountCents", "currency", "manual", "suggested", "createdAt", "updatedAt")
          VALUES ${Prisma.join(
            batch.map((price) =>
              Prisma.sql`(${randomUUID()}, ${price.tld}, ${price.action}, ${price.years}, ${price.amountCents}, 'EUR', false, false, NOW(), NOW())`
            )
          )}
          ON CONFLICT ("tld", "action", "years") DO UPDATE SET
            "amountCents" = EXCLUDED."amountCents",
            "updatedAt" = NOW()
          WHERE "DomainTldPrice"."manual" = false AND "DomainTldPrice"."tld" <> 'de'
        `;
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
