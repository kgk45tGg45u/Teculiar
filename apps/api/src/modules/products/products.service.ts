import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import { isStaffViewer, maskService, shouldMask } from "../../common/pii-mask";
import { ExternalService } from "../external/external.service";
import { canonicalModuleName, effectiveProductModule, effectiveServiceModule } from "../module-registry/module-catalog";
import { ModuleRegistryService } from "../module-registry/module-registry.service";
import { AdminAddOnDto } from "./dto/addon.dto";
import { CreateProductDto, ProductCategoryDto } from "./dto/create-product.dto";
import { ProductsRepository } from "./products.repository";

@Injectable()
export class ProductsService {
  constructor(
    private readonly products: ProductsRepository,
    private readonly external: ExternalService,
    private readonly modules: ModuleRegistryService
  ) {}

  listProducts() {
    return this.products.listProducts();
  }

  listCategories() {
    return this.products.listCategories();
  }

  createCategory(dto: ProductCategoryDto) {
    return this.products.createCategory(dto);
  }

  updateCategory(id: string, dto: ProductCategoryDto) {
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

  listAddOns() {
    return this.products.listAddOns();
  }

  createAddOn(dto: AdminAddOnDto) {
    return this.products.createAddOn(dto);
  }

  updateAddOn(id: string, dto: AdminAddOnDto) {
    return this.products.updateAddOn(id, dto);
  }

  deleteAddOn(id: string) {
    return this.products.deleteAddOn(id);
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
    const moduleName = effectiveProductModule(product);
    if (!moduleName) {
      return service;
    }
    const provider = this.external.hostingProvider(moduleName, product.type);
    const provisioning = await provider.provision({
      serviceId: service.id,
      productType: product.type,
      options: input.configuration
    });
    if (provisioning.status !== "FAILED") {
      // Module-created account: eligible for the activation email sweep (see notifyServiceActivated).
      await this.products.markServiceModuleProvisioned(service.id).catch(() => undefined);
    }

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
      // Scheduled/admin reconcile — the authority that may demote a vanished account.
      await this.refreshService(service.id, undefined, { allowDemote: true }).catch(() => undefined);
      refreshed += 1;
    }
    return { checked: services.length, refreshed };
  }

  async refreshAllDomainStatuses() {
    // No registrar module active → registrations are managed manually; nothing to reconcile.
    const activeRegistrars = new Set(await this.modules.activeModuleNames("registrar"));
    if (activeRegistrars.size === 0) {
      return { checked: 0, refreshed: 0, skipped: "no_active_registrar" };
    }
    const domains = await this.products.listDomainRecords();
    let refreshed = 0;
    let checked = 0;
    for (const domain of domains) {
      // Only domains registered through a currently-active registrar module are reconciled. Manual
      // (admin-registered) domains and domains owned by a now-disabled registrar are left untouched.
      const moduleName = canonicalModuleName(domain.registrarModule ?? domain.registrarProvider);
      if (!moduleName || !activeRegistrars.has(moduleName)) {
        continue;
      }
      const provider = this.external.registrarProvider(moduleName);
      if (!provider?.status || ["CANCELLED"].includes(domain.status)) {
        continue;
      }
      checked += 1;
      // A connection/auth error throws and is skipped (inconclusive). A definitive "not found on the
      // registrar panel" resolves to CANCELLED so stale domains stop showing as active.
      const status = await provider.status(domain.domain).catch(() => undefined);
      if (!status) {
        continue;
      }
      const expiresAt = dateFromProvider(status);
      const nextStatus = status.status === "ACTIVE"
        ? "ACTIVE"
        : status.status === "FAILED"
          ? "FAILED"
          : status.status === "CANCELLED"
            ? "CANCELLED"
            : domain.status;
      if (nextStatus === domain.status) {
        continue;
      }
      await this.products.updateDomainRecordStatus(domain.id, nextStatus, status.externalId, expiresAt);
      if (domain.service && serviceProductType(domain.service) === "DOMAIN" && ["ACTIVE", "FAILED", "CANCELLED"].includes(nextStatus)) {
        await this.products.updateServiceStatus(domain.service.id, nextStatus, status.externalId);
      }
      refreshed += 1;
    }
    return { checked, refreshed };
  }

