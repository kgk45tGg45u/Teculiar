import { Injectable, Logger, Optional, UnauthorizedException } from "@nestjs/common";
import { timingSafeEqual } from "node:crypto";
import { ConnectionRegistry } from "../../tenancy/connection-registry.service";
import { ControlPlaneService } from "../../tenancy/control-plane.service";
import { getTenantContext, runWithTenant } from "../../tenancy/tenant-context";
import { buildTenantContext } from "../../tenancy/tenant-context-factory";
import { BillingService } from "../billing/billing.service";
import { CmsService } from "../cms/cms.service";
import { OrdersService } from "../orders/orders.service";
import { ProductsService } from "../products/products.service";
import { ThemeService } from "../theme/theme.service";
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

type CronPassResult = {
  ok: boolean;
  ran: CronRunItem[];
  skipped: CronSkipItem[];
  running?: boolean;
};

/** Compact per-tenant line of the public /cron response (Phase 3.2) — counts, not payloads. */
type TenantCronSummary = {
  tenant: string;
  ok: boolean;
  ran: number;
  failed: number;
  skipped: number;
  failedJobs?: string[];
  error?: string;
};

/** Compact /cron response so a plain curl (and its logfile) stays readable (Phase 3.2). */
export type CronSummary = {
  ok: boolean;
  running?: boolean;
  tenants: number;
  ran: number;
  failed: number;
  skipped: number;
  perTenant: TenantCronSummary[];
};

@Injectable()
export class CronService {
  private readonly logger = new Logger("Cron");
  private running = false;
  // Keyed per tenant (Phase 3.1): one tenant's long AI generation must not block another's trigger.
  private readonly aiBlogRunning = new Set<string>();

  constructor(
    private readonly billing: BillingService,
    private readonly cms: CmsService,
    private readonly orders: OrdersService,
    private readonly products: ProductsService,
    private readonly theme: ThemeService,
    private readonly tickets: TicketsService,
    // Optional so single-tenant deploys and the unit-test harness can omit the tenancy layer.
    @Optional() private readonly controlPlane?: ControlPlaneService,
    @Optional() private readonly registry?: ConnectionRegistry
  ) {}

  async runAuthorized(secret?: string, now = new Date()): Promise<CronSummary> {
    // Multi-tenant fleet mode (Phase 3.1): the trigger arrived WITHOUT a tenant host (e.g. the
    // operator's crontab hitting the API container directly). There is no tenant DB to read an
    // admin-configured secret from, so only the server env secret authorizes, and the run then
    // iterates every active tenant. A trigger on a tenant host keeps today's behaviour: it
    // authorizes against env OR that tenant's admin secret and runs ONLY that tenant.
    const contextTenant = getTenantContext()?.tenant ?? null;
    const fleetMode = Boolean(this.controlPlane?.enabled) && !contextTenant;
    const settings = fleetMode ? undefined : await this.billing.cronSettings();
    // Accept EITHER the server env secret OR the admin-configured secret. The env var used to win
    // outright, which silently ignored the token set in Admin → Cron Settings (a common "my token
    // doesn't work" footgun). Now either one authorizes the request.
    const envSecret = (process.env.CRON_SECRET || "").trim();
    const adminSecret = (settings?.cronSecret || "").trim();
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
      if (fleetMode) {
        this.logger.warn(`unauthorized fleet trigger: ${reason}`); // no tenant DB to audit-log into
      } else {
        await this.billing
          .recordAction({ action: "cron.unauthorized", metadata: { at: now.toISOString(), reason }, subject: "cron" })
          .catch(() => undefined);
      }
      throw new UnauthorizedException(reason);
    }

