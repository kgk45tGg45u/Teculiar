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
        prices: {
          create: {
            billingCycle: dto.billingCycle as BillingCycle,
            amountCents: dto.amountCents,
            setupFeeCents: dto.setupFeeCents,
            currency: "EUR"
          }
        },
        configs: dto.configurableOptions
          ? {
              create: dto.configurableOptions.map((option) => ({
                key: option.key,
                label: option.label,
                values: option.values as Prisma.InputJsonValue
              }))
            }
          : undefined
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
