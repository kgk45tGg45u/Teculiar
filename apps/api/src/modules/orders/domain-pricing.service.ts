import { Injectable } from "@nestjs/common";

type PriceResult = {
  amountCents: number;
  error?: string;
  source: "live" | "fallback";
  tld: string;
};

const PRICE_URL = "https://dezhost.supersite2.srsportal.com/domain-registration/domain-registration-price.php";
const CACHE_TTL_MS = 1000 * 60 * 15;

@Injectable()
export class DomainPricingService {
  private cache?: { fetchedAt: number; prices: Map<string, number> };

  async priceFor(domainName: string, fallbackCents: number): Promise<PriceResult> {
    const tld = domainName.split(".").slice(1).join(".").toLowerCase();
    if (!tld) {
      return { amountCents: fallbackCents, error: "Missing domain TLD", source: "fallback", tld };
    }

    try {
      const prices = await this.prices();
      const amountCents = prices.get(tld);
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

  private async prices() {
    if (this.cache && Date.now() - this.cache.fetchedAt < CACHE_TTL_MS) {
      return this.cache.prices;
    }

    const response = await fetch(PRICE_URL);
    if (!response.ok) {
      throw new Error(`Domain price source returned HTTP ${response.status}`);
    }

    const prices = parseDomainPrices(await response.text());
    if (prices.size === 0) {
      throw new Error("Domain price source did not contain parseable prices");
    }

    this.cache = { fetchedAt: Date.now(), prices };
    return prices;
  }
}

function parseDomainPrices(html: string) {
  const prices = new Map<string, number>();
  const rowPattern = /<tr[\s\S]*?<\/tr>/gi;
  const cellPattern = /<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/gi;

  for (const row of html.match(rowPattern) ?? []) {
    const cells = [...row.matchAll(cellPattern)].map((match) => cleanCell(match[1] ?? ""));
    const tld = cells.find((cell) => /^\.[a-z0-9.-]+$/i.test(cell))?.slice(1).toLowerCase();
    const price = cells.map(parseEuroCents).find((value) => value !== undefined);

    if (tld && price !== undefined) {
      prices.set(tld, price);
    }
  }

  return prices;
}

function cleanCell(value: string) {
  return value
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function parseEuroCents(value: string) {
  const match = value.match(/(?:€|EUR)?\s*(\d+(?:[.,]\d{1,2})?)/i);
  if (!match?.[1]) {
    return undefined;
  }

  return Math.round(Number(match[1].replace(",", ".")) * 100);
}