    if (fleetMode) {
      return this.runAllTenants(now);
    }
    return summarize(await this.run(now, settings), contextTenant?.subdomain ?? "default");
  }

  /**
   * Fleet pass (Phase 3.1): iterate every ACTIVE control-plane tenant and execute its jobs inside
   * that tenant's context, so every `this.prisma` call inside the job services lands in the
   * tenant's OWN database — per-tenant due-clocks, per-tenant results, no cross-tenant reads.
   * Suspended tenants are skipped (their data stays frozen until reactivation). One tenant's
   * failure never stops the others.
   */
  private async runAllTenants(now: Date): Promise<CronSummary> {
    if (this.running) {
      return { ok: true, running: true, tenants: 0, ran: 0, failed: 0, skipped: 0, perTenant: [] };
    }
    if (!this.controlPlane || !this.registry) {
      throw new Error("Cron fleet mode requires the tenancy layer (control-plane + connection registry).");
    }
    this.running = true;
    try {
      const tenants = (await this.controlPlane.list()).filter((tenant) => tenant.status === "active");
      const perTenant: TenantCronSummary[] = [];
      for (const tenant of tenants) {
        try {
          const ctx = await buildTenantContext(tenant, this.controlPlane, this.registry);
          const result = await runWithTenant(ctx, () => this.runPass(now));
          perTenant.push(tenantSummary(tenant.subdomain, result));
        } catch (error) {
          const message = error instanceof Error ? error.message : "tenant cron pass failed";
          this.logger.error(`tenant ${tenant.subdomain} cron pass failed: ${message}`);
          perTenant.push({ tenant: tenant.subdomain, ok: false, ran: 0, failed: 1, skipped: 0, error: message });
        }
      }
      const summary: CronSummary = {
        ok: perTenant.every((tenant) => tenant.ok),
        tenants: perTenant.length,
        ran: perTenant.reduce((sum, tenant) => sum + tenant.ran, 0),
        failed: perTenant.reduce((sum, tenant) => sum + tenant.failed, 0),
        skipped: perTenant.reduce((sum, tenant) => sum + tenant.skipped, 0),
        perTenant
      };
      this.logger.log(
        `fleet run: ${summary.tenants} tenants — ${summary.ran} ran, ${summary.failed} failed, ${summary.skipped} skipped`
      );
      return summary;
    } finally {
      this.running = false;
    }
  }

  /**
   * Single pass for the CURRENT context's tenant (admin "Run now" + single-tenant/tenant-host
   * triggers). `force` (admin "Run now") ignores the interval clocks of the timed jobs — the
   * admin pressing the button expects hosting/domain checks to actually run, not to be skipped
   * because the scheduled cron happened minutes earlier. Daily jobs (invoice reminders) keep
   * their once-per-day guard even when forced, so a manual run never double-mails customers.
   */
  async run(now = new Date(), preloadedSettings?: CronSettings, options: { force?: boolean } = {}): Promise<CronPassResult> {
    if (this.running) {
      return { ok: true, ran: [], running: true, skipped: [] };
    }
    this.running = true;
    try {
      return await this.runPass(now, preloadedSettings, options);
    } finally {
      this.running = false;
    }
  }

  private async runPass(now: Date, preloadedSettings?: CronSettings, options: { force?: boolean } = {}): Promise<CronPassResult> {
    const ran: CronRunItem[] = [];
    const skipped: CronSkipItem[] = [];
    const settings = preloadedSettings ?? await this.billing.cronSettings();
    const startedAtMs = Date.now();
    // Print to stdout/stderr so a manual run on the server (curl) and the captured API process logs
    // both show how long each task took, not just the admin DB action log.
    this.logger.log(`run started at ${now.toISOString()}${tenantTag()}`);

    // A heartbeat row written on every trigger — proves the server reached the cron, even when
    // every individual job is still within its interval and gets skipped. In multi-tenant mode this
    // (and every job log below) lands in the CURRENT tenant's own DB via the context-bound Prisma.
    await this.billing
      .recordAction({ action: "cron.started", metadata: { at: now.toISOString() }, subject: "cron" })
      .catch(() => undefined);
    const force = Boolean(options.force);
    await this.maybeRunTimed("domainPrices", hours(settings.domainPriceUpdateHours, 24), now, ran, skipped, () =>
      this.orders.syncDomainPrices(), force
    );
    await this.maybeRunTimed("domainExpirations", hours(settings.domainExpirationUpdateHours, 12), now, ran, skipped, () =>
      this.products.refreshAllDomainExpirations(), force
    );
    await this.maybeRunTimed("domainStatuses", minutes(settings.domainStatusUpdateMinutes, 15), now, ran, skipped, () =>
      this.products.refreshAllDomainStatuses(), force
    );
    await this.runAction("billingMaintenance", ran, () => this.billing.runAdminMaintenance(now));
    await this.runDaily("invoiceReminders", now, ran, skipped, () =>
      this.billing.sendInvoiceReminders(now, positiveNumber(settings.invoiceReminderDaysBeforeDue, 3))
    );
    await this.runAction("ticketsClose", ran, () =>
      this.tickets.closeAnsweredTickets(positiveNumber(settings.ticketAutoCloseHours, 24), now)
    );
    await this.maybeRunTimed("hostingStatuses", minutes(settings.hostingStatusUpdateMinutes, 15), now, ran, skipped, () =>
      this.products.refreshAllHostingStatuses(), force
    );
    // Send the hosting/domain activation emails for anything that reached ACTIVE since the last run
    // (the status steps above are what flip a delayed-provisioning account active). Idempotent, so
    // it is safe to run on every trigger.
    await this.runAction("activationEmails", ran, () => this.billing.notifyPendingActivations());
    await this.maybeRunTimed("mailboxes", minutes(settings.mailboxCheckMinutes, 5), now, ran, skipped, () =>
      this.tickets.importMailboxTickets(settings as Record<string, unknown>), force
    );

    await this.runDaily("sitemap", now, ran, skipped, () => this.sitemapStatus());

    if (settings.aiBlogEnabled && settings.deepseekApiKey) {
      const intervalMs = hours(settings.aiBlogIntervalHours, 8);
      await this.maybeTriggerAiBlog(intervalMs, now, ran, skipped, settings);
    } else {
      // Record WHY nothing was generated instead of skipping silently — the previous behaviour
      // made "AI blogging produces no posts" impossible to diagnose from the admin log.
      const reason = !settings.aiBlogEnabled ? "AI blogging is disabled in settings" : "Deepseek API key is not configured";
      await this.runAction("aiBlogPost", ran, async () => ({ reason, skipped: true }));
    }

    const totalMs = Date.now() - startedAtMs;
    const failedCount = ran.filter((item) => item.status === "failed").length;
    await this.billing.recordAction({
      action: "cron.completed",
      metadata: {
        durationMs: totalMs,
        ranCount: ran.length,
        failedCount,
        skippedCount: skipped.length,
        ran: ran.map((item) => ({ name: item.name, result: item.result, status: item.status })),
        skipped: skipped.map((item) => ({ name: item.name, nextAt: item.nextAt }))
      },
      subject: "cron"
    });
    if (skipped.length) {
      this.logger.log(`skipped ${skipped.length}: ${skipped.map((item) => item.name).join(", ")}`);
    }
    this.logger.log(`completed in ${totalMs}ms — ${ran.length} ran, ${failedCount} failed, ${skipped.length} skipped${tenantTag()}`);
    return { ok: ran.every((item) => item.status === "ran"), ran, skipped };
  }

  // The sitemap is served live by the web app's dynamic route (apps/web/app/sitemap.xml/route.ts),
  // which always reflects the admin-configured site URL (www), the active theme's per-locale page
  // slugs (with hreflang alternates) and the current published posts. The cron no longer writes a
  // file (the old approach wrote to the API container's filesystem, which the web app never served).
  // This step just reports the current sitemap shape for the log; it mirrors the route's URL math —
  // (theme pages + extra paths) × configured locales + posts per locale — so the count stays accurate.
  private async sitemapStatus() {
    const theme = await this.theme.storefrontTheme().catch(() => null);
    const locales = theme?.languages?.length ? theme.languages : ["de", "en"];
    // Mirror the route: theme pages + extra paths per locale, or the flat fallback list if no theme.
    const pagesPerLocale = theme ? theme.pages.length + SITEMAP_EXTRA_PATHS.length : SITEMAP_FALLBACK_PATHS.length;
    const perLocalePostCounts = await Promise.all(
      locales.map((locale) => this.cms.listPosts(locale, {}).then((p) => p.length).catch(() => 0))
    );
    const posts = perLocalePostCounts.reduce((sum, n) => sum + n, 0);
    const urls = pagesPerLocale * locales.length + posts;
    return { urls, locales, pagesPerLocale, posts, source: "dynamic-route" };
  }

  private async maybeRunTimed(
    name: string,
    intervalMs: number,
    now: Date,
    ran: CronRunItem[],
    skipped: CronSkipItem[],
    action: () => Promise<unknown>,
    force = false
  ) {
    const lastRun = force ? undefined : await this.billing.cronLastRun(name);
    if (lastRun && now.getTime() - lastRun.getTime() < intervalMs) {
      skipped.push({ name, nextAt: new Date(lastRun.getTime() + intervalMs).toISOString() });
      return;
    }

    // Only advance the interval clock on success. A failed run leaves `lastRun` untouched so the job
    // retries on the next cron trigger instead of waiting a full interval after a failure.
    const ok = await this.runAction(name, ran, action);
    if (ok) {
      await this.billing.markCronRun(name, now);
    }
  }

  // AI article generation is heavy: each article makes several Deepseek calls (angle + up to 3
  // article attempts + a translation), which can take a minute or more. Running it INLINE blocked
  // the main 15-minute cron and risked overrunning the next trigger (whose `this.running` guard
  // then skips the whole run). So the main cron only TRIGGERS the AI job here — when the interval
  // is due it marks the run, returns immediately, and the generation proceeds in the background,
  // logging its own `cron.aiBlogPost` result/error when it finishes.
  private async maybeTriggerAiBlog(
    intervalMs: number,
    now: Date,
    ran: CronRunItem[],
    skipped: CronSkipItem[],
    settings: CronSettings
  ) {
    const lastRun = await this.billing.cronLastRun("aiBlogPost");
    if (lastRun && now.getTime() - lastRun.getTime() < intervalMs) {
      skipped.push({ name: "aiBlogPost", nextAt: new Date(lastRun.getTime() + intervalMs).toISOString() });
      return;
    }
    const tenantKey = currentTenantKey();
    if (this.aiBlogRunning.has(tenantKey)) {
      ran.push({ name: "aiBlogPost", result: { reason: "previous AI generation still running", triggered: false }, status: "ran" });
      return;
    }
    this.aiBlogRunning.add(tenantKey);
    ran.push({ name: "aiBlogPost", result: { triggered: true }, status: "ran" });
    // Write a visible "triggered" log immediately (the background run logs the result when it finishes),
    // so the admin always sees AI activity in the cron log instead of nothing while it generates.
    await this.billing
      .recordAction({ action: "cron.aiBlogPost", metadata: { async: true, startedAt: now.toISOString(), status: "ran", triggered: true }, subject: "cron" })
      .catch(() => undefined);
    // The interval clock is advanced from the trigger time, but ONLY if generation succeeds (done in
    // the background runner). A failed generation leaves lastRun untouched so the next cron retries it.
    // The tenant context propagates into the background run via AsyncLocalStorage (it was captured
    // when this async chain started inside runWithTenant), so generation writes to the right DB.
    void this.runAiBlogInBackground(settings, now, tenantKey);
  }

  private async runAiBlogInBackground(settings: CronSettings, runAt: Date, tenantKey: string) {
    const startedAtMs = Date.now();
    const startedAt = new Date(startedAtMs).toISOString();
    try {
      const result = await this.cms.generateAiBlogPost(settings, "system");
      await this.billing.markCronRun("aiBlogPost", runAt);
      this.logger.log(`aiBlogPost (async) ran in ${Date.now() - startedAtMs}ms`);
      await this.billing
        .recordAction({
          action: "cron.aiBlogPost",
          metadata: { async: true, result: result ?? null, startedAt, finishedAt: new Date().toISOString(), durationMs: Date.now() - startedAtMs, status: "ran" },
          subject: "cron"
        })
        .catch(() => undefined);
    } catch (error) {
      const message = error instanceof Error ? error.message : "AI blog generation failed";
      this.logger.error(`aiBlogPost (async) failed in ${Date.now() - startedAtMs}ms: ${message}`);
      // Intentionally do NOT markCronRun — a failed generation must retry on the next cron trigger.
      await this.billing
        .recordAction({
          action: "cron.aiBlogPost",
          metadata: { async: true, error: message, startedAt, finishedAt: new Date().toISOString(), durationMs: Date.now() - startedAtMs, status: "failed" },
          subject: "cron"
        })
        .catch(() => undefined);
    } finally {
      this.aiBlogRunning.delete(tenantKey);
    }
  }

  private async runDaily(name: string, now: Date, ran: CronRunItem[], skipped: CronSkipItem[], action: () => Promise<unknown>) {
    const lastRun = await this.billing.cronLastRun(name);
    if (lastRun && dateKey(lastRun) === dateKey(now)) {
      const nextAt = new Date(now);
      nextAt.setUTCHours(24, 0, 0, 0);
      skipped.push({ name, nextAt: nextAt.toISOString() });
      return;
    }

    // Only record the day as done when the job succeeds, so a failed daily job retries next trigger.
    const ok = await this.runAction(name, ran, action);
    if (ok) {
      await this.billing.markCronRun(name, now);
    }
  }

  private async runAction(name: string, ran: CronRunItem[], action: () => Promise<unknown>): Promise<boolean> {
    const startedAtMs = Date.now();
    const startedAt = new Date(startedAtMs).toISOString();
    try {
      const result = await action();
      const durationMs = Date.now() - startedAtMs;
      ran.push({ name, result, status: "ran" });
      this.logger.log(`${name} ran in ${durationMs}ms`);
      await this.billing.recordAction({
        action: `cron.${name}`,
        metadata: { result: result ?? null, startedAt, finishedAt: new Date().toISOString(), durationMs, status: "ran" },
        subject: "cron"
      }).catch(() => undefined);
      return true;
    } catch (error) {
      const message = error instanceof Error ? error.message : "Action failed";
      const durationMs = Date.now() - startedAtMs;
      ran.push({ name, result: message, status: "failed" });
      this.logger.error(`${name} failed in ${durationMs}ms: ${message}`);
      await this.billing.recordAction({
        action: `cron.${name}`,
        metadata: { error: message, startedAt, finishedAt: new Date().toISOString(), durationMs, status: "failed" },
        subject: "cron"
      }).catch(() => undefined);
      return false;
    }
  }
}

