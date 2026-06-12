import { Injectable } from "@nestjs/common";
import { BillingCycle, DomainStatus, InvoiceStatus, OrderItemStatus, OrderStatus, PaymentMethodType, Prisma, ServiceStatus, TransactionStatus } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { addBillingCycle, formatFinalInvoiceNumber, formatTemporaryInvoiceNumber } from "./platform-rules";

@Injectable()
export class BillingRepository {
  constructor(private readonly prisma: PrismaService) {}

  findCoupon(code?: string) {
    if (!code) {
      return null;
    }
    return this.prisma.coupon.findUnique({ where: { code } });
  }

  async createInvoice(input: {
    userId: string;
    teamId?: string;
    status: string;
    issuedAt: Date;
    dueAt: Date;
    subtotalCents: number;
    discountCents: number;
    taxAmountCents: number;
    totalCents: number;
    reverseCharge: boolean;
    taxReason: string;
    customerSnapshot?: Record<string, unknown>;
    sellerSnapshot?: Record<string, unknown>;
    footerLines?: string[];
    orderSnapshot?: Record<string, unknown>;
    adminNotes?: string;
    couponId?: string;
    lines: Array<{
      billingCycle?: string;
      description: string;
      quantity: number;
      unitAmountCents: number;
      subtotalCents: number;
      discountCents: number;
      taxRate: number;
      taxAmountCents: number;
      totalCents: number;
      type?: string;
      orderItemId?: string;
      domainRecordId?: string;
      lifecycleAction?: string;
      metadata?: Record<string, unknown>;
      servicePeriodStart?: string;
      servicePeriodEnd?: string;
      serviceId?: string;
    }>;
  }) {
    const tempInvoiceNumber = formatTemporaryInvoiceNumber(await this.nextInvoiceCounter("invoiceTempCounter", 100001));

    return this.prisma.invoice.create({
      data: {
        invoiceNumber: tempInvoiceNumber,
        tempInvoiceNumber,
        userId: input.userId,
        teamId: input.teamId,
        status: input.status as InvoiceStatus,
        issuedAt: input.issuedAt,
        dueAt: input.dueAt,
        subtotalCents: input.subtotalCents,
        discountCents: input.discountCents,
        taxAmountCents: input.taxAmountCents,
        totalCents: input.totalCents,
        reverseCharge: input.reverseCharge,
        taxReason: input.taxReason,
        customerSnapshot: (input.customerSnapshot ?? {}) as Prisma.InputJsonValue,
        sellerSnapshot: (input.sellerSnapshot ?? {}) as Prisma.InputJsonValue,
        footerLines: (input.footerLines ?? []) as Prisma.InputJsonValue,
        orderSnapshot: (input.orderSnapshot ?? {}) as Prisma.InputJsonValue,
        adminNotes: input.adminNotes,
        couponId: input.couponId,
        items: {
          create: input.lines.map((line) => ({
            billingCycle: line.billingCycle ? (line.billingCycle as BillingCycle) : undefined,
            description: line.description,
            discountCents: line.discountCents,
            domainRecordId: line.domainRecordId,
            lifecycleAction: line.lifecycleAction,
            metadata: (line.metadata ?? {}) as Prisma.InputJsonValue,
            orderItemId: line.orderItemId,
            quantity: line.quantity,
            serviceId: line.serviceId,
            servicePeriodStart: line.servicePeriodStart ? new Date(line.servicePeriodStart) : undefined,
            servicePeriodEnd: line.servicePeriodEnd ? new Date(line.servicePeriodEnd) : undefined,
            subtotalCents: line.subtotalCents,
            taxAmountCents: line.taxAmountCents,
            taxRate: line.taxRate,
            totalCents: line.totalCents,
            type: line.type ?? "CUSTOM",
            unitAmountCents: line.unitAmountCents
          }))
        }
      },
      include: { items: true }
    });
  }

  listInvoices(filters: { status?: string; userId?: string }) {
    return this.prisma.invoice.findMany({
      where: {
        ...filters,
        status: filters.status ? (filters.status as InvoiceStatus) : undefined
      },
      include: { items: true, order: true, user: { select: publicUserSelect }, transactions: true },
      orderBy: { issuedAt: "desc" }
    });
  }

