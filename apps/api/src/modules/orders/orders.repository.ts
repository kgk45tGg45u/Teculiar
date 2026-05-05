import { Injectable } from "@nestjs/common";
import { BillingCycle, OrderItemStatus, PaymentMethodType, Prisma, ProductType, ServiceStatus } from "@prisma/client";
import { addBillingCycle, formatOrderNumber } from "../billing/platform-rules";
import { PrismaService } from "../prisma/prisma.service";

export type PricedOrderItem = {
  billingCycle: string;
  configuration: Record<string, unknown>;
  description: string;
  domainName?: string;
  productId: string;
  productPriceId: string;
  quantity: number;
  setupFeeCents: number;
  totalCents: number;
  type: string;
  unitAmountCents: number;
};

@Injectable()
export class OrdersRepository {
  constructor(private readonly prisma: PrismaService) {}

  findProduct(productId: string) {
    return this.prisma.product.findFirst({
      where: { id: productId, active: true },
      include: { prices: { where: { active: true } }, configs: true }
    });
  }

  listHomepageProducts() {
    return this.prisma.product.findMany({
      where: { active: true, homepageVisible: true },
      include: { prices: { where: { active: true } }, configs: true },
      orderBy: { sortOrder: "asc" }
    });
  }

  async createOrder(input: {
    customerSnapshot: Record<string, unknown>;
    invoiceId: string;
    items: PricedOrderItem[];
    setupFeeCents: number;
    subtotalCents: number;
    taxAmountCents: number;
    totalCents: number;
    userId: string;
  }) {
    const orderNumber = formatOrderNumber((await this.prisma.order.count()) + 1);

    return this.prisma.order.create({
      data: {
        customerSnapshot: input.customerSnapshot as Prisma.InputJsonValue,
        invoiceId: input.invoiceId,
        orderNumber,
        items: {
          create: input.items.map((item) => ({
            billingCycle: item.billingCycle as BillingCycle,
            configuration: item.configuration as Prisma.InputJsonValue,
            description: item.description,
            domainName: item.domainName,
            productId: item.productId,
            productPriceId: item.productPriceId,
            quantity: item.quantity,
            setupFeeCents: item.setupFeeCents,
            totalCents: item.totalCents,
            type: item.type as ProductType,
            unitAmountCents: item.unitAmountCents
          }))
        },
        setupFeeCents: input.setupFeeCents,
        subtotalCents: input.subtotalCents,
        taxAmountCents: input.taxAmountCents,
        totalCents: input.totalCents,
        userId: input.userId
      },
      include: { invoice: true, items: true, user: true }
    });
  }

  listOrders() {
    return this.prisma.order.findMany({
      include: {
        invoice: true,
        items: { include: { product: true, service: true } },
        user: true
      },
      orderBy: { createdAt: "desc" }
    });
  }

  findOrder(id: string) {
    return this.prisma.order.findUnique({
      where: { id },
      include: {
        invoice: { include: { items: true, transactions: true } },
        items: { include: { product: true, service: true } },
        user: true
      }
    });
  }

  findOrderForActivation(id: string) {
    return this.prisma.order.findUnique({
      where: { id },
      include: {
        invoice: true,
        items: { orderBy: { createdAt: "asc" } },
        user: true
      }
    });
  }

  markOrderPaid(id: string, method?: string) {
    return this.prisma.order.update({
      where: { id },
      data: {
        paidAt: new Date(),
        paymentMethod: method ? (method as PaymentMethodType) : undefined,
        status: "PAID"
      }
    });
  }

  markOrderProvisioning(id: string) {
    return this.prisma.order.update({ where: { id }, data: { status: "PROVISIONING" } });
  }

  markOrderComplete(id: string) {
    return this.prisma.order.update({
      where: { id },
      data: { completedAt: new Date(), status: "COMPLETE" }
    });
  }

  markOrderFailed(id: string, message?: string) {
    return this.prisma.order.update({
      where: { id },
      data: { notes: message, status: "FAILED" }
    });
  }

  async createServiceForItem(
    item: { id: string; billingCycle: string; configuration: unknown; productId: string; productPriceId: string },
    userId: string,
    status: string
  ) {
    const service = await this.prisma.service.create({
      data: {
        configuration: (item.configuration ?? {}) as Prisma.InputJsonValue,
        productId: item.productId,
        productPriceId: item.productPriceId,
        renewsAt: addBillingCycle(new Date(), item.billingCycle),
        startedAt: status === "ACTIVE" ? new Date() : undefined,
        status: status as ServiceStatus,
        userId
      }
    });

    await this.prisma.orderItem.update({
      where: { id: item.id },
      data: { serviceId: service.id }
    });

    return service;
  }

  createDomainRecord(input: {
    domain: string;
    externalId?: string;
    raw?: Record<string, unknown>;
    serviceId: string;
    status: "ACTIVE" | "FAILED" | "PENDING";
    userId: string;
  }) {
    return this.prisma.domainRecord.create({
      data: {
        dnsRecords: input.raw as Prisma.InputJsonValue,
        domain: input.domain,
        externalId: input.externalId,
        serviceId: input.serviceId,
        status: input.status,
        userId: input.userId
      }
    });
  }

  markItemProvisioning(id: string) {
    return this.prisma.orderItem.update({
      where: { id },
      data: { provisioningStatus: "PROVISIONING" }
    });
  }

  async markItemActive(id: string, providerReference?: string, payload?: Record<string, unknown>) {
    const item = await this.prisma.orderItem.update({
      where: { id },
      data: {
        provider: providerReference ? "resellbiz" : undefined,
        providerPayload: payload as Prisma.InputJsonValue,
        providerReference,
        provisioningStatus: "ACTIVE"
      }
    });

    if (item.serviceId) {
      await this.prisma.service.update({
        where: { id: item.serviceId },
        data: { externalId: providerReference, startedAt: new Date(), status: "ACTIVE" }
      });
    }

    return item;
  }

  async markItemFailed(id: string, message: string) {
    const item = await this.prisma.orderItem.update({
      where: { id },
      data: { errorMessage: message, provisioningStatus: "FAILED" as OrderItemStatus }
    });

    if (item.serviceId) {
      await this.prisma.service.update({
        where: { id: item.serviceId },
        data: { status: "FAILED" }
      });
    }

    return item;
  }
}