  async refreshAllDomainExpirations() {
    // Only refresh expiry dates when a registrar module is active, and only for domains it manages.
    const activeRegistrars = new Set(await this.modules.activeModuleNames("registrar"));
    if (activeRegistrars.size === 0) {
      return { checked: 0, refreshed: 0, skipped: "no_active_registrar" };
    }
    const domains = await this.products.listDomainRecords();
    let refreshed = 0;
    let checked = 0;
    for (const domain of domains) {
      const moduleName = canonicalModuleName(domain.registrarModule ?? domain.registrarProvider);
      if (!moduleName || !activeRegistrars.has(moduleName)) {
        continue;
      }
      const provider = this.external.registrarProvider(moduleName);
      if (!provider?.status || ["CANCELLED"].includes(domain.status)) {
        continue;
      }
      checked += 1;
      const status = await provider.status(domain.domain).catch(() => undefined);
      const expiresAt = status ? dateFromProvider(status) : undefined;
      if (!status || !expiresAt) {
        continue;
      }
      await this.products.updateDomainRecordExpiration(domain.id, status.externalId, expiresAt);
      refreshed += 1;
    }
    return { checked, refreshed };
  }

  async refreshAllHostingStatuses() {
    const services = await this.products.listServicesByProductType("SHARED_HOSTING");
    let refreshed = 0;
    const changed: Array<{ domain: string; from: string; id: string; to: string }> = [];
    for (const service of services) {
      const before = service.status;
      // Scheduled cron reconcile — the authority that may demote a vanished account.
      const updated = await this.refreshService(service.id, undefined, { allowDemote: true }).catch(() => undefined);
      refreshed += 1;
      const after = updated?.status ?? before;
      if (updated && after !== before) {
        changed.push({
          domain: refreshDomainName(service.externalId, service.configuration) ?? service.externalId ?? service.id,
          from: before,
          id: service.id,
          to: after
        });
      }
    }
    return { changed, checked: services.length, refreshed };
  }

  async getService(id: string, user?: { roles?: string[]; sub: string }) {
    // Any staff-portal role may view any service; "agent" only masked.
    const staff = isStaffViewer(user?.roles);
    const service = await this.products.findService(id, staff ? undefined : user?.sub);
    if (!service) {
      throw new NotFoundException("Service not found");
    }
    if (user && !staff && service.userId !== user.sub) {
      throw new NotFoundException("Service not found");
    }
    return shouldMask(user?.roles) ? maskService(service) : service;
  }

  async hostingControlPanel(id: string, user?: { roles?: string[]; sub: string }) {
    // The panel response is an auto-login URL into the customer's real hosting account —
    // never for the read-only agent credential, even though it may view the service itself.
    if (shouldMask(user?.roles)) {
      throw new ForbiddenException("The agent role cannot access customer hosting panels");
    }
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
    // Belt and braces: AgentWriteBlockGuard already 403s this POST for the agent role.
    if (shouldMask(user?.roles)) {
      throw new ForbiddenException("The agent role cannot access customer hosting panels");
    }
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

  // `allowDemote` gates the one risky transition: marking a live ACTIVE hosting account
  // TERMINATED/SUSPENDED. Only the scheduled cron reconcile passes it, so the stored status is
  // owned by the cron and a single client/admin page view can never flip a working service — the
  // dashboard list and the service detail always read the same safely-stored value.
  async refreshService(id: string, userId?: string, options: { allowDemote?: boolean } = {}) {
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
    const refreshableStatus = ["PENDING", "PROVISIONING", "FAILED", "PROVISIONING_FAILED"].includes(service.status);
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
    if (["PENDING", "PROVISIONING"].includes(service.status)) {
      const runningCreate = await this.products.findRunningModuleLogForService?.(service.id, "create");
      if (runningCreate) {
        return service;
      }
    }
    const moduleName = effectiveServiceModule(service);
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
      // A live service is only changed when the panel DEFINITIVELY reports the account is gone
      // (status "FAILED" = "does not exist"). An inconclusive result — "QUEUED" (panel unreachable)
      // or "PROVISIONING" (reachable but not listed yet) — must NOT flip a working service, otherwise
      // a transient Virtualmin outage would mass-change every account.
      //
      // When a Virtualmin account no longer exists it is marked TERMINATED (the panel record is
      // gone). We NEVER issue an automatic delete-domain — Virtualmin must not terminate accounts on
      // its own; this only reflects a deletion the admin already made on the panel. Suspension (for
      // non-payment) is handled separately in billing maintenance, not here.
      //
      // This demotion is reserved for the scheduled cron reconcile (`allowDemote`). On-demand client
      // and admin page views never demote, so the stored status is the single source of truth and a
      // working service can't appear ACTIVE in the list yet flip to TERMINATED the moment its detail
      // page is opened. The cron keeps the stored value accurate within its interval.
      if (status.status === "FAILED" && options.allowDemote) {
        const terminated = moduleName === "virtualmin";
        return this.products.updateServiceStatus(service.id, terminated ? "TERMINATED" : "SUSPENDED", status.externalId);
      }
      return service;
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

    const moduleName = effectiveServiceModule(service);
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
