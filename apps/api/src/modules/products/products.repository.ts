import { Injectable } from "@nestjs/common";
import { BillingCycle, Prisma, ProductType, ServiceStatus } from "@prisma/client";
import { billingCycles, domainRequirements } from "@teculiar/shared";
import { PrismaService } from "../prisma/prisma.service";
import { CreateProductDto } from "./dto/create-product.dto";
import { readMainCurrency } from "../../common/currency";

@Injectable()
export class ProductsRepository {
  constructor(private readonly prisma: PrismaService) {}

  listProducts() {
    return this.prisma.product.findMany({
      where: { active: true },
      include: { category: true, prices: true, configs: true, addOns: { where: { addOn: { active: true } }, include: { addOn: true } } },
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

  createCategory(dto: CategoryInput) {
    return this.prisma.productCategory.create({
      data: {
        description: dto.description,
        ...translationCols(dto),
        name: dto.name,
        provisioningModule: normalizeModule(dto.provisioningModule),
        slug: dto.slug,
        sortOrder: dto.sortOrder ?? 0
      }
    });
  }

  updateCategory(id: string, dto: CategoryInput) {
    return this.prisma.productCategory.update({
      where: { id },
      data: {
        active: true,
        description: dto.description,
        ...translationCols(dto),
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
    const currency = await readMainCurrency(this.prisma);
    return this.prisma.product.create({
      data: {
        categoryId: dto.categoryId || null,
        name: dto.name,
        slug: dto.slug,
        type: dto.type as ProductType,
        description: dto.description,
        ...translationCols(dto),
        homepageVisible: dto.homepageVisible ?? true,
        featured: dto.featured ?? false,
        provisioningModule: normalizeModule(dto.provisioningModule),
        ...domainFields(dto),
        sortOrder: dto.sortOrder ?? 0,
        prices: {
          create: productPrices(dto).map((price) => ({
            billingCycle: price.billingCycle as BillingCycle,
            amountCents: price.amountCents,
            setupFeeCents: price.setupFeeCents ?? 0,
            currency
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
    const currency = await readMainCurrency(this.prisma);
    await this.prisma.$transaction(async (tx) => {
      await tx.product.update({
        where: { id },
        data: {
          active: true,
          categoryId: dto.categoryId || null,
          description: dto.description,
          ...translationCols(dto),
          homepageVisible: dto.homepageVisible ?? true,
          featured: dto.featured ?? false,
          name: dto.name,
          provisioningModule: normalizeModule(dto.provisioningModule),
          ...domainFields(dto),
          slug: dto.slug,
          sortOrder: dto.sortOrder ?? 0,
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
            currency,
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

  // Admin catalog view: inactive addons stay listed (soft-deleted ones are gone for ordering but
  // remain attached to existing services), products only for the assignment checkboxes.
  listAddOns() {
    return this.prisma.addOn.findMany({
      include: { productLinks: { select: { productId: true } } },
      orderBy: { name: "asc" }
    });
  }

  createAddOn(input: {
    active?: boolean;
    amountCents: number;
    billingCycle?: string;
    description?: string;
    descriptionTranslations?: Record<string, string>;
    name: string;
    nameTranslations?: Record<string, string>;
    productIds?: string[];
    recurring?: boolean;
    setupFeeCents?: number;
    slug: string;
  }) {
    return this.prisma.addOn.create({
      data: {
        ...addOnColumns(input),
        productLinks: input.productIds?.length
          ? { create: input.productIds.map((productId) => ({ productId })) }
          : undefined
      },
      include: { productLinks: { select: { productId: true } } }
    });
  }

  updateAddOn(id: string, input: Parameters<ProductsRepository["createAddOn"]>[0]) {
    return this.prisma.addOn.update({
      where: { id },
      data: {
        ...addOnColumns(input),
        productLinks: input.productIds
          ? { deleteMany: {}, create: input.productIds.map((productId) => ({ productId })) }
          : undefined
      },
      include: { productLinks: { select: { productId: true } } }
    });
  }

  // Soft delete: ServiceAddOn rows keep referencing the addon (billing history + renewals),
  // so the row must survive; unlinking the products removes it from every order form.
  deleteAddOn(id: string) {
    return this.prisma.addOn.update({
      where: { id },
      data: { active: false, productLinks: { deleteMany: {} } }
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
          domainRequirement: "NECESSARY",
          freeDomainBillingCycle: "YEAR_1",
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
      include: { category: true, prices: true, configs: true, addOns: { where: { addOn: { active: true } }, include: { addOn: true } } }
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
        status: "PENDING",
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

  // Stamp that OUR module actually created this account (vs. a status reconcile merely finding a
  // pre-existing one). The activation email sweep only mails stamped services.
  async markServiceModuleProvisioned(id: string) {
    const service = await this.prisma.service.findUnique({ where: { id }, select: { configuration: true } });
    const configuration = (service?.configuration && typeof service.configuration === "object" && !Array.isArray(service.configuration)
      ? service.configuration
      : {}) as Record<string, unknown>;
    return this.prisma.service.update({
      where: { id },
      data: { configuration: { ...configuration, provisionedByModule: true } as Prisma.InputJsonValue }
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

  // A service scheduled for cancellation stays ACTIVE (still serving) until its cancelAt date;
  // the scheduled cancellation is tracked by the cancelAt timestamp, not a dedicated status.
  scheduleCancellation(id: string, cancelAt: Date) {
    return this.prisma.service.update({
      where: { id },
      data: { status: "ACTIVE", cancelAt }
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

function addOnColumns(input: {
  active?: boolean;
  amountCents: number;
  billingCycle?: string;
  description?: string;
  descriptionTranslations?: Record<string, string>;
  name: string;
  nameTranslations?: Record<string, string>;
  recurring?: boolean;
  setupFeeCents?: number;
  slug: string;
}) {
  return {
    active: input.active ?? true,
    amountCents: input.amountCents,
    billingCycle: input.billingCycle ? (input.billingCycle as BillingCycle) : null,
    description: input.description ?? null,
    descriptionTranslations: (input.descriptionTranslations ?? {}) as Prisma.InputJsonValue,
    name: input.name,
    nameTranslations: (input.nameTranslations ?? {}) as Prisma.InputJsonValue,
    recurring: input.recurring ?? true,
    setupFeeCents: input.setupFeeCents ?? 0,
    slug: input.slug
  };
}

type CategoryInput = {
  description?: string;
  descriptionTranslations?: Record<string, string>;
  name: string;
  nameTranslations?: Record<string, string>;
  provisioningModule?: string | null;
  slug: string;
  sortOrder?: number;
};

// Per-locale name/description maps (Phase 7.1). Empty object when unset — the plain name/description
// columns stay the main-language fallback for locales without an override.
function translationCols(input: { nameTranslations?: Record<string, string>; descriptionTranslations?: Record<string, string> }) {
  return {
    nameTranslations: (input.nameTranslations ?? {}) as Prisma.InputJsonValue,
    descriptionTranslations: (input.descriptionTranslations ?? {}) as Prisma.InputJsonValue
  };
}

// "none" is stored LITERALLY since Phase 6.2: it is the explicit "provision manually" choice and
// must survive the product-first resolution chain (NULL means "not set" and falls through to the
// category default / type default — see module-catalog effectiveProductModule).
function normalizeModule(value: string | null | undefined) {
  const moduleName = String(value ?? "").trim().toLowerCase();
  return moduleName || null;
}

// Domain products are the domain itself, so the requirement never applies to them. When the admin
// did not send a value (older clients, internal sync), fall back to a sensible default per type.
function resolveDomainRequirement(value: string | null | undefined, type: string) {
  if (type === "DOMAIN") {
    return "NOT_NEEDED";
  }
  if (value && domainRequirements.includes(value as never)) {
    return value;
  }
  if (type === "SHARED_HOSTING") {
    return "NECESSARY";
  }
  if (type === "VPS") {
    return "OPTIONAL";
  }
  return "NOT_NEEDED";
}

// A free domain only makes sense when a domain can be ordered with the product at all.
function resolveFreeDomainCycle(value: string | null | undefined, requirement: string) {
  if (requirement === "NOT_NEEDED") {
    return null;
  }
  const cycle = String(value ?? "").trim();
  return cycle && billingCycles.includes(cycle as never) ? cycle : null;
}

function domainFields(dto: CreateProductDto) {
  const domainRequirement = resolveDomainRequirement(dto.domainRequirement, dto.type);
  return {
    domainRequirement,
    freeDomainBillingCycle: resolveFreeDomainCycle(dto.freeDomainBillingCycle, domainRequirement)
  };
}
