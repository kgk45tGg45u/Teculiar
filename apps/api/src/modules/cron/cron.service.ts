import { Injectable, UnauthorizedException } from "@nestjs/common";
import { timingSafeEqual } from "node:crypto";
import { BillingService } from "../billing/billing.service";
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
