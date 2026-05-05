import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { hash } from "bcryptjs";
import { BillingService } from "../billing/billing.service";
import { ExternalService } from "../external/external.service";
import { UsersRepository } from "../users/users.repository";
import { DomainAvailabilityService } from "./domain-availability.service";
import { DomainPricingService } from "./domain-pricing.service";
import type { CheckoutOrderDto, OrderItemDto, PayOrderDto, PreviewOrderDto } from "./dto/order.dto";
import { OrdersRepository, type PricedOrderItem } from "./orders.repository";

@Injectable()
export class OrdersService {
  constructor(
    private readonly orders: OrdersRepository,
    private readonly billing: BillingService,
    private readonly external: ExternalService,
    private readonly users: UsersRepository,
    private readonly domainPricing: DomainPricingService,
    private readonly domainAvailability?: DomainAvailabilityService
  ) {}

  homepageProducts() {
    return this.orders.listHomepageProducts();
  }

  listAdminOrders() {
    return this.orders.listOrders();
  }

  listDomainPrices() {
    return this.domainPricing.listStoredPrices();
  }

  upsertDomainPrice(input: { action: string; amountCents: number; manual?: boolean; suggested?: boolean; tld: string; years: number }) {
    return this.domainPricing.upsertStoredPrice(input);
  }

  syncDomainPrices(customerId?: number) {
    return this.domainPricing.syncFromResellBiz(customerId);
  }

  async searchDomain(domain: string) {
    if (!this.domainAvailability) {
      throw new BadRequestException("Domain availability service is not configured");
    }

    const availability = await this.domainAvailability.check(domain);
    const products = await this.orders.listHomepageProducts();
    const domainProduct = products.find((product) => product.type === "DOMAIN");
    const fallbackCents = domainProduct?.prices[0]?.amountCents ?? 0;
    const price = await this.domainPricing.priceFor(domain, fallbackCents, availability.available ? "register" : "transfer");

    const suggestions = await this.suggestedDomainResults(domain, availability.tld, domainProduct?.id, fallbackCents);

    return {
      ...availability,
      action: availability.available ? "register" : "transfer",
      price,
      productId: domainProduct?.id,
      suggestions
    };
  }

  async getOrder(id: string) {
    const order = await this.orders.findOrder(id);
    if (!order) {
      throw new NotFoundException("Order not found");
    }

    return order;
  }

  async previewOrder(dto: PreviewOrderDto) {
    const items = await this.priceItems(dto.items);
    const subtotalCents = items.reduce((sum, item) => sum + item.unitAmountCents * item.quantity, 0);
    const setupFeeCents = items.reduce((sum, item) => sum + item.setupFeeCents, 0);
    const taxableCents = subtotalCents + setupFeeCents;
    const taxAmountCents = Math.round(taxableCents * 0.19);

    return {
      currency: "EUR",
      items,
      setupFeeCents,
      subtotalCents,
      taxAmountCents,
      totalCents: taxableCents + taxAmountCents
    };
  }

  async checkout(dto: CheckoutOrderDto) {
    if (!dto.customer.password) {
      throw new BadRequestException("Password is required");
    }

    const existing = await this.users.findByEmail(dto.customer.email.toLowerCase());
    if (existing) {
      throw new BadRequestException("Email is already registered. Please log in before ordering.");
    }

    const preview = await this.previewOrder(dto);
    const user = await this.users.createUser({
      countryCode: dto.customer.countryCode ?? "DE",
      customerType: dto.customer.customerType ?? "INDIVIDUAL",
      email: dto.customer.email.toLowerCase(),
      name: dto.customer.name,
      passwordHash: await hash(dto.customer.password, 12),
      vatId: dto.customer.vatId
    });
    const invoice = await this.billing.createInvoice({
      buyerCountryCode: dto.customer.countryCode ?? "DE",
      buyerVatId: dto.customer.vatId,
      dueAt: new Date(Date.now() + 1000 * 60 * 60 * 24 * 7).toISOString(),
      isBusinessCustomer: dto.customer.customerType === "BUSINESS",
      lines: preview.items.map((item) => ({
        description: item.description,
        quantity: 1,
        unitAmountCents: item.totalCents
      })),
      status: "UNPAID",
      userId: user.id
    });
    const order = await this.orders.createOrder({
      customerSnapshot: {
        address: dto.customer.address,
        countryCode: dto.customer.countryCode ?? "DE",
        customerType: dto.customer.customerType ?? "INDIVIDUAL",
        email: dto.customer.email.toLowerCase(),
        companyName: dto.customer.companyName,
        name: dto.customer.name,
        phone: dto.customer.phone,
        vatId: dto.customer.vatId
      },
      invoiceId: invoice.id,
      items: preview.items,
      setupFeeCents: preview.setupFeeCents,
      subtotalCents: invoice.subtotalCents,
      taxAmountCents: invoice.taxAmountCents,
      totalCents: invoice.totalCents,
      userId: user.id
    });

    return { invoice, order };
  }

