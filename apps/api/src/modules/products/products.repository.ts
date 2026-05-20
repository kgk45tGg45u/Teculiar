import { Injectable } from "@nestjs/common";
import { BillingCycle, Prisma, ProductType, ServiceStatus } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { CreateProductDto } from "./dto/create-product.dto";

@Injectable()
export class ProductsRepository {
  constructor(private readonly prisma: PrismaService) {}

  listProducts() {
    return this.prisma.product.findMany({
      where: { active: true },
      include: { category: true, prices: true, configs: true, addOns: { include: { addOn: true } } },
      orderBy: { sortOrder: "asc" }
    });
  }

  listCategories() {
    return this.prisma.productCategory.findMany({
      where: { active: true },
      include: { products: { where: { active: true }, orderBy: { sortOrder: "asc" } } },
      orderBy: [{ sortOrder: "asc" }, { name: "asc" }]
    });
  }

  createCategory(dto: { description?: string; name: string; provisioningModule?: string | null; slug: string; sortOrder?: number }) {
    return this.prisma.productCategory.create({
      data: {
        description: dto.description,
        name: dto.name,
        provisioningModule: normalizeModule(dto.provisioningModule),
        slug: dto.slug,
        sortOrder: dto.sortOrder ?? 0
      }
    });
  }

  updateCategory(id: string, dto: { description?: string; name: string; provisioningModule?: string | null; slug: string; sortOrder?: number }) {
    return this.prisma.productCategory.update({
      where: { id },
      data: {
        active: true,
        description: dto.description,
        name: dto.name,
        provisioningModule: normalizeModule(dto.provisioningModule),
        slug: dto.slug,
        sortOrder: dto.sortOrder ?? 0
      }
    });
  }

  async deleteCategory(id: string) {
    await this.prisma.product.updateMany({ where: { categoryId: id }, data: { categoryId: null } });
    return this.prisma.productCategory.update({ where: { id }, data: { active: false } });
  }

  async createProduct(dto: CreateProductDto) {
    return this.prisma.product.create({
      data: {
        categoryId: dto.categoryId || null,
        name: dto.name,
        slug: dto.slug,
        type: dto.type as ProductType,
        description: dto.description,
        homepageVisible: dto.homepageVisible ?? true,
        provisioningModule: normalizeModule(dto.provisioningModule),
        prices: {
          create: productPrices(dto).map((price) => ({
            billingCycle: price.billingCycle as BillingCycle,
            amountCents: price.amountCents,
            setupFeeCents: price.setupFeeCents ?? 0,
            currency: "EUR"
          }))
        },
        configs: dto.configurableOptions
          ? {
              create: dto.configurableOptions.map((option) => ({
                key: option.key,
                label: option.label,
                required: option.required ?? false,
                values: option.values as Prisma.InputJsonValue
              }))
            }
          : undefined
      },
      include: { category: true, prices: true, configs: true }
    });
  }

  async updateProduct(id: string, dto: CreateProductDto) {
    const prices = productPrices(dto);
    await this.prisma.$transaction(async (tx) => {
      await tx.product.update({
        where: { id },
        data: {
          active: true,
          categoryId: dto.categoryId || null,
          description: dto.description,
          homepageVisible: dto.homepageVisible ?? true,
          name: dto.name,
          provisioningModule: normalizeModule(dto.provisioningModule),
          slug: dto.slug,
          type: dto.type as ProductType,
          configs: {
            deleteMany: {},
            create: (dto.configurableOptions ?? []).map((option) => ({
              key: option.key,
              label: option.label,
              required: option.required ?? false,
              values: option.values as Prisma.InputJsonValue
            }))
          }
        }
      });
      await tx.productPrice.updateMany({ where: { productId: id }, data: { active: false } });
      for (const price of prices) {
        await tx.productPrice.upsert({
          where: { productId_billingCycle: { billingCycle: price.billingCycle as BillingCycle, productId: id } },
          create: {
            productId: id,
            billingCycle: price.billingCycle as BillingCycle,
            amountCents: price.amountCents,
            setupFeeCents: price.setupFeeCents ?? 0,
            currency: "EUR",
            active: true
          },
          update: {
            active: true,
            amountCents: price.amountCents,
            setupFeeCents: price.setupFeeCents ?? 0
          }
        });
      }
    });

    return this.findProduct(id);
  }

