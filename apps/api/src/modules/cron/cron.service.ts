import { Injectable, UnauthorizedException } from "@nestjs/common";
import { mkdir, writeFile } from "node:fs/promises";
import { timingSafeEqual } from "node:crypto";
import { join, resolve } from "node:path";
import { BillingService } from "../billing/billing.service";
import { CmsService } from "../cms/cms.service";
import { OrdersService } from "../orders/orders.service";
import { ProductsService } from "../products/products.service";
import { TicketsService } from "../tickets/tickets.service";

export type CronSettings = {
  cronSecret?: string;
  domainExpirationUpdateHours?: number;
  domainPriceUpdateHours?: number;
  domainStatusUpdateMinutes?: number;
  hostingStatusUpdateMinutes?: number;
  invoiceDaysAhead?: number;
  invoiceReminderDaysBeforeDue?: number;
  mailboxCheckMinutes?: number;
  ticketAutoCloseHours?: number;
};

type CronRunItem = {
  name: string;
  result?: unknown;
  status: "failed" | "ran";
};

type CronSkipItem = {
  name: string;
  nextAt: string;
};

@Injectable()
export class CronService {
  private running = false;

  constructor(
    private readonly billing: BillingService,
    private readonly cms: CmsService,
    private readonly orders: OrdersService,
    private readonly products: ProductsService,
    private readonly tickets: TicketsService
  ) {}

  async runAuthorized(secret?: string, now = new Date()) {
    const settings = await this.billing.cronSettings();
    const expected = (process.env.CRON_SECRET || settings.cronSecret || "").trim();
    if (!expected) {
      throw new UnauthorizedException("Cron secret missing");
    }
    if (!secret) {
      throw new UnauthorizedException("Cron secret missing");
    }
    if (!secretEquals(secret.trim(), expected)) {
      throw new UnauthorizedException("Cron secret invalid");
    }

    return this.run(now, settings);
  }

  async run(now = new Date(), preloadedSettings?: CronSettings) {
    if (this.running) {
      return { ok: true, ran: [], running: true, skipped: [] };
    }
    this.running = true;
    const ran: CronRunItem[] = [];
    const skipped: CronSkipItem[] = [];
    const settings = preloadedSettings ?? await this.billing.cronSettings();

    try {
      await this.maybeRunTimed("domainPrices", hours(settings.domainPriceUpdateHours, 24), now, ran, skipped, () =>
        this.orders.syncDomainPrices()
      );
      await this.maybeRunTimed("domainExpirations", hours(settings.domainExpirationUpdateHours, 12), now, ran, skipped, () =>
        this.products.refreshAllDomainExpirations()
      );
      await this.maybeRunTimed("domainStatuses", minutes(settings.domainStatusUpdateMinutes, 15), now, ran, skipped, () =>
        this.products.refreshAllDomainStatuses()
      );
      await this.runAction("billingMaintenance", ran, () => this.billing.runAdminMaintenance(now));
      await this.runDaily("invoiceReminders", now, ran, skipped, () =>
        this.billing.sendInvoiceReminders(now, positiveNumber(settings.invoiceReminderDaysBeforeDue, 3))
      );
      await this.runAction("ticketsClose", ran, () =>
        this.tickets.closeAnsweredTickets(positiveNumber(settings.ticketAutoCloseHours, 24), now)
      );
      await this.maybeRunTimed("hostingStatuses", minutes(settings.hostingStatusUpdateMinutes, 15), now, ran, skipped, () =>
        this.products.refreshAllHostingStatuses()
      );
      await this.maybeRunTimed("mailboxes", minutes(settings.mailboxCheckMinutes, 5), now, ran, skipped, () =>
        this.tickets.importMailboxTickets(settings as Record<string, unknown>)
      );

      await this.runDaily("sitemap", now, ran, skipped, () => this.generateSitemap());

      await this.billing.recordAction({
        action: "cron.completed",
        metadata: { ran: ran.map((item) => ({ name: item.name, status: item.status })), skipped: skipped.map((item) => item.name) },
        subject: "cron"
      });
      return { ok: ran.every((item) => item.status === "ran"), ran, skipped };
    } finally {
      this.running = false;
    }
  }

