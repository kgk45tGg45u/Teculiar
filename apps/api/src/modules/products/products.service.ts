import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { ExternalService } from "../external/external.service";
import { CreateProductDto } from "./dto/create-product.dto";
import { ProductsRepository } from "./products.repository";

@Injectable()
export class ProductsService {
  constructor(
    private readonly products: ProductsRepository,
    private readonly external: ExternalService
  ) {}

  listProducts() {
    return this.products.listProducts();
  }

  createProduct(dto: CreateProductDto) {
    return this.products.createProduct(dto);
  }

  updateProduct(id: string, dto: CreateProductDto) {
    return this.products.updateProduct(id, dto);
  }

  deleteProduct(id: string) {
    return this.products.deleteProduct(id);
  }

  listVirtualminTemplates() {
    return this.external.virtualmin.listHostingTemplates();
  }

  async createService(input: {
    userId: string;
    productId: string;
    productPriceId: string;
    configuration: Record<string, unknown>;
  }) {
    const product = await this.products.findProduct(input.productId);
    if (!product) {
      throw new NotFoundException("Product not found");
    }

    const service = await this.products.createService(input);
    const provider = this.external.hostingProvider(product.type);
    const provisioning = await provider.provision({
      serviceId: service.id,
      productType: product.type,
      options: input.configuration
    });

    return this.products.updateServiceStatus(
      service.id,
      this.mapProvisioningStatus(provisioning.status),
      provisioning.externalId
    );
  }

  listServices(userId?: string) {
    return this.products.listServices(userId);
  }

  async listServicesFresh(userId?: string) {
    const services = await this.products.listServices(userId);
    await Promise.all(services.map((service) => this.refreshService(service.id, userId).catch(() => undefined)));
    return this.products.listServices(userId);
  }

  async getService(id: string, user?: { roles?: string[]; sub: string }) {
    const service = await this.refreshService(id, user?.sub);
    if (!service) {
      throw new NotFoundException("Service not found");
    }
    const staff = user?.roles?.some((role) => ["admin", "staff"].includes(role));
    if (user && !staff && service.userId !== user.sub) {
      throw new NotFoundException("Service not found");
    }
    return service;
  }

  async refreshService(id: string, userId?: string) {
    const service = await this.products.findService(id);
    if (!service || (userId && service.userId !== userId)) {
      return service;
    }
    if (!["ORDERED", "PROVISIONING"].includes(service.status)) {
      return service;
    }
    if (service.product.type === "DOMAIN") {
      const domainName = service.domainRecords[0]?.domain;
      if (!domainName || !this.external.resellBiz.status) {
        return service;
      }
      const status = await this.external.resellBiz.status(domainName);
      if (status.status === "ACTIVE") {
        return this.products.updateServiceStatus(service.id, "ACTIVE", status.externalId);
      }
      return service;
    }
    if (service.product.type !== "SHARED_HOSTING") {
      return service;
    }

    const domainName = service.externalId ?? domainFromConfiguration(service.configuration);
    if (!domainName) {
      return service;
    }
    const provider = this.external.hostingProvider(service.product.type);
    if (!provider.status) {
      return service;
    }
    const status = await provider.status(domainName);
    if (status.status === "ACTIVE") {
      return this.products.updateServiceStatus(service.id, "ACTIVE", status.externalId);
    }

    return service;
  }

  async restartService(id: string) {
    const service = await this.products.findService(id);
    if (!service) {
      throw new NotFoundException("Service not found");
    }

    if (!service.externalId) {
      throw new BadRequestException("Service is not provisioned yet");
    }

    const provider = this.external.hostingProvider(service.product.type);
    return provider.restart(service.externalId);
  }

  async cancelService(id: string, cancelAt = new Date()) {
    const service = await this.products.findService(id);
    if (!service) {
      throw new NotFoundException("Service not found");
    }

    return this.products.scheduleCancellation(id, cancelAt);
  }

  async changeServicePlan(id: string, _input: { productPriceId?: string }, user?: { roles?: string[]; sub: string }) {
    const service = await this.getService(id, user);
    if (service.product.type === "DOMAIN") {
      throw new BadRequestException("Domains cannot be upgraded or downgraded");
    }

    return {
      accepted: true,
      serviceId: id,
      status: "PENDING_SUPPORT"
    };
  }

  async renewDomain(id: string, years: number, user?: { roles?: string[]; sub: string }) {
    const service = await this.getService(id, user);
    if (service.product.type !== "DOMAIN") {
      throw new BadRequestException("Only domains can be renewed here");
    }
    const domain = service.domainRecords[0]?.domain;
    if (!domain) {
      throw new BadRequestException("Domain record not found");
    }
    if (!Number.isInteger(years) || years < 1 || years > 10) {
      throw new BadRequestException("Renewal years must be between 1 and 10");
    }

    return this.external.resellBiz.renewDomain(domain, years);
  }

  private mapProvisioningStatus(status: "QUEUED" | "PROVISIONING" | "ACTIVE" | "FAILED") {
    if (status === "QUEUED") {
      return "PROVISIONING";
    }
    return status;
  }
}

function domainFromConfiguration(configuration: unknown) {
  if (typeof configuration !== "object" || configuration === null || Array.isArray(configuration)) {
    return undefined;
  }
  const value = (configuration as Record<string, unknown>).domainName;
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}