  deleteProduct(id: string) {
    return this.prisma.product.update({
      where: { id },
      data: { active: false }
    });
  }

  async syncHostingPlanProduct(input: {
    configs: Array<{ key: string; label: string; required?: boolean; values: unknown[] }>;
    description: string;
    name: string;
    planId: string;
    slug: string;
  }) {
    const existing = await this.prisma.product.findUnique({ where: { slug: input.slug } });
    const categoryId = await this.defaultCategoryId("webhosting", {
      description: "Shared hosting packages provisioned through the selected hosting module.",
      name: "Webhosting",
      provisioningModule: "virtualmin",
      sortOrder: 10
    });
    if (!existing) {
      return this.prisma.product.create({
        data: {
          active: true,
          categoryId,
          description: input.description,
          homepageVisible: true,
          name: input.name,
          provisioningModule: "virtualmin",
          slug: input.slug,
          type: "SHARED_HOSTING",
          configs: {
            create: input.configs.map((option) => ({
              key: option.key,
              label: option.label,
              required: option.required ?? false,
              values: option.values as Prisma.InputJsonValue
            }))
          }
        },
        include: { prices: true, configs: true }
      });
    }

    await this.prisma.product.update({
      where: { id: existing.id },
      data: {
        active: true,
        categoryId,
        description: input.description,
        name: input.name,
        provisioningModule: "virtualmin",
        type: "SHARED_HOSTING",
        configs: {
          deleteMany: {},
          create: input.configs.map((option) => ({
            key: option.key,
            label: option.label,
            required: option.required ?? false,
            values: option.values as Prisma.InputJsonValue
          }))
        }
      }
    });

    return this.findProduct(existing.id);
  }

  findProduct(id: string) {
    return this.prisma.product.findUnique({
      where: { id },
      include: { category: true, prices: true, configs: true, addOns: { include: { addOn: true } } }
    });
  }

  createService(input: {
    userId: string;
    teamId?: string;
    productId: string;
    productPriceId: string;
    configuration: Record<string, unknown>;
  }) {
    return this.prisma.service.create({
      data: {
        userId: input.userId,
        teamId: input.teamId,
        productId: input.productId,
        productPriceId: input.productPriceId,
        status: "ORDERED",
        configuration: input.configuration as Prisma.InputJsonValue
      },
      include: { product: { include: { category: true } }, productPrice: true }
    });
  }

  listServices(userId?: string) {
    return this.prisma.service.findMany({
      where: userId ? { userId } : undefined,
      include: { domainRecords: userId ? { where: { userId } } : true, product: { include: { category: true } }, productPrice: true, serviceAddOns: { include: { addOn: true } } },
      orderBy: { createdAt: "desc" }
    });
  }

  listServicesByProductType(type: string) {
    return this.prisma.service.findMany({
      where: { product: { type: type as ProductType } },
      include: { domainRecords: true, product: { include: { category: true } }, productPrice: true, serviceAddOns: { include: { addOn: true } } },
      orderBy: { createdAt: "desc" }
    });
  }

  listDomainRecords() {
    return this.prisma.domainRecord.findMany({
      where: { status: { notIn: ["CANCELLED"] } },
      include: { service: { include: { product: true } } },
      orderBy: { updatedAt: "asc" }
    });
  }

  findService(id: string, userId?: string) {
    return this.prisma.service.findUnique({
      where: { id },
      include: { domainRecords: userId ? { where: { userId } } : true, product: { include: { category: true } }, productPrice: true, serviceAddOns: { include: { addOn: true } } }
    });
  }

