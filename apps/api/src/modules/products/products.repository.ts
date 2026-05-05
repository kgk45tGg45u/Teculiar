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
      include: { prices: true, configs: true, addOns: { include: { addOn: true } } },
      orderBy: { sortOrder: "asc" }
    });
  }

  createProduct(dto: CreateProductDto) {
    return this.prisma.product.create({
      data: {
        name: dto.name,
        slug: dto.slug,
        type: dto.type as ProductType,
        description: dto.description,
        homepageVisible: dto.homepageVisible ?? true,
        provisioningModule: dto.provisioningModule,
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
      include: { prices: true, configs: true }
    });
  }

  async updateProduct(id: string, dto: CreateProductDto) {
    return this.prisma.product.update({
      where: { id },
      data: {
        active: true,
        description: dto.description,
        homepageVisible: dto.homepageVisible ?? true,
        name: dto.name,
        provisioningModule: dto.provisioningModule,
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
        },
        prices: {
          deleteMany: {},
          create: productPrices(dto).map((price) => ({
            billingCycle: price.billingCycle as BillingCycle,
            amountCents: price.amountCents,
            setupFeeCents: price.setupFeeCents ?? 0,
            currency: "EUR"
          }))
        }
      },
      include: { prices: true, configs: true }
    });
  }

  findProduct(id: string) {
    return this.prisma.product.findUnique({
      where: { id },
      include: { prices: true, configs: true, addOns: { include: { addOn: true } } }
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
      include: { product: true, productPrice: true }
    });
  }

  listServices(userId?: string) {
    return this.prisma.service.findMany({
      where: userId ? { userId } : undefined,
      include: { product: true, productPrice: true, serviceAddOns: { include: { addOn: true } } },
      orderBy: { createdAt: "desc" }
    });
  }

  findService(id: string) {
    return this.prisma.service.findUnique({
      where: { id },
      include: { product: true, productPrice: true, serviceAddOns: { include: { addOn: true } } }
    });
  }

  updateServiceStatus(id: string, status: string, externalId?: string) {
    return this.prisma.service.update({
      where: { id },
      data: { status: status as ServiceStatus, externalId }
    });
  }

  scheduleCancellation(id: string, cancelAt: Date) {
    return this.prisma.service.update({
      where: { id },
      data: { status: "PENDING_CANCEL", cancelAt }
    });
  }
}

function productPrices(dto: CreateProductDto) {
  if (dto.prices?.length) {
    return dto.prices;
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
