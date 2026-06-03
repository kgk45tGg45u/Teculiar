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

  listCategories() {
    return this.products.listCategories();
  }

  createCategory(dto: { description?: string; name: string; provisioningModule?: string | null; slug: string; sortOrder?: number }) {
    return this.products.createCategory(dto);
  }

  updateCategory(id: string, dto: { description?: string; name: string; provisioningModule?: string | null; slug: string; sortOrder?: number }) {
    return this.products.updateCategory(id, dto);
  }

  deleteCategory(id: string) {
    return this.products.deleteCategory(id);
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

  async detectVirtualminHostingPlans() {
    const payload = await this.external.virtualmin.listHostingTemplates();
    const plans = detectPlanDifferences((payload.plans ?? []).map(normalizeVirtualminPlan));

    return {
      plans,
      templates: (payload.templates ?? []).map(normalizeVirtualminPlan),
      warning: payload.warning
    };
  }

  async syncVirtualminHostingPlans(confirmedPlans?: Array<{ id: string; limits?: Record<string, string | undefined>; name: string }>) {
    const detected = confirmedPlans ? { plans: confirmedPlans, templates: [], warning: undefined } : await this.detectVirtualminHostingPlans();
    const products = await Promise.all(
      detected.plans.map((plan) =>
        this.products.syncHostingPlanProduct({
          configs: customerPlanConfigs(plan),
          description: `Hosting package synced from Virtualmin plan ${plan.name}.`,
          name: plan.name,
          planId: plan.id,
          slug: `hosting-${slugify(plan.name || plan.id)}`
        })
      )
    );

    return {
      plans: detected.plans,
      products,
      templates: detected.templates,
      warning: detected.warning
    };
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
    const moduleName = effectiveModule(product);
    if (!moduleName) {
      return service;
    }
    const provider = this.external.hostingProvider(moduleName, product.type);
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

  async refreshAllServiceStatuses() {
    const services = await this.products.listServices();
    let refreshed = 0;
    for (const service of services) {
      await this.refreshService(service.id).catch(() => undefined);
      refreshed += 1;
    }
    return { checked: services.length, refreshed };
  }

  async refreshAllDomainStatuses() {
    const domains = await this.products.listDomainRecords();
    let refreshed = 0;
    for (const domain of domains) {
      if (!this.external.resellBiz.status || ["CANCELLED"].includes(domain.status)) {
        continue;
      }
      const status = await this.external.resellBiz.status(domain.domain).catch(() => undefined);
      if (!status) {
        continue;
      }
      const expiresAt = dateFromProvider(status);
      const nextStatus = status.status === "ACTIVE" ? "ACTIVE" : status.status === "FAILED" ? "FAILED" : domain.status;
      await this.products.updateDomainRecordStatus(domain.id, nextStatus, status.externalId, expiresAt);
      if (domain.service && serviceProductType(domain.service) === "DOMAIN" && (nextStatus === "ACTIVE" || nextStatus === "FAILED")) {
        await this.products.updateServiceStatus(domain.service.id, nextStatus, status.externalId);
      }
      refreshed += 1;
    }
    return { checked: domains.length, refreshed };
  }

  async refreshAllDomainExpirations() {
    const domains = await this.products.listDomainRecords();
    let refreshed = 0;
    for (const domain of domains) {
      if (!this.external.resellBiz.status || ["CANCELLED"].includes(domain.status)) {
        continue;
      }
      const status = await this.external.resellBiz.status(domain.domain).catch(() => undefined);
      const expiresAt = status ? dateFromProvider(status) : undefined;
      if (!status || !expiresAt) {
        continue;
      }
      await this.products.updateDomainRecordExpiration(domain.id, status.externalId, expiresAt);
      refreshed += 1;
    }
    return { checked: domains.length, refreshed };
  }

  async refreshAllHostingStatuses() {
    const services = await this.products.listServicesByProductType("SHARED_HOSTING");
    let refreshed = 0;
    for (const service of services) {
      await this.refreshService(service.id).catch(() => undefined);
      refreshed += 1;
    }
    return { checked: services.length, refreshed };
  }

  async listServicesFresh(userId?: string) {
    const services = await this.products.listServices(userId);
    await Promise.all(services.map((service) => this.refreshService(service.id, userId).catch(() => undefined)));
    return this.products.listServices(userId);
  }

  async getService(id: string, user?: { roles?: string[]; sub: string }, options: { refresh?: boolean } = {}) {
    const staff = user?.roles?.some((role) => ["admin", "staff"].includes(role));
    if (options.refresh) {
      await this.refreshService(id, staff ? undefined : user?.sub);
    }
    const service = await this.products.findService(id, staff ? undefined : user?.sub);
    if (!service) {
      throw new NotFoundException("Service not found");
    }
    if (user && !staff && service.userId !== user.sub) {
      throw new NotFoundException("Service not found");
    }
    return service;
  }

  async hostingControlPanel(id: string, user?: { roles?: string[]; sub: string }) {
    const service = await this.getService(id, user);
    if (serviceProductType(service) !== "SHARED_HOSTING" || service.status !== "ACTIVE") {
      throw new BadRequestException("Hosting control panel is only available for active hosting services");
    }
    const domainName = service.externalId ?? domainFromConfiguration(service.configuration);
    if (!domainName) {
      throw new BadRequestException("Hosting domain not found");
    }

    return this.external.virtualmin.hostingControlPanel(domainName);
  }

  async hostingControlAction(
    id: string,
    body: Record<string, string | undefined>,
    user?: { roles?: string[]; sub: string }
  ) {
    const service = await this.getService(id, user);
    if (serviceProductType(service) !== "SHARED_HOSTING" || service.status !== "ACTIVE") {
      throw new BadRequestException("Hosting control panel is only available for active hosting services");
    }
    const domainName = service.externalId ?? domainFromConfiguration(service.configuration);
    if (!domainName) {
      throw new BadRequestException("Hosting domain not found");
    }

    return this.external.virtualmin.hostingControlAction(domainName, body);
  }

  async refreshService(id: string, userId?: string) {
    const service = await this.products.findService(id);
    if (!service) {
      return null;
    }
    if (userId && service.userId !== userId) {
      return null;
    }
    for (const domainRecord of service.domainRecords ?? []) {
      if (!this.external.resellBiz.status || !["PENDING", "PENDING_TRANSFER", "TRANSFERRING", "FAILED"].includes(domainRecord.status)) {
        continue;
      }
      const domainStatus = await this.external.resellBiz.status(domainRecord.domain);
      if (domainStatus.status === "ACTIVE" || domainStatus.status === "FAILED") {
        await this.products.updateDomainRecordStatus(domainRecord.id, domainStatus.status, domainStatus.externalId);
      }
    }
    const refreshableStatus = ["ORDERED", "PENDING", "PROVISIONING", "FAILED", "PROVISIONING_FAILED"].includes(service.status);
    const productType = serviceProductType(service);
    if (productType !== "SHARED_HOSTING" && !refreshableStatus) {
      return service;
    }

    if (productType !== "SHARED_HOSTING") {
      const domainRecord = service.domainRecords?.[0];
      if (productType === "DOMAIN" && domainRecord?.domain && this.external.resellBiz.status) {
        const status = await this.external.resellBiz.status(domainRecord.domain);
        if (status.status === "ACTIVE") {
          await this.products.updateDomainRecordStatus(domainRecord.id, "ACTIVE", status.externalId);
          const updated = await this.products.updateServiceStatus(service.id, "ACTIVE", status.externalId);
          await this.completeReadyOrdersForService(service.id);
          return updated;
        }
      }
      return service;
    }

    if (!refreshableStatus && service.status !== "ACTIVE") {
      return service;
    }
    const domainName = refreshDomainName(service.externalId, service.configuration);
    if (!domainName) {
      return service;
    }
    if (["ORDERED", "PENDING", "PROVISIONING"].includes(service.status)) {
      const runningCreate = await this.products.findRunningModuleLogForService?.(service.id, "create");
      if (runningCreate) {
        return service;
      }
    }
    const moduleName = (service.product ? effectiveModule(service.product) : undefined) ?? service.moduleName ?? undefined;
    if (!moduleName) {
      return service;
    }
    const provider = this.external.hostingProvider(moduleName, productType);
    if (!provider.status) {
      return service;
    }
    const status = await provider.status(domainName);
    if (status.status === "ACTIVE") {
      const updated = await this.products.updateServiceStatus(service.id, "ACTIVE", status.externalId);
      await this.completeReadyOrdersForService(service.id);
      return updated;
    }
    if (service.status === "ACTIVE") {
      return this.products.updateServiceStatus(service.id, this.mapProvisioningStatus(status.status), status.externalId);
    }
    if (status.status === "FAILED") {
      return this.products.updateServiceStatus(service.id, "FAILED", status.externalId);
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

    const moduleName = (service.product ? effectiveModule(service.product) : undefined) ?? service.moduleName ?? undefined;
    if (!moduleName) {
      throw new BadRequestException("Service has no provisioning module");
    }
    const provider = this.external.hostingProvider(moduleName, serviceProductType(service));
    return provider.restart(service.externalId);
  }

  updateServiceStatus(id: string, status: string) {
    return this.products.updateServiceStatus(id, status);
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
    if (serviceProductType(service) === "DOMAIN") {
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
    if (serviceProductType(service) !== "DOMAIN") {
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

  private completeReadyOrdersForService(serviceId: string) {
    const repository = this.products as ProductsRepository & {
      completeReadyOrdersForService?: (serviceId: string) => Promise<unknown>;
    };
    return repository.completeReadyOrdersForService?.(serviceId) ?? Promise.resolve();
  }
}

function effectiveModule(product: { category?: { provisioningModule?: string | null } | null; provisioningModule?: string | null; type?: string }) {
  if (product.category) {
    return normalizeModule(product.category.provisioningModule);
  }
  return normalizeModule(product.provisioningModule) ?? (["VPS", "DEDICATED_SERVER"].includes(product.type ?? "") ? "hetzner" : "virtualmin");
}

function normalizeModule(value: string | null | undefined) {
  const moduleName = String(value ?? "").trim();
  if (!moduleName || moduleName === "none") {
    return undefined;
  }
  return moduleName;
}

function domainFromConfiguration(configuration: unknown) {
  if (typeof configuration !== "object" || configuration === null || Array.isArray(configuration)) {
    return undefined;
  }
  const value = (configuration as Record<string, unknown>).domainName;
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function refreshDomainName(externalId: string | null | undefined, configuration: unknown) {
  const configured = domainFromConfiguration(configuration);
  if (!externalId || externalId.startsWith("virtualmin_")) {
    return configured;
  }
  return externalId;
}

function dateFromProvider(status: { expiresAt?: Date | string; metadata?: Record<string, unknown> }) {
  const value = status.expiresAt ?? status.metadata?.expiresAt;
  if (value instanceof Date) {
    return Number.isFinite(value.getTime()) ? value : undefined;
  }
  if (typeof value !== "string") {
    return undefined;
  }
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? date : undefined;
}

function customerPlanConfigs(plan: { id: string; limits?: Record<string, string | undefined> }) {
  const limits = plan.limits ?? {};
  return [
    config("disk_space", "Storage", limits.disk),
    config("bandwidth", "Bandwidth", limits.bandwidth),
    config("databases", "Databases", limits.databases),
    config("mailboxes", "Email accounts", limits.mailboxes),
    config("subdomains", "Subdomains", limits.subServers),
    { key: "virtualmin_plan", label: "Virtualmin Plan", required: true, values: [plan.id] }
  ].filter((item): item is { key: string; label: string; required: boolean; values: string[] } => Boolean(item));
}

function config(key: string, label: string, value?: string) {
  return value ? { key, label, required: false, values: [value] } : undefined;
}

function slugify(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "plan";
}

function normalizeVirtualminPlan(plan: { id: string; limits?: Record<string, string | undefined>; name: string; raw?: Record<string, unknown> }) {
  const values = virtualminValues(plan.raw?.values);
  const value = (key: string) => values[key]?.[0];
  return {
    ...plan,
    name: value("name") ?? plan.name,
    limits: {
      bandwidth: humanBandwidth(value("maximum_bw") ?? plan.limits?.bandwidth),
      databases: value("maximum_dbs") ?? plan.limits?.databases,
      disk: value("server_quota") ?? value("administrator_quota") ?? plan.limits?.disk,
      mailboxes: value("maximum_mailbox") ?? plan.limits?.mailboxes,
      subServers: value("maximum_doms") ?? plan.limits?.subServers
    }
  };
}

function detectPlanDifferences(plans: Array<{ id: string; limits?: Record<string, string | undefined>; name: string }>) {
  const keys = [
    ["disk", "Storage"],
    ["bandwidth", "Bandwidth"],
    ["databases", "Databases"],
    ["mailboxes", "Email accounts"],
    ["subServers", "Subdomains"]
  ] as const;

  return plans.map((plan) => ({
    ...plan,
    differences: keys
      .filter(([key]) => new Set(plans.map((item) => item.limits?.[key]).filter(Boolean)).size > 1)
      .map(([key, label]) => ({ key, label, value: plan.limits?.[key] ?? "Unknown" }))
  }));
}

function virtualminValues(value: unknown): Record<string, string[]> {
  if (typeof value !== "string") {
    return {};
  }
  try {
    const parsed = JSON.parse(value);
    if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
      return {};
    }
    return parsed as Record<string, string[]>;
  } catch {
    return {};
  }
}

function humanBandwidth(value?: string) {
  const bytes = Number(value);
  if (!Number.isFinite(bytes) || bytes <= 0) {
    return value;
  }
  const gib = bytes / 1024 / 1024 / 1024;
  return gib >= 1024 ? `${Math.round(gib / 1024)} TiB` : `${Math.round(gib)} GiB`;
}

function serviceProductType(service: { product?: { type: string } | null; productSnapshot?: unknown; moduleName?: string | null }): string {
  if (service.product?.type) return service.product.type;
  const snap = service.productSnapshot as { type?: string } | null | undefined;
  if (snap?.type) return snap.type;
  // Derive from module name as last resort
  if (service.moduleName === "resellbiz") return "DOMAIN";
  if (service.moduleName === "virtualmin") return "SHARED_HOSTING";
  return "SHARED_HOSTING";
}