  async listLogs(limit = 100) {
    const take = Math.min(Math.max(Number.isFinite(limit) ? Math.trunc(limit) : 100, 1), 500);
    const [auditLogs, moduleLogs] = await Promise.all([
      this.prisma.auditLog.findMany({
        include: { actor: { select: { email: true, id: true, name: true } } },
        orderBy: { createdAt: "desc" },
        take
      }),
      this.prisma.moduleLog.findMany({
        orderBy: { createdAt: "desc" },
        take
      })
    ]);

    return [
      ...auditLogs.map((log) => ({
        action: log.action,
        actor: log.actor,
        createdAt: log.createdAt,
        id: log.id,
        message: undefined,
        metadata: log.metadata,
        source: "audit",
        status: "RECORDED",
        subject: log.subject,
        subjectId: log.subjectId
      })),
      ...moduleLogs.map((log) => ({
        action: log.action,
        actor: undefined,
        createdAt: log.createdAt,
        id: log.id,
        message: log.errorMessage,
        metadata: { request: log.request, response: log.response },
        source: "module",
        status: log.status,
        subject: log.domainRecordId ? "domain" : log.serviceId ? "service" : "module",
        subjectId: log.domainRecordId ?? log.serviceId ?? log.id
      }))
    ].sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime()).slice(0, take);
  }

  // Paginated logs for the admin Logs page.
  //   kind "cron"   → cron audit rows only (subject = "cron")
  //   kind "system" → everything else: non-cron audit rows + module (provisioning) logs, merged
  // Returns the requested page plus the total count so the UI can render "page X of Y".
  async listLogsPaged(input: { kind: "system" | "cron"; page?: number; pageSize?: number }) {
    const pageSize = Math.min(Math.max(Math.trunc(input.pageSize ?? 25), 1), 100);
    const page = Math.max(Math.trunc(input.page ?? 1), 1);
    const skip = (page - 1) * pageSize;

    const auditToItem = (log: { action: string; actor?: { email: string; id: string; name: string | null } | null; createdAt: Date; id: string; metadata: unknown; subject: string; subjectId: string | null }) => ({
      action: log.action,
      actor: log.actor ?? undefined,
      createdAt: log.createdAt,
      id: log.id,
      message: undefined as string | undefined,
      metadata: log.metadata,
      source: "audit" as const,
      status: "RECORDED",
      subject: log.subject,
      subjectId: log.subjectId
    });

    if (input.kind === "cron") {
      const where = { subject: "cron" };
      const [rows, total] = await Promise.all([
        this.prisma.auditLog.findMany({ where, include: { actor: { select: { email: true, id: true, name: true } } }, orderBy: { createdAt: "desc" }, skip, take: pageSize }),
        this.prisma.auditLog.count({ where })
      ]);
      return { items: rows.map(auditToItem), page, pageSize, total };
    }

    // System logs: non-cron audit rows + module logs. Over-fetch (skip + pageSize) from each table,
    // merge by time, then slice the requested window — correct for typical admin browsing depth.
    const auditWhere = { subject: { not: "cron" } };
    const limit = skip + pageSize;
    const [audits, modules, auditCount, moduleCount] = await Promise.all([
      this.prisma.auditLog.findMany({ where: auditWhere, include: { actor: { select: { email: true, id: true, name: true } } }, orderBy: { createdAt: "desc" }, take: limit }),
      this.prisma.moduleLog.findMany({ orderBy: { createdAt: "desc" }, take: limit }),
      this.prisma.auditLog.count({ where: auditWhere }),
      this.prisma.moduleLog.count()
    ]);
    const items = [
      ...audits.map(auditToItem),
      ...modules.map((log) => ({
        action: log.action,
        actor: undefined,
        createdAt: log.createdAt,
        id: log.id,
        message: log.errorMessage ?? undefined,
        metadata: { request: log.request, response: log.response },
        source: "module" as const,
        status: log.status,
        subject: log.domainRecordId ? "domain" : log.serviceId ? "service" : "module",
        subjectId: log.domainRecordId ?? log.serviceId ?? log.id
      }))
    ]
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
      .slice(skip, skip + pageSize);
    return { items, page, pageSize, total: auditCount + moduleCount };
  }

  // Retention: delete audit + module logs older than the cutoff. Returns how many rows were removed
  // so the cron can report it.
  async pruneLogsOlderThan(cutoff: Date) {
    const [audit, modules] = await Promise.all([
      this.prisma.auditLog.deleteMany({ where: { createdAt: { lt: cutoff } } }),
      this.prisma.moduleLog.deleteMany({ where: { createdAt: { lt: cutoff } } })
    ]);
    return { auditLogs: audit.count, moduleLogs: modules.count };
  }

  findInvoice(id: string) {
    return this.prisma.invoice.findUnique({
      where: { id },
      include: {
        items: { include: { domainRecord: true, orderItem: true, service: { include: { product: { include: { category: true } }, productPrice: true } } } },
        order: { include: { items: { include: { domainRecords: true, product: { include: { category: true } }, service: { include: { product: { include: { category: true } }, productPrice: true } } } } } },
        transactions: true,
        user: { select: publicUserSelect }
      }
    });
  }

  updateInvoiceStatus(id: string, status: string) {
    if (status === "PAID") {
      return this.markInvoicePaid(id);
    }
    return this.prisma.invoice.update({ where: { id }, data: { status: status as InvoiceStatus } });
  }

  findInvoiceForLifecycle(id: string) {
    return this.findInvoice(id);
  }

  async markInvoicePaid(id: string) {
    const invoice = await this.prisma.invoice.findUnique({ where: { id } });
    if (!invoice) {
      throw new Error("Invoice not found");
    }
    if (invoice.finalInvoiceNumber) {
      return this.prisma.invoice.update({
        where: { id },
        data: {
          paidAt: invoice.paidAt ?? new Date(),
          status: "PAID"
        }
      });
    }

    const finalInvoiceNumber = formatFinalInvoiceNumber(await this.nextInvoiceCounter("invoiceFinalCounter", 100001));
    return this.prisma.invoice.update({
      where: { id },
      data: {
        finalInvoiceNumber,
        finalizedAt: new Date(),
        invoiceNumber: finalInvoiceNumber,
        paidAt: new Date(),
        status: "PAID"
      }
    });
  }

  async finalizeFundsDepositInvoice(id: string) {
    const invoice = await this.prisma.invoice.findUnique({
      where: { id },
      include: { items: true }
    });
    if (!invoice) {
      throw new Error("Invoice not found");
    }
    if (invoice.status === "PAID" && invoice.finalInvoiceNumber) {
      return invoice;
    }

    const finalInvoiceNumber = formatFinalInvoiceNumber(await this.nextInvoiceCounter("invoiceFinalCounter", 100001));
    return this.prisma.$transaction(async (tx) => {
      const paid = await tx.invoice.create({
        data: {
          adminNotes: invoice.adminNotes,
          couponId: invoice.couponId,
          currency: invoice.currency,
          customerSnapshot: invoice.customerSnapshot as Prisma.InputJsonValue,
          discountCents: invoice.discountCents,
          dueAt: invoice.dueAt,
          finalInvoiceNumber,
          finalizedAt: new Date(),
          footerLines: invoice.footerLines as Prisma.InputJsonValue,
          invoiceNumber: finalInvoiceNumber,
          issuedAt: invoice.issuedAt,
          orderSnapshot: invoice.orderSnapshot as Prisma.InputJsonValue,
          paidAt: new Date(),
          reverseCharge: invoice.reverseCharge,
          sellerSnapshot: invoice.sellerSnapshot as Prisma.InputJsonValue,
          status: "PAID",
          subtotalCents: invoice.subtotalCents,
          taxAmountCents: invoice.taxAmountCents,
          taxReason: invoice.taxReason,
          teamId: invoice.teamId,
          totalCents: invoice.totalCents,
          userId: invoice.userId,
          items: {
            create: invoice.items.map((item) => ({
              billingCycle: item.billingCycle,
              description: item.description,
              discountCents: item.discountCents,
              domainRecordId: item.domainRecordId,
              lifecycleAction: item.lifecycleAction,
              metadata: item.metadata as Prisma.InputJsonValue,
              orderItemId: item.orderItemId,
              quantity: item.quantity,
              serviceId: item.serviceId,
              servicePeriodEnd: item.servicePeriodEnd,
              servicePeriodStart: item.servicePeriodStart,
              subtotalCents: item.subtotalCents,
              taxAmountCents: item.taxAmountCents,
              taxRate: item.taxRate,
              totalCents: item.totalCents,
              type: item.type,
              unitAmountCents: item.unitAmountCents
            }))
          }
        },
        include: { items: true }
      });

      await tx.transaction.updateMany({ where: { invoiceId: id }, data: { invoiceId: paid.id } });
      await tx.invoice.delete({ where: { id } });

      return paid;
    });
  }

  markInvoiceUnpaid(id: string) {
    return this.prisma.invoice.update({
      where: { id },
      data: { paidAt: null, status: "PENDING" }
    });
  }

  async refundInvoice(id: string) {
    return this.prisma.$transaction(async (tx) => {
      await tx.transaction.updateMany({ where: { invoiceId: id }, data: { status: "REFUNDED" } });
      return tx.invoice.update({
        where: { id },
        data: { status: "REFUNDED" }
      });
    });
  }

  deleteInvoice(id: string) {
    return this.prisma.invoice.delete({ where: { id } });
  }

  createTransaction(input: {
    invoiceId: string;
    method: string;
    status: string;
    amountCents: number;
    currency: string;
    providerReference: string;
    raw: Record<string, unknown>;
  }) {
    return this.prisma.transaction.create({
      data: {
        ...input,
        method: input.method as PaymentMethodType,
        status: input.status as TransactionStatus,
        raw: input.raw as Prisma.InputJsonValue
      }
    });
  }

  updateTransactionStatus(id: string, status: string, raw: Record<string, unknown> = {}) {
    return this.prisma.transaction.update({
      where: { id },
      data: { raw: raw as Prisma.InputJsonValue, status: status as TransactionStatus }
    });
  }

  createSubscription(input: {
    userId: string;
    serviceId: string;
    productPriceId: string;
    billingCycle: string;
    nextInvoiceAt: Date;
    couponId?: string;
  }) {
    return this.prisma.subscription.create({
      data: {
        ...input,
        billingCycle: input.billingCycle as BillingCycle
      }
    });
  }

  findSubscription(id: string) {
    return this.prisma.subscription.findUnique({
      where: { id },
      include: {
        user: { select: publicUserSelect },
        service: { include: { product: { include: { category: true } } } },
        productPrice: true,
        coupon: true
      }
    });
  }

  advanceSubscription(id: string, nextInvoiceAt: Date) {
    return this.prisma.subscription.update({
      where: { id },
      data: { lastInvoiceAt: new Date(), nextInvoiceAt }
    });
  }

  revenueReport() {
    return this.prisma.invoice.aggregate({
      where: { status: "PAID" },
      _sum: { totalCents: true }
    });
  }

  adminDashboardStats() {
    return this.prisma.$transaction([
      this.prisma.invoice.aggregate({ where: { status: "PAID" }, _sum: { totalCents: true } }),
      this.prisma.service.count({ where: { status: "ACTIVE" } }),
      this.prisma.ticket.count({ where: { status: { in: ["NEW", "OPEN", "WAITING_ON_CLIENT", "WAITING_ON_STAFF"] } } }),
      this.prisma.invoice.count({ where: { status: { in: ["FAILED", "OVERDUE"] } } })
    ]);
  }

  dueSubscriptions(invoiceDaysAhead: number, now = new Date()) {
    const until = new Date(now);
    until.setDate(until.getDate() + invoiceDaysAhead);

    return this.prisma.subscription.findMany({
      where: { status: "ACTIVE", nextInvoiceAt: { lte: until }, service: { status: "ACTIVE" } },
      include: {
        user: { select: publicUserSelect },
        service: { include: { product: { include: { category: true } } } },
        productPrice: true,
        coupon: true,
        invoices: { orderBy: { issuedAt: "desc" }, take: 1 }
      }
    });
  }

  balancePayableInvoices() {
    return this.prisma.invoice.findMany({
      where: { status: { in: ["PENDING", "OVERDUE"] }, totalCents: { gt: 0 } },
      include: { user: { select: { balanceCents: true } } },
      orderBy: { issuedAt: "asc" }
    });
  }

  automaticPayableInvoices(now = new Date()) {
    return this.prisma.invoice.findMany({
      where: { dueAt: { lte: now }, status: { in: ["PENDING", "OVERDUE"] }, totalCents: { gt: 0 } },
      include: {
        transactions: true,
        user: {
          select: {
            balanceCents: true,
            paymentMethods: {
              where: { automatic: true, status: "VALID", verifiedAt: { not: null } },
              orderBy: [{ default: "desc" }, { createdAt: "desc" }]
            }
          }
        }
      },
      orderBy: { issuedAt: "asc" }
    });
  }

  debitUserBalance(userId: string, amountCents: number) {
    return this.prisma.user.updateMany({
      where: { id: userId, balanceCents: { gte: amountCents } },
      data: { balanceCents: { decrement: amountCents } }
    });
  }

  overdueUnpaidInvoices(now = new Date()) {
    return this.prisma.invoice.findMany({
      where: { dueAt: { lt: now }, status: { in: ["PENDING", "OVERDUE"] } },
      include: { items: true }
    });
  }

  reminderInvoices(daysBeforeDue: number, now = new Date()) {
    const target = new Date(now);
    target.setDate(target.getDate() + daysBeforeDue);
    target.setHours(0, 0, 0, 0);
    const until = new Date(target);
    until.setDate(until.getDate() + 1);
    return this.prisma.invoice.findMany({
      where: { dueAt: { gte: target, lt: until }, status: { in: ["PENDING", "OVERDUE"] } },
      include: { items: true, order: true, user: { select: publicUserSelect } },
      orderBy: { dueAt: "asc" }
    });
  }

  markInvoiceOverdue(id: string) {
    return this.prisma.invoice.update({ where: { id }, data: { status: "OVERDUE" } });
  }

  suspendServices(serviceIds: string[]) {
    if (serviceIds.length === 0) {
      return Promise.resolve({ count: 0 });
    }

    // Suspension for non-payment applies to every service type with a past-due invoice (hosting,
    // VPS, …) — but NOT domain registrations, which have their own expiry/cancel lifecycle.
    return this.prisma.service.updateMany({
      where: { id: { in: serviceIds }, product: { type: { not: "DOMAIN" } }, status: "ACTIVE" },
      data: { moduleStatus: "payment_issue", status: "SUSPENDED", suspendedAt: new Date() }
    });
  }

  // ACTIVE, non-domain services for the given ids, with product + externalId so billing maintenance
  // can decide which ones to disable on the Virtualmin panel before marking them suspended.
  activeServicesByIds(ids: string[]) {
    if (ids.length === 0) {
      return [];
    }
    return this.prisma.service.findMany({
      where: { id: { in: ids }, product: { type: { not: "DOMAIN" } }, status: "ACTIVE" },
      include: { domainRecords: true, product: true, productPrice: true, user: { select: publicUserSelect } }
    });
  }

  setServiceStatus(id: string, status: string) {
    return this.prisma.service.update({
      where: { id },
      data: {
        status: status as ServiceStatus,
        startedAt: status === "ACTIVE" ? new Date() : undefined,
        suspendedAt: status === "SUSPENDED" ? new Date() : undefined,
        cancelledAt: ["CANCELLED", "TERMINATED"].includes(status) ? new Date() : undefined
      },
      include: { domainRecords: true, product: true, productPrice: true, user: { select: publicUserSelect } }
    });
  }

  servicesForEmailByIds(ids: string[]) {
    if (ids.length === 0) {
      return [];
    }
    return this.prisma.service.findMany({
      where: { id: { in: ids } },
      include: { domainRecords: true, product: true, productPrice: true, user: { select: publicUserSelect } }
    });
  }

  activeHostingServicesForEmailByIds(ids: string[]) {
    if (ids.length === 0) {
      return [];
    }
    return this.prisma.service.findMany({
      where: { id: { in: ids }, product: { type: "SHARED_HOSTING" }, status: "ACTIVE" },
      include: { domainRecords: true, product: true, productPrice: true, user: { select: publicUserSelect } }
    });
  }

  // ── Service / domain activation emails ──────────────────────────────────────
  // The activation email must fire whenever a service/domain reaches ACTIVE, whichever path got it
  // there: immediate provisioning, the status-reconciliation cron, or a client-triggered refresh.
  // Each path records a `service.activation_email` / `domain.activation_email` audit log so the email
  // is sent exactly once; the cron sweep below re-checks the audit log to catch any activation that
  // happened outside the immediate provisioning path.

  serviceForEmail(id: string) {
    return this.prisma.service.findUnique({
      where: { id },
      include: { domainRecords: true, product: true, productPrice: true, user: { select: publicUserSelect } }
    });
  }

  domainForEmail(id: string) {
    return this.prisma.domainRecord.findUnique({
      where: { id },
      include: { user: { select: publicUserSelect }, service: { include: { product: true } } }
    });
  }

  activeHostingServiceIds() {
    return this.prisma.service
      .findMany({ where: { product: { type: "SHARED_HOSTING" }, status: "ACTIVE" }, select: { id: true } })
      .then((rows) => rows.map((row) => row.id));
  }

  activeDomainRecordIds() {
    return this.prisma.domainRecord
      .findMany({ where: { status: "ACTIVE" }, select: { id: true } })
      .then((rows) => rows.map((row) => row.id));
  }

  async notifiedSubjectIds(action: string) {
    const rows = await this.prisma.auditLog.findMany({ where: { action }, select: { subjectId: true } });
    return new Set(rows.map((row) => row.subjectId).filter((value): value is string => Boolean(value)));
  }

  hasAuditLog(action: string, subjectId: string) {
    return this.prisma.auditLog.findFirst({ where: { action, subjectId }, select: { id: true } }).then(Boolean);
  }

  async mergeServiceConfiguration(id: string, patch: Record<string, unknown>) {
    const service = await this.prisma.service.findUnique({ where: { id }, select: { configuration: true } });
    const current = service && typeof service.configuration === "object" && service.configuration !== null && !Array.isArray(service.configuration)
      ? service.configuration as Record<string, unknown>
      : {};
    return this.prisma.service.update({
      where: { id },
      data: { configuration: { ...current, ...patch } as Prisma.InputJsonValue }
    });
  }

  // One-time baseline: mark the accounts that were already active before activation emails existed as
  // "already notified" WITHOUT sending anything, so deploying this feature never retro-blasts the
  // existing customer base. Only activations after the baseline get an email.
  recordActivationBaseline(action: string, subject: string, subjectIds: string[]) {
    if (subjectIds.length === 0) {
      return Promise.resolve({ count: 0 });
    }
    return this.prisma.auditLog.createMany({
      data: subjectIds.map((subjectId) => ({ action, subject, subjectId, metadata: { baseline: true } as Prisma.InputJsonValue }))
    });
  }

  settingNumber(key: string, fallback: number) {
    return this.prisma.systemSetting.findUnique({ where: { key } }).then((setting) => {
      const value = setting?.value;
      return typeof value === "number" ? value : fallback;
    });
  }

  upsertSettingNumber(key: string, value: number) {
    return this.prisma.systemSetting.upsert({
      where: { key },
      create: { key, value },
      update: { value }
    });
  }

  settingString(key: string, fallback = "") {
    return this.prisma.systemSetting.findUnique({ where: { key } }).then((setting) => {
      const value = setting?.value;
      return typeof value === "string" ? value : fallback;
    });
  }

  upsertSettingString(key: string, value: string) {
    return this.prisma.systemSetting.upsert({
      where: { key },
      create: { key, value },
      update: { value }
    });
  }

  listPaymentGateways() {
    return this.prisma.paymentProcessorConfig.findMany({ orderBy: { method: "asc" } });
  }

  paymentGateway(method: string) {
    return this.prisma.paymentProcessorConfig.findUnique({ where: { method: method as PaymentMethodType } });
  }

  upsertPaymentGateway(input: { config: Record<string, unknown>; enabled: boolean; method: string }) {
    return this.prisma.paymentProcessorConfig.upsert({
      where: { method: input.method as PaymentMethodType },
      create: {
        config: input.config as Prisma.InputJsonValue,
        enabled: input.enabled,
        method: input.method as PaymentMethodType
      },
      update: {
        config: input.config as Prisma.InputJsonValue,
        enabled: input.enabled
      }
    });
  }

  addUserBalance(userId: string, amountCents: number) {
    return this.prisma.user.update({
      where: { id: userId },
      data: { balanceCents: { increment: amountCents } },
      select: { balanceCents: true, id: true }
    });
  }

  subtractUserBalance(userId: string, amountCents: number) {
    return this.prisma.user.update({
      where: { id: userId },
      data: { balanceCents: { decrement: amountCents } },
      select: { balanceCents: true, id: true }
    });
  }

  findUserBillingProfile(userId: string) {
    return this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        contacts: {
          orderBy: { createdAt: "desc" },
          select: { address: true, phone: true },
          take: 1
        },
        countryCode: true,
        customerNumber: true,
        customerType: true,
        email: true,
        id: true,
        name: true,
        vatId: true
      }
    });
  }

  findUserForPaymentSetup(userId: string) {
    return this.prisma.user.findUnique({
      where: { id: userId },
      select: { email: true, id: true, name: true }
    });
  }

  listUserPaymentMethods(userId: string) {
    return this.prisma.paymentMethod.findMany({
      where: { userId },
      orderBy: [{ default: "desc" }, { createdAt: "desc" }]
    });
  }

  createPaymentMethod(input: {
    automatic?: boolean;
    default?: boolean;
    label: string;
    mandateId?: string;
    provider: string;
    providerCustomerId?: string;
    providerToken: string;
    status?: string;
    type: string;
    userId: string;
    verifiedAt?: Date;
  }) {
    return this.prisma.paymentMethod.create({
      data: {
        automatic: input.automatic ?? true,
        consentGivenAt: input.verifiedAt,
        default: input.default ?? false,
        label: input.label,
        mandateId: input.mandateId,
        provider: input.provider,
        providerCustomerId: input.providerCustomerId,
        providerToken: input.providerToken,
        status: input.status ?? "PENDING",
        type: input.type as PaymentMethodType,
        userId: input.userId,
        verifiedAt: input.verifiedAt
      }
    });
  }

  updatePaymentMethod(id: string, input: {
    automatic?: boolean;
    default?: boolean;
    label?: string;
    mandateId?: string;
    providerCustomerId?: string;
    providerToken?: string;
    status?: string;
    verifiedAt?: Date;
  }) {
    return this.prisma.paymentMethod.update({
      where: { id },
      data: {
        automatic: input.automatic,
        consentGivenAt: input.verifiedAt,
        default: input.default,
        label: input.label,
        mandateId: input.mandateId,
        providerCustomerId: input.providerCustomerId,
        providerToken: input.providerToken,
        status: input.status,
        verifiedAt: input.verifiedAt
      }
    });
  }

  deletePaymentMethod(id: string, userId: string) {
    return this.prisma.paymentMethod.deleteMany({ where: { id, userId } });
  }

  findPaymentMethod(id: string, userId?: string) {
    return this.prisma.paymentMethod.findFirst({ where: { id, userId } });
  }

  findUserForAutoLogin(userId: string) {
    return this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        email: true,
        id: true,
        name: true,
        userRoles: { select: { role: { select: { slug: true } } } }
      }
    }).then((user) => {
      if (!user) return null;
      return { ...user, roles: user.userRoles.map((ur) => ur.role.slug) };
    });
  }

  findUserPaymentMethodByToken(userId: string, providerToken: string) {
    return this.prisma.paymentMethod.findFirst({ where: { userId, providerToken } });
  }

  findUserPaymentMethodByProvider(userId: string, provider: string, type?: string) {
    return this.prisma.paymentMethod.findFirst({
      where: { userId, provider, providerCustomerId: { not: null }, ...(type ? { type: type as PaymentMethodType } : {}) },
      orderBy: { createdAt: "desc" }
    });
  }

  async setDefaultPaymentMethod(userId: string, id: string) {
    await this.prisma.paymentMethod.updateMany({ where: { userId }, data: { default: false } });
    return this.prisma.paymentMethod.update({ where: { id }, data: { default: true } });
  }

  findTransactionByProviderReference(providerReference: string) {
    return this.prisma.transaction.findUnique({
      where: { providerReference },
      include: { invoice: { include: { transactions: true } } }
    });
  }

  findModuleLogByKey(idempotencyKey: string) {
    return this.prisma.moduleLog.findUnique({ where: { idempotencyKey } });
  }

  findModuleLog(id: string) {
    return this.prisma.moduleLog.findUnique({ where: { id } });
  }

  successfulModuleLogForTarget(input: { action: string; domainRecordId?: string | null; serviceId?: string | null }) {
    return this.prisma.moduleLog.findFirst({
      where: {
        action: input.action,
        domainRecordId: input.domainRecordId ?? undefined,
        serviceId: input.serviceId ?? undefined,
        status: "SUCCEEDED"
      }
    });
  }

  createModuleLog(input: {
    action: string;
    actorId?: string;
    domainRecordId?: string;
    idempotencyKey: string;
    invoiceId?: string;
    moduleName: string;
    orderId?: string;
    orderItemId?: string;
    request?: Record<string, unknown>;
    serviceId?: string;
    status?: string;
  }) {
    return this.prisma.moduleLog.create({
      data: {
        action: input.action,
        actorId: input.actorId,
        domainRecordId: input.domainRecordId,
        idempotencyKey: input.idempotencyKey,
        invoiceId: input.invoiceId,
        moduleName: input.moduleName,
        orderId: input.orderId,
        orderItemId: input.orderItemId,
        request: (input.request ?? {}) as Prisma.InputJsonValue,
        serviceId: input.serviceId,
        status: input.status ?? "RUNNING"
      }
    });
  }

  succeedModuleLog(id: string, response: Record<string, unknown>) {
    return this.prisma.moduleLog.update({
      where: { id },
      data: { response: response as Prisma.InputJsonValue, status: "SUCCEEDED" }
    });
  }

  failModuleLog(id: string, errorMessage: string, response: Record<string, unknown> = {}) {
    return this.prisma.moduleLog.update({
      where: { id },
      data: { errorMessage, response: response as Prisma.InputJsonValue, status: "FAILED" }
    });
  }

  setServiceLifecycleStatus(id: string, status: string, input: { externalId?: string; moduleReference?: string; renewsAt?: Date } = {}) {
    return this.prisma.service.update({
      where: { id },
      data: {
        externalId: input.externalId,
        moduleReference: input.moduleReference,
        moduleStatus: status === "ACTIVE" ? "active" : status.toLowerCase(),
        renewsAt: input.renewsAt,
        startedAt: status === "ACTIVE" ? new Date() : undefined,
        status: status as ServiceStatus,
        suspendedAt: status === "SUSPENDED" ? new Date() : status === "ACTIVE" ? null : undefined,
        terminatedAt: status === "TERMINATED" ? new Date() : undefined
      }
    });
  }

  setDomainLifecycleStatus(id: string, status: string, input: { externalId?: string; expiresAt?: Date } = {}) {
    return this.prisma.domainRecord.update({
      where: { id },
      data: {
        externalId: input.externalId,
        expiresAt: input.expiresAt,
        registrationDate: status === "ACTIVE" ? new Date() : undefined,
        status: status as DomainStatus
      }
    });
  }

  setOrderItemLifecycleStatus(id: string, status: string, input: { errorMessage?: string; providerReference?: string } = {}) {
    return this.prisma.orderItem.update({
      where: { id },
      data: {
        errorMessage: input.errorMessage,
        providerReference: input.providerReference,
        provisioningStatus: status as OrderItemStatus
      }
    });
  }

  setOrderLifecycleStatus(id: string, status: string, notes?: string) {
    return this.prisma.order.update({
      where: { id },
      data: {
        completedAt: status === "COMPLETE" ? new Date() : undefined,
        notes,
        status: status as OrderStatus
      }
    });
  }

  async materializePaidCheckoutUser(invoiceId: string) {
    const invoice = await this.prisma.invoice.findUnique({
      where: { id: invoiceId },
      include: { order: true }
    });
    const snapshot = asRecord(invoice?.orderSnapshot);
    if (!invoice || !isRecord(snapshot.pendingCheckout)) {
      return null;
    }
    const pendingCheckout = snapshot.pendingCheckout;

    const email = typeof pendingCheckout.email === "string" ? pendingCheckout.email.toLowerCase() : undefined;
    const passwordHash = typeof pendingCheckout.passwordHash === "string" ? pendingCheckout.passwordHash : undefined;
    const name = typeof pendingCheckout.name === "string" ? pendingCheckout.name : undefined;
    if (!email || !passwordHash || !name) {
      throw new Error("Paid checkout is missing client registration data");
    }

    const cleanedSnapshot = { ...snapshot };
    delete cleanedSnapshot.pendingCheckout;

    return this.prisma.$transaction(async (tx) => {
      const role = await tx.role.upsert({
        where: { slug: "client" },
        create: { slug: "client", name: "Client" },
        update: {}
      });
      let user = await tx.user.findUnique({ where: { email }, select: { customerNumber: true, email: true, id: true } });
      if (!user) {
        user = await tx.user.create({
          data: {
            countryCode: stringOr(pendingCheckout.countryCode, "DE"),
            customerType: pendingCheckout.customerType === "BUSINESS" ? "BUSINESS" : "INDIVIDUAL",
            email,
            name,
            passwordHash,
            vatId: typeof pendingCheckout.vatId === "string" ? pendingCheckout.vatId : undefined,
            contacts: pendingCheckout.phone || pendingCheckout.address
              ? {
                  create: {
                    address: pendingCheckout.address as Prisma.InputJsonValue,
                    email,
                    name,
                    phone: typeof pendingCheckout.phone === "string" ? pendingCheckout.phone : undefined,
                    type: "BILLING"
                  }
                }
              : undefined,
            userRoles: { create: { roleId: role.id } }
          },
          select: { customerNumber: true, email: true, id: true }
        });
      } else {
        await tx.userRole.upsert({
          where: { userId_roleId: { roleId: role.id, userId: user.id } },
          create: { roleId: role.id, userId: user.id },
          update: {}
        });
      }

      const orderId = invoice.order?.id;
      const serviceIds = (await tx.service.findMany({
        where: {
          OR: [
            { initialInvoiceId: invoiceId },
            ...(orderId ? [{ orderId }] : [])
          ]
        },
        select: { id: true }
      })).map((service) => service.id);

      const customerSnapshot = {
        ...asRecord(invoice.customerSnapshot),
        customerNumber: user.customerNumber
      } as Prisma.InputJsonValue;
      await tx.invoice.update({
        where: { id: invoiceId },
        data: { customerSnapshot, orderSnapshot: cleanedSnapshot as Prisma.InputJsonValue, userId: user.id }
      });
      if (orderId) {
        await tx.order.update({ where: { id: orderId }, data: { customerSnapshot, userId: user.id } });
      }
      if (serviceIds.length > 0) {
        await tx.service.updateMany({ where: { id: { in: serviceIds } }, data: { userId: user.id } });
        await tx.subscription.updateMany({ where: { serviceId: { in: serviceIds } }, data: { userId: user.id } });
      }
      await tx.domainRecord.updateMany({
        where: {
          OR: [
            { initialInvoiceId: invoiceId },
            ...(orderId ? [{ orderId }] : []),
            ...(serviceIds.length > 0 ? [{ serviceId: { in: serviceIds } }] : [])
          ]
        },
        data: { userId: user.id }
      });

      return user;
    });
  }

  createAuditLog(input: { action: string; actorId?: string; metadata?: Record<string, unknown>; subject: string; subjectId?: string }) {
    return this.prisma.auditLog.create({
      data: {
        action: input.action,
        actorId: input.actorId,
        metadata: (input.metadata ?? {}) as Prisma.InputJsonValue,
        subject: input.subject,
        subjectId: input.subjectId
      }
    });
  }

  async suspendServicesForInvoice(id: string) {
    const invoice = await this.findInvoiceForLifecycle(id);
    const serviceIds = invoice?.items.map((item) => item.serviceId).filter((serviceId): serviceId is string => Boolean(serviceId)) ?? [];
    if (serviceIds.length === 0) {
      return { count: 0 };
    }
    return this.prisma.service.updateMany({
      where: { id: { in: [...new Set(serviceIds)] }, status: { notIn: ["TERMINATED", "CANCELLED"] } },
      data: { moduleStatus: "payment_issue", status: "SUSPENDED", suspendedAt: new Date() }
    });
  }

  private async nextInvoiceCounter(key: string, seed: number) {
    const setting = await this.prisma.systemSetting.findUnique({ where: { key } });
    const current = typeof setting?.value === "number" ? setting.value : seed;
    await this.prisma.systemSetting.upsert({
      where: { key },
      create: { key, value: current + 1 },
      update: { value: current + 1 }
    });
    return current;
  }
}

const publicUserSelect = {
  balanceCents: true,
  countryCode: true,
  customerNumber: true,
  customerType: true,
  email: true,
  id: true,
  locale: true,
  name: true,
  segment: true,
  vatId: true
} satisfies Prisma.UserSelect;

function asRecord(value: unknown): Record<string, unknown> {
  return isRecord(value) ? value : {};
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function stringOr(value: unknown, fallback: string) {
  return typeof value === "string" && value.length > 0 ? value : fallback;
}
