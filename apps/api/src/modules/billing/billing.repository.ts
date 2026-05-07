import { Injectable } from "@nestjs/common";
import { BillingCycle, InvoiceStatus, PaymentMethodType, Prisma, ServiceStatus, TransactionStatus } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { formatInvoiceNumber } from "./platform-rules";

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
    const invoiceNumber = formatInvoiceNumber((await this.prisma.invoice.count()) + 1);

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
      include: { items: true, order: { include: { items: true } }, transactions: true, user: { select: publicUserSelect } }
    });
  }

  updateInvoiceStatus(id: string, status: string) {
    return this.prisma.invoice.update({ where: { id }, data: { status: status as InvoiceStatus } });
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