  async payOrder(id: string, dto: PayOrderDto) {
    const order = await this.orders.findOrderForActivation(id);
    if (!order) {
      throw new NotFoundException("Order not found");
    }
    if (!order.invoiceId) {
      throw new BadRequestException("Order has no invoice");
    }

    const invoice = await this.billing.payInvoice(order.invoiceId, dto);
    if (invoice.status !== "PAID") {
      return { invoice, order: await this.orders.findOrderForActivation(id) };
    }

    await this.orders.markOrderPaid(id, dto.method);
    const failures: string[] = [];

    for (const item of order.items) {
      try {
        await this.activateItem(order.userId, item, order.customerSnapshot);
      } catch (error) {
        const message = error instanceof Error ? error.message : "Provisioning failed";
        failures.push(message);
        await this.orders.markItemFailed(item.id, message);
      }
    }

    if (failures.length > 0) {
      await this.orders.markOrderFailed(id, failures.join("; "));
    } else {
      await this.orders.markOrderComplete(id);
    }

    return {
      invoice,
      order: await this.orders.findOrderForActivation(id)
    };
  }

  private async priceItems(items: OrderItemDto[]): Promise<PricedOrderItem[]> {
    if (items.length === 0) {
      throw new BadRequestException("Order needs at least one item");
    }

    return Promise.all(items.map((item) => this.priceItem(item)));
  }

  private async priceItem(item: OrderItemDto): Promise<PricedOrderItem> {
    const product = await this.orders.findProduct(item.productId);
    if (!product) {
      throw new NotFoundException("Product not found");
    }

    const price = item.productPriceId
      ? product.prices.find((candidate) => candidate.id === item.productPriceId)
      : product.prices[0];
    if (!price) {
      throw new BadRequestException(`No active price for ${product.name}`);
    }

    const quantity = item.quantity ?? 1;
    const configuration = item.configuration ?? {};
    let unitAmountCents = price.amountCents;
    let description = product.name;

    if (product.type === "DOMAIN") {
      if (!item.domainName) {
        throw new BadRequestException("Domain orders need a domain name");
      }
      const action = domainAction(configuration) === "transfer" ? "transfer" : "register";
      const livePrice = await this.domainPricing.priceFor(item.domainName, price.amountCents, action);
      unitAmountCents = livePrice.amountCents;
      description = `${item.domainName} domain ${action}`;
      configuration.domainPricing = livePrice;
    }

    return {
      billingCycle: price.billingCycle,
      configuration,
      description,
      domainName: item.domainName,
      productId: product.id,
      productPriceId: price.id,
      quantity,
      setupFeeCents: price.setupFeeCents,
      totalCents: unitAmountCents * quantity + price.setupFeeCents,
      type: product.type,
      unitAmountCents
    };
  }

  private async activateItem(userId: string, item: {
    billingCycle: string;
    configuration: unknown;
    domainName?: string | null;
    id: string;
    productId: string;
    productPriceId: string;
    type: string;
  }, customerSnapshot?: unknown) {
    const service = await this.orders.createServiceForItem(
      item,
      userId,
      item.type === "DOMAIN" ? "PROVISIONING" : "ACTIVE"
    );
    await this.billing.createSubscription({
      billingCycle: item.billingCycle,
      nextInvoiceAt: nextBillingDate(new Date(), item.billingCycle).toISOString(),
      productPriceId: item.productPriceId,
      serviceId: service.id,
      userId
    });

    if (item.type !== "DOMAIN") {
      await this.orders.markItemActive(item.id);
      return;
    }

    if (!item.domainName) {
      throw new BadRequestException("Domain order item is missing domain name");
    }

    await this.orders.markItemProvisioning(item.id);
    const provisioning =
      domainAction(item.configuration) === "transfer"
        ? await this.external.resellBiz.transfer({
            authCode: transferAuthCode(item.configuration),
            customerContact: domainCustomerContact(customerSnapshot),
            domain: item.domainName,
            extraAttributes: domainExtraAttributes(item.configuration),
            nameServers: domainNameServers(item.configuration),
            years: yearsFromCycle(item.billingCycle)
          })
        : await this.external.resellBiz.register({
            customerContact: domainCustomerContact(customerSnapshot),
            domain: item.domainName,
            extraAttributes: domainExtraAttributes(item.configuration),
            nameServers: domainNameServers(item.configuration),
            years: yearsFromCycle(item.billingCycle)
          });

    await this.orders.createDomainRecord({
      domain: item.domainName,
      externalId: provisioning.externalId,
      raw: provisioning.metadata,
      serviceId: service.id,
      status: provisioning.status === "FAILED" ? "FAILED" : provisioning.status === "ACTIVE" ? "ACTIVE" : "PENDING",
      userId
    });

    if (provisioning.status === "FAILED") {
      throw new BadRequestException("ResellBiz domain registration failed");
    }

    await this.orders.markItemActive(item.id, provisioning.externalId, provisioning.metadata);
  }

