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

  findInvoice(id: string) {
    return this.prisma.invoice.findUnique({
      where: { id },
      include: {
        items: { include: { domainRecord: true, orderItem: true, service: { include: { product: true, productPrice: true } } } },
        order: { include: { items: { include: { domainRecords: true, product: true, service: { include: { product: true, productPrice: true } } } } } },
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

  markInvoiceUnpaid(id: string) {
    return this.prisma.invoice.update({
      where: { id },
      data: { status: "UNPAID" }
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
        service: { include: { product: true } },
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
      where: { status: "ACTIVE", nextInvoiceAt: { lte: until } },
      include: {
        user: { select: publicUserSelect },
        service: { include: { product: true } },
        productPrice: true,
        coupon: true,
        invoices: { orderBy: { issuedAt: "desc" }, take: 1 }
      }
    });
  }

  overdueUnpaidInvoices(now = new Date()) {
    return this.prisma.invoice.findMany({
      where: { dueAt: { lt: now }, status: { in: ["UNPAID", "OVERDUE"] } },
      include: { items: true }
    });
  }

  markInvoiceOverdue(id: string) {
    return this.prisma.invoice.update({ where: { id }, data: { status: "OVERDUE" } });
  }

  suspendServices(serviceIds: string[]) {
    if (serviceIds.length === 0) {
      return Promise.resolve({ count: 0 });
    }

    return this.prisma.service.updateMany({
      where: { id: { in: serviceIds }, status: { notIn: ["TERMINATED", "CANCELLED"] } },
      data: { status: "SUSPENDED", suspendedAt: new Date() }
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
      }
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
  countryCode: true,
  customerType: true,
  email: true,
  id: true,
  locale: true,
  name: true,
  segment: true,
  vatId: true
} satisfies Prisma.UserSelect;
