import { Injectable } from "@nestjs/common";
import { BillingCycle, InvoiceStatus, PaymentMethodType, Prisma, TransactionStatus } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";

@Injectable()
export class BillingRepository {
  constructor(private readonly prisma: PrismaService) {}

  findCoupon(code?: string) {
    if (!code) {
      return null;
    }
    return this.prisma.coupon.findUnique({ where: { code } });
  }

  createInvoice(input: {
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
    return this.prisma.invoice.create({
      data: {
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
      include: { items: true, user: true, transactions: true },
      orderBy: { issuedAt: "desc" }
    });
  }

  findInvoice(id: string) {
    return this.prisma.invoice.findUnique({
      where: { id },
      include: { items: true, transactions: true }
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
        user: true,
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
}