  private async generateSitemap() {
    const storedSiteUrl = await this.billing.siteUrl().catch(() => null);
    const siteUrl = (storedSiteUrl || process.env.SITE_URL || "https://dezhost.com").replace(/\/$/, "");
    const locales = ["de", "en"];
    const staticPaths = [
      "",
      "/domains",
      "/domains/pricing",
      "/hosting",
      "/webhosting",
      "/virtual-servers",
      "/vps",
      "/webdesign",
      "/it-losungen",
      "/blog",
      "/uber-uns",
      "/kontakt",
      "/knowledgebase",
      "/legal/agb",
      "/legal/datenschutz",
      "/legal/impressum"
    ];

    const now = new Date().toISOString().slice(0, 10);
    const urls: string[] = [];

    for (const locale of locales) {
      for (const path of staticPaths) {
        urls.push(`  <url><loc>${siteUrl}/${locale}${path}</loc><lastmod>${now}</lastmod><changefreq>weekly</changefreq><priority>${path === "" ? "1.0" : "0.8"}</priority></url>`);
      }
    }

    const [dePosts, enPosts] = await Promise.all([
      this.cms.listPosts("de", {}).catch(() => []),
      this.cms.listPosts("en", {}).catch(() => [])
    ]);

    for (const post of dePosts) {
      urls.push(`  <url><loc>${siteUrl}/de/blog/${post.slug}</loc><lastmod>${post.publishedAt ? new Date(post.publishedAt as unknown as string).toISOString().slice(0, 10) : now}</lastmod><changefreq>monthly</changefreq><priority>0.6</priority></url>`);
    }
    for (const post of enPosts) {
      urls.push(`  <url><loc>${siteUrl}/en/blog/${post.slug}</loc><lastmod>${post.publishedAt ? new Date(post.publishedAt as unknown as string).toISOString().slice(0, 10) : now}</lastmod><changefreq>monthly</changefreq><priority>0.6</priority></url>`);
    }

    const xml = [
      '<?xml version="1.0" encoding="UTF-8"?>',
      '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
      ...urls,
      "</urlset>"
    ].join("\n");

    const dir = process.cwd().endsWith("apps/api")
      ? resolve(process.cwd(), "../web/public")
      : resolve(process.cwd(), "apps/web/public");
    await mkdir(dir, { recursive: true });
    await writeFile(join(dir, "sitemap.xml"), xml, "utf8");
    return { urls: urls.length };
  }

  private async maybeRunTimed(
    name: string,
    intervalMs: number,
    now: Date,
    ran: CronRunItem[],
    skipped: CronSkipItem[],
    action: () => Promise<unknown>
  ) {
    const lastRun = await this.billing.cronLastRun(name);
    if (lastRun && now.getTime() - lastRun.getTime() < intervalMs) {
      skipped.push({ name, nextAt: new Date(lastRun.getTime() + intervalMs).toISOString() });
      return;
    }

    await this.runAction(name, ran, action);
    await this.billing.markCronRun(name, now);
  }

  private async runDaily(name: string, now: Date, ran: CronRunItem[], skipped: CronSkipItem[], action: () => Promise<unknown>) {
    const lastRun = await this.billing.cronLastRun(name);
    if (lastRun && dateKey(lastRun) === dateKey(now)) {
      const nextAt = new Date(now);
      nextAt.setUTCHours(24, 0, 0, 0);
      skipped.push({ name, nextAt: nextAt.toISOString() });
      return;
    }

    await this.runAction(name, ran, action);
    await this.billing.markCronRun(name, now);
  }

  private async runAction(name: string, ran: CronRunItem[], action: () => Promise<unknown>) {
    try {
      ran.push({ name, result: await action(), status: "ran" });
    } catch (error) {
      ran.push({ name, result: error instanceof Error ? error.message : "Action failed", status: "failed" });
    }
  }
}

function hours(value: unknown, fallback: number) {
  return positiveNumber(value, fallback) * 60 * 60 * 1000;
}

function minutes(value: unknown, fallback: number) {
  return positiveNumber(value, fallback) * 60 * 1000;
}

function positiveNumber(value: unknown, fallback: number) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : fallback;
}

function dateKey(date: Date) {
  return date.toISOString().slice(0, 10);
}

function secretEquals(actual: string, expected: string) {
  const actualBuffer = Buffer.from(actual);
  const expectedBuffer = Buffer.from(expected);
  return actualBuffer.length === expectedBuffer.length && timingSafeEqual(actualBuffer, expectedBuffer);
}
