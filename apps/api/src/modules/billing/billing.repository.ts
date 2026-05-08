import { Injectable } from "@nestjs/common";
import { BillingCycle, InvoiceStatus, PaymentMethodType, Prisma, ServiceStatus, TransactionStatus } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { formatPaidInvoiceNumber, formatUnpaidInvoiceNumber } from "./platform-rules";

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
    couponId?: string;
    lines: Array<{
      description: string;
      quantity: number;
      unitAmountCents: number;
      subtotalCents: number;
      discountCents: number;
      taxRate: number;
      taxAmountCents: number;
      totalCents: number;
      servicePeriodStart?: string;
      servicePeriodEnd?: string;
      serviceId?: string;
    }>;
  }) {
    // Unpaid invoices get N-XXXXXX; paid invoices get plain XXXXXX
    const isPaid = input.status === "PAID";
    const seqKey = isPaid ? "invoiceSeqPaid" : "invoiceSeqUnpaid";
    const seq = await this.nextSequence(seqKey);
    const invoiceNumber = isPaid ? formatPaidInvoiceNumber(seq) : formatUnpaidInvoiceNumber(seq);

    return this.prisma.invoice.create({
      data: {
        invoiceNumber,
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
        couponId: input.couponId,
        items: {
          create: input.lines.map((line) => ({
            ...line,
            servicePeriodStart: line.servicePeriodStart ? new Date(line.servicePeriodStart) : undefined,
            servicePeriodEnd: line.servicePeriodEnd ? new Date(line.servicePeriodEnd) : undefined
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
      include: { items: true, user: { select: publicUserSelect }, transactions: true },
      orderBy: { issuedAt: "desc" }
    });
  }

  findInvoice(id: string) {
    return this.prisma.invoice.findUnique({
      where: { id },
      include: {
        items: true,
        order: { include: { items: true } },
        transactions: true,
        user: {
          select: {
            ...publicUserSelect,
            services: { select: { id: true, status: true, product: { select: { name: true, type: true } } } },
            domainRecords: { select: { id: true, domain: true, status: true } }
          }
        }
      }
    });
  }

  updateInvoiceStatus(id: string, status: string, paidAt?: Date) {
    return this.prisma.invoice.update({
      where: { id },
      data: {
        status: status as InvoiceStatus,
        paidAt: status === "PAID" ? (paidAt ?? new Date()) : undefined
      }
    });
  }

  /**
   * When an invoice transitions to PAID we assign it a permanent paid invoice number.
   * The old N-XXXXXX number is replaced with a plain XXXXXX number.
   */
  async markInvoicePaid(id: string) {
    const seq = await this.nextSequence("invoiceSeqPaid");
    const invoiceNumber = formatPaidInvoiceNumber(seq);
    return this.prisma.invoice.update({
      where: { id },
      data: { status: "PAID", paidAt: new Date(), invoiceNumber }
    });
  }

  markInvoiceUnpaid(id: string) {
    return this.prisma.invoice.update({
      where: { id },
      data: { status: "UNPAID", paidAt: null }
    });
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

  activateService(id: string) {
    return this.prisma.service.update({
      where: { id },
      data: { status: "ACTIVE", startedAt: new Date(), suspendedAt: null }
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

  /** Find all services linked to invoice items (for activation on payment) */
  findInvoiceServices(invoiceId: string) {
    return this.prisma.invoiceItem.findMany({
      where: { invoiceId, serviceId: { not: null } },
      include: {
        service: {
          include: {
            product: true,
            domainRecords: true,
            orderItems: { orderBy: { createdAt: "desc" }, take: 1 }
          }
        }
      }
    });
  }

  /** Find all clients (users with client role) */
  listClients() {
    return this.prisma.user.findMany({
      where: { userRoles: { some: { role: { slug: "client" } } } },
      select: {
        id: true,
        name: true,
        email: true,
        countryCode: true,
        customerType: true,
        vatId: true,
        createdAt: true,
        services: { select: { id: true, status: true } },
        domainRecords: { select: { id: true, domain: true } },
        invoices: { select: { id: true, status: true, totalCents: true }, orderBy: { issuedAt: "desc" }, take: 5 }
      },
      orderBy: { createdAt: "desc" }
    });
  }

  findClient(id: string) {
    return this.prisma.user.findUnique({
      where: { id },
      include: {
        services: { include: { product: true, productPrice: true, domainRecords: true } },
        domainRecords: true,
        invoices: { include: { items: true }, orderBy: { issuedAt: "desc" } },
        contacts: true
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

  /** Atomic sequence counter stored in SystemSetting */
  private async nextSequence(key: string): Promise<number> {
    // Use a raw upsert+increment to avoid race conditions
    await this.prisma.systemSetting.upsert({
      where: { key },
      create: { key, value: 1 },
      update: { value: { increment: 1 } as unknown as Prisma.InputJsonValue }
    });
    const row = await this.prisma.systemSetting.findUnique({ where: { key } });
    return typeof row?.value === "number" ? row.value : 1;
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
