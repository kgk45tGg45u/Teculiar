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

  private mapProvisioningStatus(status: "QUEUED" | "PROVISIONING" | "ACTIVE" | "FAILED") {
    if (status === "QUEUED") {
      return "PROVISIONING";
    }
    return status;
  }
}
