import { Injectable } from "@nestjs/common";
import { BillingCycle, OrderItemStatus, OrderStatus, PaymentMethodType, Prisma, ProductType, ServiceStatus } from "@prisma/client";
import { addBillingCycle, formatOrderNumber } from "../billing/platform-rules";
import { PrismaService } from "../prisma/prisma.service";

export type PricedOrderItem = {
  billingCycle: string;
  configuration: Record<string, unknown>;
  description: string;
  domainName?: string;
  productId: string;
  productPriceId: string;
  productSnapshot: { name: string; type: string; slug: string; provisioningModule?: string | null };
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
      include: { category: true, prices: { where: { active: true } }, configs: true }
    });
  }

  findProductByType(type: string) {
    return this.prisma.product.findFirst({
      where: { active: true, type: type as ProductType },
      include: { category: true, prices: { where: { active: true } }, configs: true },
      orderBy: { sortOrder: "asc" }
    });
  }

  findDomainProductPrice(productId: string, billingCycle: string) {
    return this.prisma.productPrice.findFirst({
      where: {
        billingCycle: billingCycle as BillingCycle,
        product: { active: true, id: productId, type: "DOMAIN" }
      },
      orderBy: { active: "desc" }
    });
  }

  listHomepageProducts(categorySlug?: string) {
    return this.prisma.product.findMany({
      where: { active: true, homepageVisible: true, category: categorySlug ? { active: true, slug: categorySlug } : undefined },
      include: { category: true, prices: { where: { active: true } }, configs: true },
      orderBy: { sortOrder: "asc" }
    });
  }

  // A hosting account is "known" by the domain it is provisioned under. We block a second
  // active hosting service for the same domain name anywhere in the system (any client).
  // The domain is stored on Service.configuration.domainName (or mirrored on externalId once
  // provisioned), so we filter to hosting services and match the normalized domain in memory.
  async findActiveHostingServiceByDomain(domain: string) {
    const normalized = domain.toLowerCase().trim();
    if (!normalized) {
      return null;
    }
    const services = await this.prisma.service.findMany({
      where: {
        status: { notIn: ["CANCELLED", "TERMINATED", "FAILED", "PROVISIONING_FAILED"] },
        OR: [{ product: { type: "SHARED_HOSTING" } }, { product: null, moduleName: "virtualmin" }]
      },
      select: { id: true, userId: true, externalId: true, configuration: true }
    });
    return (
      services.find((service) => {
        const configDomain = serviceConfigDomain(service.configuration);
        const externalDomain = typeof service.externalId === "string" ? service.externalId.toLowerCase().trim() : undefined;
        return configDomain === normalized || externalDomain === normalized;
      }) ?? null
    );
  }

  // Only block names that actually occupy the registry. Expired/failed/cancelled domains are free again.
  findActiveDomainRecord(domain: string) {
    return this.prisma.domainRecord.findFirst({
      where: { domain: domain.toLowerCase().trim(), status: { notIn: ["CANCELLED", "EXPIRED", "FAILED"] } }
    });
  }

  async createOrder(input: {
    customerSnapshot: Record<string, unknown>;
    invoiceId: string;
    items: PricedOrderItem[];
    placedAt?: Date;
    setupFeeCents: number;
    subtotalCents: number;
    taxAmountCents: number;
    totalCents: number;
    userId: string;
  }) {
    const last = await this.prisma.order.findFirst({ select: { orderNumber: true }, orderBy: { orderNumber: "desc" } });
    const lastSeq = last?.orderNumber ? (parseInt(last.orderNumber, 10) || 0) : 0;
    const orderNumber = formatOrderNumber(lastSeq + 1);

    return this.prisma.order.create({
      data: {
        customerSnapshot: input.customerSnapshot as Prisma.InputJsonValue,
        invoiceId: input.invoiceId,
        orderNumber,
        placedAt: input.placedAt ?? new Date(),
        items: {
          create: input.items.map((item) => ({
            billingCycle: item.billingCycle as BillingCycle,
            configuration: item.configuration as Prisma.InputJsonValue,
            description: item.description,
            domainName: item.domainName,
            productId: item.productId,
            productPriceId: item.productPriceId,
            productSnapshot: item.productSnapshot as Prisma.InputJsonValue,
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
      include: { invoice: true, items: true, user: { select: publicUserSelect } }
    });
  }

  async createPendingEntitiesForOrder(order: { id: string; items: Array<Record<string, any>>; userId?: string }, invoiceId: string) {
    const invoiceItems = await this.prisma.invoiceItem.findMany({
      where: { invoiceId },
      orderBy: { createdAt: "asc" }
    });
    const items = [...order.items].sort((a, b) => pendingEntityPriority(a) - pendingEntityPriority(b));
    const moduleByProductId = await this.productModulesForItems(items);

    for (const item of items) {
      const configuration = isRecord(item.configuration) ? item.configuration : {};
      let serviceId = typeof item.serviceId === "string" ? item.serviceId : undefined;
      let domainRecordId: string | undefined;
      const hasProductModule = moduleByProductId.has(String(item.productId));
      const productModule = hasProductModule ? moduleByProductId.get(String(item.productId)) : moduleNameForProductType(String(item.type));
      const productSnapshot = isRecord(item.productSnapshot)
        ? item.productSnapshot
        : { name: String(item.description ?? item.type), type: String(item.type) };

      if (item.type !== "DOMAIN" && !serviceId) {
        const renewsAt = item.billingCycle === "ONE_TIME" ? undefined : addBillingCycle(new Date(), String(item.billingCycle));
        const service = await this.prisma.service.create({
          data: {
            billingCycle: item.billingCycle as BillingCycle,
            configuration: (item.configuration ?? {}) as Prisma.InputJsonValue,
            initialInvoiceId: invoiceId,
            moduleName: productModule ?? null,
            nextDueAt: renewsAt,
            orderId: order.id,
            orderItemId: String(item.id),
            productId: String(item.productId),
            productPriceId: String(item.productPriceId),
            productSnapshot: productSnapshot as Prisma.InputJsonValue,
            recurringAmountCents: Number(item.unitAmountCents ?? 0),
            renewsAt,
            setupFeeCents: Number(item.setupFeeCents ?? 0),
            status: "PENDING",
            userId: String(order.userId)
          }
        });
        serviceId = service.id;
        await this.prisma.orderItem.update({ where: { id: String(item.id) }, data: { serviceId } });
        if (item.billingCycle !== "ONE_TIME") {
          await this.prisma.subscription.create({
            data: {
              billingCycle: item.billingCycle as BillingCycle,
              nextInvoiceAt: renewsAt ?? addBillingCycle(new Date(), String(item.billingCycle)),
              productPriceId: String(item.productPriceId),
              serviceId: service.id,
              userId: String(order.userId)
            }
          });
        }
      }

      if (item.type === "DOMAIN" && item.domainName) {
        const action = domainAction(configuration);
        const renewsAt = addBillingCycle(new Date(), String(item.billingCycle));
        const service = await this.prisma.service.create({
          data: {
            billingCycle: item.billingCycle as BillingCycle,
            configuration: (item.configuration ?? {}) as Prisma.InputJsonValue,
            initialInvoiceId: invoiceId,
            moduleName: hasProductModule ? productModule ?? null : "resellbiz",
            nextDueAt: renewsAt,
            orderId: order.id,
            orderItemId: String(item.id),
            productId: String(item.productId),
            productPriceId: String(item.productPriceId),
            productSnapshot: productSnapshot as Prisma.InputJsonValue,
            recurringAmountCents: Number(item.unitAmountCents ?? 0),
            renewsAt,
            setupFeeCents: Number(item.setupFeeCents ?? 0),
            status: "PENDING",
            userId: String(order.userId)
          }
        });
        serviceId = service.id;
        await this.prisma.orderItem.update({ where: { id: String(item.id) }, data: { serviceId } });
        await this.prisma.subscription.create({
          data: {
            billingCycle: item.billingCycle as BillingCycle,
            nextInvoiceAt: renewsAt,
            productPriceId: String(item.productPriceId),
            serviceId: service.id,
            userId: String(order.userId)
          }
        });
        const domain = await this.prisma.domainRecord.create({
          data: {
            autoRenew: true,
            domain: String(item.domainName).toLowerCase(),
            firstPaymentAmountCents: Number(item.totalCents ?? item.unitAmountCents ?? 0),
            initialInvoiceId: invoiceId,
            nameservers: domainNameServers(configuration) as Prisma.InputJsonValue,
            nextDueAt: addBillingCycle(new Date(), String(item.billingCycle)),
            orderId: order.id,
            orderItemId: String(item.id),
            recurringAmountCents: Number(item.unitAmountCents ?? 0),
            registrarModule: hasProductModule ? productModule ?? null : "resellbiz",
            registrationPeriodYears: yearsFromCycle(String(item.billingCycle)),
            serviceId: service.id,
            status: action === "transfer" ? "PENDING_TRANSFER" : "PENDING",
            type: action,
            userId: String(order.userId)
          }
        });
        domainRecordId = domain.id;
      }

      const invoiceItem = invoiceItems[order.items.findIndex((candidate) => candidate.id === item.id)];
      if (invoiceItem) {
        await this.prisma.invoiceItem.update({
          where: { id: invoiceItem.id },
          data: {
            domainRecordId,
            lifecycleAction: item.type === "DOMAIN" ? domainAction(configuration) : "create",
            orderItemId: String(item.id),
            serviceId,
            type: item.type === "DOMAIN" ? "DOMAIN" : "SERVICE"
          }
        });
      }
    }
  }

  listOrders() {
    return this.prisma.order.findMany({
      include: {
        invoice: true,
        items: { include: { product: { include: { category: true } }, service: { include: { product: { include: { category: true } } } } } },
        user: { select: publicUserSelect }
      },
      orderBy: { placedAt: "desc" }
    });
  }

  findOrder(id: string) {
    return this.prisma.order.findUnique({
      where: { id },
      include: {
        invoice: { include: { items: true, transactions: true } },
        items: { include: { product: { include: { category: true } }, service: { include: { product: { include: { category: true } } } } } },
        user: { select: publicUserSelect }
      }
    });
  }

  findOrderForActivation(id: string) {
    return this.prisma.order.findUnique({
      where: { id },
      include: {
        invoice: true,
        items: { orderBy: { createdAt: "asc" } },
        user: { select: publicUserSelect }
      }
    });
  }

  // Payment received → the order moves straight into provisioning (there is no separate PAID step).
  markOrderPaid(id: string, method?: string) {
    return this.prisma.order.update({
      where: { id },
      data: {
        paidAt: new Date(),
        paymentMethod: method ? (method as PaymentMethodType) : undefined,
        status: "PROVISIONING"
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

  markOrderInProgress(id: string, message?: string) {
    return this.prisma.order.update({
      where: { id },
      data: { notes: message, status: "PROVISIONING" }
    });
  }

  markOrderFailed(id: string, message?: string) {
    return this.prisma.order.update({
      where: { id },
      data: { notes: message, status: "FAILED" }
    });
  }

  updateOrderStatus(id: string, status: string) {
    return this.prisma.order.update({
      where: { id },
      data: {
        completedAt: status === "COMPLETE" ? new Date() : undefined,
        status: status as OrderStatus
      },
      include: {
        invoice: true,
        items: { include: { product: { include: { category: true } }, service: { include: { product: { include: { category: true } } } } } },
        user: { select: publicUserSelect }
      }
    });
  }

  async createServiceForItem(
    item: { id: string; billingCycle: string; configuration: unknown; productId?: string | null; productPriceId: string },
    userId: string,
    status: string
  ) {
    const moduleName = item.productId ? await this.moduleNameForProductId(item.productId) : null;
    const service = await this.prisma.service.create({
      data: {
        configuration: (item.configuration ?? {}) as Prisma.InputJsonValue,
        moduleName: moduleName ?? null,
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
    registrarModule?: string;
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
        registrarModule: input.registrarModule,
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

  async markItemActive(id: string, providerReference?: string, payload?: Record<string, unknown>, provider?: string) {
    const item = await this.prisma.orderItem.update({
      where: { id },
      data: {
        provider: providerReference ? provider ?? "resellbiz" : undefined,
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

  async markItemSkipped(id: string, message: string, payload?: Record<string, unknown>) {
    const item = await this.prisma.orderItem.update({
      where: { id },
      data: {
        errorMessage: message,
        provider: payload ? "manual" : undefined,
        providerPayload: payload as Prisma.InputJsonValue,
        provisioningStatus: "SKIPPED" as OrderItemStatus
      }
    });

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

  private async productModulesForItems(items: Array<Record<string, any>>) {
    const productIds = [...new Set(items.map((item) => String(item.productId)).filter(Boolean))];
    const products = await this.prisma.product.findMany({
      where: { id: { in: productIds } },
      select: { category: { select: { provisioningModule: true } }, id: true, provisioningModule: true, type: true }
    });
    return new Map(products.map((product) => [product.id, effectiveModule(product)]));
  }

  private async moduleNameForProductId(productId: string) {
    const product = await this.prisma.product.findUnique({
      where: { id: productId },
      select: { category: { select: { provisioningModule: true } }, id: true, provisioningModule: true, type: true }
    });
    return product ? effectiveModule(product) : undefined;
  }
}

function pendingEntityPriority(item: Record<string, any>) {
  return item.type !== "DOMAIN" && serviceDomainName(isRecord(item.configuration) ? item.configuration : {}) ? 0 : 1;
}

function moduleNameForProductType(type: string) {
  return ["VPS", "DEDICATED_SERVER"].includes(type) ? "hetzner" : "virtualmin";
}

function effectiveModule(product: { category?: { provisioningModule?: string | null } | null; provisioningModule?: string | null; type?: string }) {
  if (product.category) {
    return normalizeModule(product.category.provisioningModule);
  }
  return normalizeModule(product.provisioningModule) ?? moduleNameForProductType(product.type ?? "");
}

function normalizeModule(value: string | null | undefined) {
  const moduleName = String(value ?? "").trim();
  if (!moduleName || moduleName === "none") {
    return undefined;
  }
  return moduleName;
}

function serviceDomainName(configuration: Record<string, unknown>) {
  if (typeof configuration.domainName !== "string") {
    return undefined;
  }
  return configuration.domainName.trim().toLowerCase();
}

function serviceConfigDomain(configuration: unknown) {
  return isRecord(configuration) ? serviceDomainName(configuration) : undefined;
}

function domainAction(configuration: Record<string, unknown>) {
  return configuration.domainAction === "transfer" ? "transfer" : "register";
}

function yearsFromCycle(cycle: string) {
  return Number(cycle.match(/^YEAR_(\d+)$/)?.[1] ?? 1);
}

function domainNameServers(configuration: Record<string, unknown>) {
  if (!Array.isArray(configuration.nameServers)) {
    return undefined;
  }
  return configuration.nameServers.filter((value): value is string => typeof value === "string" && value.length > 0);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

const publicUserSelect = {
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