// Mirror apps/web/app/sitemap.xml/route.ts — used only to count URLs for the log.
// EXTRA_PATHS: public pages that aren't theme pages (added on top of the theme pages per locale).
const SITEMAP_EXTRA_PATHS = ["/domains/pricing", "/knowledgebase"];
// FALLBACK_PATHS: the flat per-locale list the route emits when the theme can't be fetched.
const SITEMAP_FALLBACK_PATHS = [
  "", "/webhosting", "/virtual-servers", "/reseller", "/domains", "/it-losungen", "/webdesign",
  "/blog", "/uber-uns", "/kontakt", "/legal/impressum", "/legal/datenschutz", "/legal/agb",
  ...SITEMAP_EXTRA_PATHS
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

/** Stable per-tenant key for process-level guards; "default" in single-tenant fallback. */
function currentTenantKey(): string {
  return getTenantContext()?.tenant?.id ?? "default";
}

/** " (tenant <subdomain>)" suffix for stdout lines during a fleet pass; empty in single-tenant. */
function tenantTag(): string {
  const subdomain = getTenantContext()?.tenant?.subdomain;
  return subdomain ? ` (tenant ${subdomain})` : "";
}

function tenantSummary(tenant: string, result: CronPassResult): TenantCronSummary {
  const failedJobs = result.ran.filter((item) => item.status === "failed").map((item) => item.name);
  return {
    tenant,
    ok: result.ok,
    ran: result.ran.length - failedJobs.length,
    failed: failedJobs.length,
    skipped: result.skipped.length,
    ...(failedJobs.length ? { failedJobs } : {})
  };
}

/** Collapse a detailed pass result into the compact /cron response (Phase 3.2). */
function summarize(result: CronPassResult, tenant: string): CronSummary {
  if (result.running) {
    return { ok: true, running: true, tenants: 0, ran: 0, failed: 0, skipped: 0, perTenant: [] };
  }
  const line = tenantSummary(tenant, result);
  return {
    ok: line.ok,
    tenants: 1,
    ran: line.ran,
    failed: line.failed,
    skipped: line.skipped,
    perTenant: [line]
  };
}