  private async suggestedDomainResults(domain: string, searchedTld: string, productId: string | undefined, fallbackCents: number) {
    const label = domain.split(".").slice(0, -1).join(".");
    const tlds = (await this.domainPricing.listSuggestedTlds()).filter((tld) => tld !== searchedTld);
    const results = [];

    for (const tld of tlds) {
      const suggestedDomain = `${label}.${tld}`;
      if (!this.domainAvailability) {
        continue;
      }
      const availability = await this.domainAvailability.check(suggestedDomain);
      const action = availability.available ? "register" : "transfer";
      const price = await this.domainPricing.priceFor(suggestedDomain, fallbackCents, action);
      results.push({ ...availability, action, price, productId });
    }

    return results;
  }
}

function yearsFromCycle(cycle: string) {
  return Number(cycle.match(/^YEAR_(\d+)$/)?.[1] ?? 1);
}

function nextBillingDate(date: Date, cycle: string) {
  const next = new Date(date);
  const months = {
    MONTHLY: 1,
    QUARTERLY: 3,
    SEMI_ANNUAL: 6,
    YEAR_1: 12,
    YEAR_2: 24,
    YEAR_3: 36,
    YEAR_4: 48
  }[cycle];
  next.setMonth(next.getMonth() + (months ?? 12));
  return next;
}

function domainNameServers(configuration: unknown) {
  if (!isRecord(configuration) || !Array.isArray(configuration.nameServers)) {
    return undefined;
  }

  return configuration.nameServers.filter((value): value is string => typeof value === "string" && value.length > 0);
}

function domainExtraAttributes(configuration: unknown) {
  if (!isRecord(configuration) || !isRecord(configuration.extraAttributes)) {
    return { tnc: "Y" };
  }

  return { tnc: "Y", ...configuration.extraAttributes } as Record<string, boolean | number | string>;
}

function domainAction(configuration: unknown) {
  if (!isRecord(configuration) || configuration.domainAction !== "transfer") {
    return "register";
  }

  return "transfer";
}

function transferAuthCode(configuration: unknown) {
  if (!isRecord(configuration) || typeof configuration.transferAuthCode !== "string" || !configuration.transferAuthCode) {
    throw new BadRequestException("Transfer orders need an authorization code");
  }

  return configuration.transferAuthCode;
}

function domainCustomerContact(snapshot: unknown) {
  if (!isRecord(snapshot)) {
    throw new BadRequestException("Domain order is missing customer contact data");
  }
  const address = isRecord(snapshot.address) ? snapshot.address : {};
  const phone = splitPhone(String(snapshot.phone ?? ""));

  return {
    addressLine1: requiredString(address.line1, "Address"),
    city: requiredString(address.city, "City"),
    company: optionalString(snapshot.companyName),
    country: requiredString(snapshot.countryCode, "Country"),
    email: requiredString(snapshot.email, "Email").toLowerCase(),
    name: requiredString(snapshot.name, "Name"),
    phone: phone.number,
    phoneCountryCode: phone.countryCode,
    state: optionalString(address.state),
    vatId: optionalString(snapshot.vatId),
    zipCode: requiredString(address.postalCode, "Zip")
  };
}

function splitPhone(value: string) {
  const match = value.trim().match(/^\+?(\d{1,3})\s*(.*)$/);
  const countryCode = match?.[1] ?? "49";
  const number = (match?.[2] ?? value).replace(/[^\d]/g, "");
  if (!number) {
    throw new BadRequestException("Phone number is required");
  }

  return { countryCode, number };
}

function requiredString(value: unknown, label: string) {
  if (typeof value !== "string" || !value.trim()) {
    throw new BadRequestException(`${label} is required for domain registration`);
  }

  return value.trim();
}

function optionalString(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
