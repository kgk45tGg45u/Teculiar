import { Injectable, UnauthorizedException } from "@nestjs/common";
import { timingSafeEqual } from "node:crypto";
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
  deepseekApiKey?: string;
  aiBlogEnabled?: boolean;
  aiBlogArticlesPerDay?: number;
  aiBlogIntervalHours?: number;
  aiBlogWordCount?: number;
  aiBlogLanguage?: string;
  aiBlogTopicsPool?: string;
  aiBlogTitlePrompt?: string;
  aiBlogContentPrompt?: string;
  aiBlogExcerptPrompt?: string;
  aiBlogTagsPrompt?: string;
  aiBlogKeywordsPrompt?: string;
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
    // Accept EITHER the server env secret OR the admin-configured secret. The env var used to win
    // outright, which silently ignored the token set in Admin → Cron Settings (a common "my token
    // doesn't work" footgun). Now either one authorizes the request.
    const envSecret = (process.env.CRON_SECRET || "").trim();
    const adminSecret = (settings.cronSecret || "").trim();
    const provided = secret?.trim();
    const matches =
      !!provided &&
      ((envSecret !== "" && secretEquals(provided, envSecret)) || (adminSecret !== "" && secretEquals(provided, adminSecret)));
    const reason = !envSecret && !adminSecret
      ? "Cron secret not configured on the server"
      : !provided
        ? "Cron secret missing from request"
        : !matches
          ? "Cron secret invalid"
          : undefined;
    if (reason) {
      // Log rejected attempts too, so the admin can tell the server is hitting the endpoint
      // but with a wrong/missing token (a common reason cron "silently does nothing").
      await this.billing
        .recordAction({ action: "cron.unauthorized", metadata: { at: now.toISOString(), reason }, subject: "cron" })
        .catch(() => undefined);
      throw new UnauthorizedException(reason);
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
    const startedAtMs = Date.now();

    try {
      // A heartbeat row written on every trigger — proves the server reached the cron, even when
      // every individual job is still within its interval and gets skipped.
      await this.billing
        .recordAction({ action: "cron.started", metadata: { at: now.toISOString() }, subject: "cron" })
        .catch(() => undefined);
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

      await this.runDaily("sitemap", now, ran, skipped, () => this.sitemapStatus());

      if (settings.aiBlogEnabled && settings.deepseekApiKey) {
        const intervalMs = hours(settings.aiBlogIntervalHours, 8);
        await this.maybeRunTimed("aiBlogPost", intervalMs, now, ran, skipped, () =>
          this.cms.generateAiBlogPost(settings, "system")
        );
      } else {
        // Record WHY nothing was generated instead of skipping silently — the previous behaviour
        // made "AI blogging produces no posts" impossible to diagnose from the admin log.
        const reason = !settings.aiBlogEnabled ? "AI blogging is disabled in settings" : "Deepseek API key is not configured";
        await this.runAction("aiBlogPost", ran, async () => ({ reason, skipped: true }));
      }

      await this.billing.recordAction({
        action: "cron.completed",
        metadata: {
          durationMs: Date.now() - startedAtMs,
          ranCount: ran.length,
          failedCount: ran.filter((item) => item.status === "failed").length,
          skippedCount: skipped.length,
          ran: ran.map((item) => ({ name: item.name, result: item.result, status: item.status })),
          skipped: skipped.map((item) => ({ name: item.name, nextAt: item.nextAt }))
        },
        subject: "cron"
      });
      return { ok: ran.every((item) => item.status === "ran"), ran, skipped };
    } finally {
      this.running = false;
    }
  }

  // The sitemap is served live by the web app's dynamic route (apps/web/app/sitemap.xml/route.ts),
  // which always reflects the admin-configured site URL (www) and the current published posts.
  // The cron no longer writes a file (the old approach wrote to the API container's filesystem,
  // which the web app never served). This step just reports the current sitemap shape for the log.
  private async sitemapStatus() {
    const [dePosts, enPosts] = await Promise.all([
      this.cms.listPosts("de", {}).catch(() => []),
      this.cms.listPosts("en", {}).catch(() => [])
    ]);
    const staticPerLocale = SITEMAP_STATIC_PATHS.length;
    const de = staticPerLocale + dePosts.length;
    const en = staticPerLocale + enPosts.length;
    return { urls: de + en, de, en, posts: dePosts.length + enPosts.length, source: "dynamic-route" };
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
    const startedAtMs = Date.now();
    const startedAt = new Date(startedAtMs).toISOString();
    try {
      const result = await action();
      ran.push({ name, result, status: "ran" });
      await this.billing.recordAction({
        action: `cron.${name}`,
        metadata: { result: result ?? null, startedAt, finishedAt: new Date().toISOString(), durationMs: Date.now() - startedAtMs, status: "ran" },
        subject: "cron"
      }).catch(() => undefined);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Action failed";
      ran.push({ name, result: message, status: "failed" });
      await this.billing.recordAction({
        action: `cron.${name}`,
        metadata: { error: message, startedAt, finishedAt: new Date().toISOString(), durationMs: Date.now() - startedAtMs, status: "failed" },
        subject: "cron"
      }).catch(() => undefined);
    }
  }
}

// Mirrors the static paths in apps/web/app/sitemap.xml/route.ts — used only to count URLs for the log.
const SITEMAP_STATIC_PATHS = [
  "", "/domains", "/domains/pricing", "/hosting", "/webhosting", "/virtual-servers", "/vps",
  "/webdesign", "/it-losungen", "/blog", "/uber-uns", "/kontakt", "/knowledgebase",
  "/legal/agb", "/legal/datenschutz", "/legal/impressum"
];

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