  findRunningModuleLogForService(serviceId: string, action = "create") {
    return this.prisma.moduleLog.findFirst({
      where: { action, serviceId, status: "RUNNING" },
      orderBy: { createdAt: "desc" }
    });
  }

  updateServiceStatus(id: string, status: string, externalId?: string) {
    return this.prisma.service.update({
      where: { id },
      data: {
        externalId,
        startedAt: status === "ACTIVE" ? new Date() : undefined,
        status: status as ServiceStatus
      },
      include: { domainRecords: true, product: { include: { category: true } }, productPrice: true, serviceAddOns: { include: { addOn: true } } }
    });
  }

  updateDomainRecordStatus(id: string, status: string, externalId?: string, expiresAt?: Date) {
    return this.prisma.domainRecord.update({
      where: { id },
      data: {
        externalId,
        expiresAt,
        registrationDate: status === "ACTIVE" ? new Date() : undefined,
        status: status as never
      }
    });
  }

  updateDomainRecordExpiration(id: string, externalId?: string, expiresAt?: Date) {
    return this.prisma.domainRecord.update({
      where: { id },
      data: { externalId, expiresAt }
    });
  }

  completeReadyOrdersForService(serviceId: string) {
    return this.prisma.$transaction(async (tx) => {
      const serviceItems = await tx.orderItem.findMany({
        where: { serviceId },
        select: { id: true, orderId: true }
      });
      const orderIds = [...new Set(serviceItems.map((item) => item.orderId))];
      if (orderIds.length === 0) {
        return { completedOrders: 0, updatedItems: 0 };
      }

      const updated = await tx.orderItem.updateMany({
        where: { serviceId, provisioningStatus: { in: ["PENDING", "PROVISIONING", "FAILED"] } },
        data: { provisioningStatus: "ACTIVE" }
      });

      let completedOrders = 0;
      for (const orderId of orderIds) {
        const items = await tx.orderItem.findMany({
          where: { orderId },
          select: { provisioningStatus: true }
        });
        if (items.length > 0 && items.every((item) => item.provisioningStatus === "ACTIVE")) {
          await tx.order.update({
            where: { id: orderId },
            data: { completedAt: new Date(), notes: null, status: "COMPLETE" }
          });
          completedOrders += 1;
        }
      }

      return { completedOrders, updatedItems: updated.count };
    });
  }

  scheduleCancellation(id: string, cancelAt: Date) {
    return this.prisma.service.update({
      where: { id },
      data: { status: "PENDING_CANCEL", cancelAt }
    });
  }

  private async defaultCategoryId(
    slug: string,
    input: { description?: string; name: string; provisioningModule?: string | null; sortOrder: number }
  ) {
    const category = await this.prisma.productCategory.upsert({
      where: { slug },
      create: {
        active: true,
        description: input.description,
        name: input.name,
        provisioningModule: normalizeModule(input.provisioningModule),
        slug,
        sortOrder: input.sortOrder
      },
      update: { active: true }
    });
    return category.id;
  }
}

function productPrices(dto: CreateProductDto) {
  if (dto.prices?.length) {
    return dto.prices;
  }

  if (dto.type === "DOMAIN") {
    return Array.from({ length: 10 }, (_, index) => ({
      amountCents: 0,
      billingCycle: `YEAR_${index + 1}`,
      setupFeeCents: 0
    }));
  }

  if (!dto.billingCycle || dto.amountCents === undefined) {
    throw new Error("At least one product price is required");
  }

  return [
    {
      amountCents: dto.amountCents,
      billingCycle: dto.billingCycle,
      setupFeeCents: dto.setupFeeCents ?? 0
    }
  ];
}

function normalizeModule(value: string | null | undefined) {
  const moduleName = String(value ?? "").trim();
  if (!moduleName || moduleName === "none") {
    return null;
  }
  return moduleName;
}
