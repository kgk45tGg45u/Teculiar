import { BadRequestException, Injectable, NotFoundException, OnModuleInit, UnauthorizedException } from "@nestjs/common";
import { compare, hash } from "bcryptjs";
import { billingCycles, domainCycleFor, isYearlyCycle } from "@teculiar/shared";
import { formatMoney } from "../../common/i18n";
import { BillingService } from "../billing/billing.service";
import { EmailService } from "../email/email.service";
import { ExternalService } from "../external/external.service";
import { UsersRepository } from "../users/users.repository";
import { DomainAvailabilityService } from "./domain-availability.service";
import { DomainPricingService } from "./domain-pricing.service";
import type { AdminCreateOrderDto, CheckoutOrderDto, OrderItemDto, PayOrderDto, PreviewOrderDto } from "./dto/order.dto";
import { OrdersRepository, type PricedOrderItem } from "./orders.repository";

@Injectable()
export class OrdersService implements OnModuleInit {
  constructor(
    private readonly orders: OrdersRepository,
    private readonly billing: BillingService,
    private readonly external: ExternalService,
    private readonly users: UsersRepository,
    private readonly domainPricing: DomainPricingService,
    private readonly domainAvailability?: DomainAvailabilityService,
    private readonly emails?: EmailService
  ) {}

  onModuleInit() {
    const billing = this.billing as unknown as { registerOnCheckoutInvoicePaid?: (fn: (invoiceId: string) => Promise<void>) => void };
    if (typeof billing.registerOnCheckoutInvoicePaid === "function") {
      billing.registerOnCheckoutInvoicePaid(async (invoiceId) => {
        const result = await this.ensureOrderForInvoice(invoiceId).catch(() => null);
        if (result && !result.existed && result.order?.id) {
          await this.orders.markOrderPaid(result.order.id as string).catch(() => undefined);
        }
      });
    }
  }

  async homepageProducts(categorySlug?: string) {
    const products = await this.orders.listHomepageProducts(categorySlug);
    const minimumDomainPrice = await this.domainPricing.minimumRegisterPrice();
    return products.map((product) =>
      product.type === "DOMAIN" && minimumDomainPrice !== undefined ? { ...product, minimumPriceCents: minimumDomainPrice } : product
    );
  }

  listAdminOrders() {
    return this.orders.listOrders();
  }

  listDomainPrices() {
    return this.domainPricing.listStoredPrices();
  }

  listStorefrontDomainPrices() {
    return this.domainPricing.listStorefrontPrices();
  }

  upsertDomainPrice(input: { action: string; amountCents?: number; manual?: boolean; suggested?: boolean; tld: string; years: number }) {
    return this.domainPricing.upsertStoredPrice(input);
  }

  syncDomainPrices(customerId?: number) {
    return this.domainPricing.syncFromResellBiz(customerId);
  }

  async searchDomain(domain: string, yearsInput?: string | number) {
    if (!this.domainAvailability) {
      throw new BadRequestException("Domain availability service is not configured");
    }

    const years = normalizedDomainYears(yearsInput);
    const availability = await this.domainAvailability.check(domain);
    const products = await this.orders.listHomepageProducts();
    const domainProduct = products.find((product) => product.type === "DOMAIN") ?? (await this.orders.findProductByType("DOMAIN"));
    const fallbackCents = domainProductFallbackCents(domainProduct, years);
    const price = await this.domainPricing.priceFor(domain, fallbackCents, availability.available ? "register" : "transfer", years);

    const suggestions = await this.suggestedDomainResults(domain, availability.tld, domainProduct?.id, fallbackCents);

    return {
      ...availability,
      action: availability.available ? "register" : "transfer",
      price,
      productId: domainProduct?.id,
      suggestions
    };
  }

  async getOrder(id: string, user?: { roles?: string[]; sub: string }) {
    const order = await this.orders.findOrder(id);
    if (!order) {
      throw new NotFoundException("Order not found");
    }
    const staff = user?.roles?.some((role) => ["admin", "staff"].includes(role));
    if (user && !staff && order.userId !== user.sub) {
      throw new NotFoundException("Order not found");
    }

    return order;
  }

  updateOrderStatus(id: string, status: string) {
    return this.orders.updateOrderStatus(id, orderStatusFromAdmin(status));
  }

  async previewOrder(dto: PreviewOrderDto) {
    const items = await this.priceItems(dto.items);
    const subtotalCents = items.reduce((sum, item) => sum + item.unitAmountCents * item.quantity, 0);
    const setupFeeCents = items.reduce((sum, item) => sum + item.setupFeeCents, 0);
    const taxableCents = subtotalCents + setupFeeCents;
    const vat = await this.billing.vatForBuyer({
      countryCode: dto.customer?.countryCode,
      isBusinessCustomer: dto.customer?.customerType === "BUSINESS",
      vatId: dto.customer?.vatId
    });
    const taxAmountCents = Math.round(taxableCents * (vat.rate / 100));

    return {
      currency: (await this.billing.mainCurrency?.()) ?? "EUR",
      items,
      reverseCharge: vat.reverseCharge,
      setupFeeCents,
      subtotalCents,
      taxAmountCents,
      totalCents: taxableCents + taxAmountCents,
      vatPercent: vat.rate
    };
  }

  async checkout(dto: CheckoutOrderDto, authUser?: { sub: string }) {
    const submittedEmail = dto.customer.email.trim().toLowerCase();
    const authAccount = authUser?.sub ? await this.users.findById(authUser.sub) : null;
    if (authUser?.sub && !authAccount) {
      throw new UnauthorizedException("Invalid access token");
    }
    const email = authAccount?.email ?? submittedEmail;
    const existingByEmail = authAccount ? null : await this.users.findByEmail(email, "CLIENT");
    const existing = authAccount ?? existingByEmail;
    const isLoggedInAccount = Boolean(authAccount);
    if (!isLoggedInAccount && !dto.customer.password) {
      throw new BadRequestException("Password is required");
    }
    if (existingByEmail && !(await compare(dto.customer.password, existingByEmail.passwordHash))) {
      throw new BadRequestException("Email is already registered. Please log in before ordering.");
    }

    const preview = await this.previewOrder(dto);
    if (preview.items.some((item) => item.type === "DOMAIN")) {
      assertDomainRegistrantContact(dto.customer);
    }

    // Domain/hosting names must be unique across the whole system, regardless of who is ordering
    // (new or existing client), so run this check even when there is no matching account yet.
    await this.assertOrderItemsAvailable(preview.items, "An invoice can be created manually instead.");

    const pendingPasswordHash = existing ? undefined : await hash(dto.customer.password, 12);
    const user =
      existing ??
      (await this.users.findOrCreatePendingCheckoutUser());
    const pendingCheckout = pendingPasswordHash
      ? {
          address: dto.customer.address,
          companyName: dto.customer.companyName,
          countryCode: dto.customer.countryCode ?? "DE",
          customerType: dto.customer.customerType ?? "INDIVIDUAL",
          email,
          name: dto.customer.name,
          passwordHash: pendingPasswordHash,
          phone: dto.customer.phone,
          vatId: dto.customer.vatId
        }
      : undefined;
    const invoice = await this.billing.createInvoice({
      buyerCountryCode: dto.customer.countryCode ?? "DE",
      buyerVatId: dto.customer.vatId,
      customerSnapshot: customerSnapshot(dto.customer, email, existing?.customerNumber),
      dueAt: new Date(Date.now() + 1000 * 60 * 60 * 24 * 7).toISOString(),
      isBusinessCustomer: dto.customer.customerType === "BUSINESS",
      lines: preview.items.map((item) => ({
        billingCycle: item.billingCycle,
        description: item.description,
        lifecycleAction: item.type === "DOMAIN" ? domainAction(item.configuration) : "create",
        quantity: invoiceLineQuantity(item),
        type: item.type === "DOMAIN" ? "DOMAIN" : "SERVICE",
        unitAmountCents: invoiceLineUnitAmount(item)
      })),
      orderSnapshot: {
        items: preview.items,
        pendingCheckout,
        setupFeeCents: preview.setupFeeCents,
        subtotalCents: preview.subtotalCents,
        taxAmountCents: preview.taxAmountCents,
        totalCents: preview.totalCents
      },
      status: "PENDING",
      suppressNewInvoiceEmail: true,
      userId: user.id
    } as Parameters<typeof this.billing.createInvoice>[0]);
    // Order creation is deferred to payment confirmation time.
    // The invoice ID doubles as the checkout session ID until payment succeeds.
    return { invoice, order: { id: invoice.id } };
  }

  async createAdminOrder(dto: AdminCreateOrderDto) {
    const user = await this.users.findById(dto.userId);
    if (!user) {
      throw new NotFoundException("Client not found");
    }
    const items = await this.priceItems(dto.items);

    await this.assertOrderItemsAvailable(items, "Create an invoice manually instead.");
    const subtotalCents = items.reduce((sum, item) => sum + item.unitAmountCents * item.quantity, 0);
    const setupFeeCents = items.reduce((sum, item) => sum + item.setupFeeCents, 0);
    const taxableCents = subtotalCents + setupFeeCents;
    const vat = await this.billing.vatForBuyer({
      countryCode: user.countryCode,
      isBusinessCustomer: user.customerType === "BUSINESS",
      vatId: user.vatId
    });
    const taxAmountCents = Math.round(taxableCents * (vat.rate / 100));
    const snapshot = customerSnapshotFromUser(user);
    const defaultDueAt = new Date(Date.now() + 1000 * 60 * 60 * 24 * 7).toISOString();
    // Order-level discount: a flat amount billed as its own invoice line (never distributed into the
    // product/domain lines, which keep their full price + VAT). The line carries NO VAT (vatRate 0) —
    // a €1 discount reduces the invoice total by exactly €1 while VAT stays computed on the full
    // product lines. A "recurring" discount is additionally stored as an internal coupon on the primary
    // product subscription so every Cron renewal invoice re-applies the same line. The discount is
    // capped at the order's net so the total never goes negative.
    const discount = orderDiscount(dto);
    const discountCoupon = discount?.type === "recurring" ? await this.billing.createAdHocDiscountCoupon(discount.amountCents) : undefined;
    const invoiceLines: Parameters<BillingService["createInvoice"]>[0]["lines"] = items.map((item) => ({
      billingCycle: item.billingCycle,
      description: item.description,
      lifecycleAction: item.type === "DOMAIN" ? domainAction(item.configuration) : "create",
      quantity: invoiceLineQuantity(item),
      type: item.type === "DOMAIN" ? "DOMAIN" : "SERVICE",
      unitAmountCents: invoiceLineUnitAmount(item)
    }));
    if (discount) {
      const netTotalCents = invoiceLines.reduce((sum, line) => sum + line.quantity * line.unitAmountCents, 0);
      const discountNetCents = Math.min(netTotalCents, discount.amountCents);
      invoiceLines.push({
        description: await this.discountLineLabel(),
        quantity: 1,
        type: "DISCOUNT",
        unitAmountCents: -discountNetCents,
        vatRate: 0
      });
    }
    const invoice = await this.billing.createInvoice({
      buyerCountryCode: user.countryCode ?? "DE",
      buyerVatId: user.vatId ?? undefined,
      customerSnapshot: snapshot,
      dueAt: dto.firstDueAt ? new Date(dto.firstDueAt).toISOString() : defaultDueAt,
      issuedAt: dto.placedAt ? new Date(dto.placedAt).toISOString() : undefined,
      isBusinessCustomer: user.customerType === "BUSINESS",
      lines: invoiceLines,
      orderSnapshot: {
        adminNotes: dto.notes,
        items,
        setupFeeCents,
        subtotalCents,
        taxAmountCents,
        totalCents: taxableCents + taxAmountCents
      },
      status: "PENDING",
      userId: user.id
    });
    const order = await this.orders.createOrder({
      customerSnapshot: snapshot,
      invoiceId: invoice.id,
      items,
      placedAt: dto.placedAt ? new Date(dto.placedAt) : undefined,
      setupFeeCents,
      subtotalCents: invoice.subtotalCents,
      taxAmountCents: invoice.taxAmountCents,
      totalCents: invoice.totalCents,
      userId: user.id
    });
    if (typeof (this.orders as unknown as { createPendingEntitiesForOrder?: unknown }).createPendingEntitiesForOrder === "function") {
      await (this.orders as unknown as { createPendingEntitiesForOrder: (order: unknown, invoiceId: string, options?: { recurringCouponId?: string }) => Promise<unknown> }).createPendingEntitiesForOrder(
        order,
        invoice.id,
        { recurringCouponId: discount?.type === "recurring" ? discountCoupon?.id : undefined }
      );
    }
    await this.billing.recordAction?.({
      action: "order.created",
      actorId: dto.userId,
      metadata: { invoiceId: invoice.id, source: "admin", totalCents: invoice.totalCents },
      subject: "order",
      subjectId: order.id
    });

    if (!dto.skipEmail) {
      void this.dispatchOrderEmail(order, invoice, snapshot).catch(() => undefined);
    }

    if (dto.runModules) {
      const serviceByBundledDomain = new Map<string, string>();
      const activationItems = (
        (order as unknown as { items: Array<{ billingCycle: string; configuration: unknown; domainName?: string | null; id: string; productId: string; productPriceId: string; serviceId?: string | null; setupFeeCents?: number | null; type: string; unitAmountCents?: number | null }> }).items ?? []
      ).sort((a, b) => activationPriority(a) - activationPriority(b));
      for (const item of activationItems) {
        try {
          const linkedServiceId = item.type === "DOMAIN" && item.domainName
            ? serviceByBundledDomain.get(item.domainName)
            : undefined;
          const result = await this.activateItem(user.id, item, snapshot, linkedServiceId);
          const bd = bundledDomainName(item.configuration);
          if (item.type === "SHARED_HOSTING" && bd && result.service?.id) {
            serviceByBundledDomain.set(bd, result.service.id);
          }
        } catch (error) {
          const message = error instanceof Error ? error.message : "Provisioning failed";
          await this.orders.markItemFailed(item.id, message);
        }
      }
    }

    return { invoice, order };
  }

  async payOrder(id: string, dto: PayOrderDto) {
    const order = await this.orders.findOrderForActivation(id);
    if (!order) {
      // No Order found — might be a checkout invoice ID (order deferred until payment)
      try {
        await this.billing.getInvoice(id);
      } catch {
        throw new NotFoundException("Order not found");
      }
      return this.payCheckoutInvoice(id, dto);
    }
    if (!order.invoiceId) {
      throw new BadRequestException("Order has no invoice");
    }

    let invoice;
    try {
      invoice = await this.billing.payInvoice(order.invoiceId, dto, { processLifecycle: false });
    } catch (error) {
      await this.billing.recordAction?.({
        action: "order.payment_error",
        metadata: { error: error instanceof Error ? error.message : "Payment failed", invoiceId: order.invoiceId },
        subject: "order",
        subjectId: id
      });
      throw error;
    }
    if (invoice.status !== "PAID") {
      return { invoice, order: await this.orders.findOrderForActivation(id) };
    }
    if (typeof (this.billing as unknown as { onInvoicePaid?: unknown }).onInvoicePaid === "function") {
      if (typeof (this.billing as unknown as { materializePaidCheckoutUser?: unknown }).materializePaidCheckoutUser === "function") {
        await (this.billing as unknown as { materializePaidCheckoutUser: (invoiceId: string) => Promise<unknown> }).materializePaidCheckoutUser(order.invoiceId);
      }
      await this.orders.markOrderPaid(id, dto.method);
      await this.orders.markOrderInProgress(id, "Payment received. Provisioning is running in the background.");
      void (this.billing as unknown as { onInvoicePaid: (invoiceId: string, input: { source: string }) => Promise<unknown> })
        .onInvoicePaid(order.invoiceId, { source: "gateway" })
        .catch(() => undefined);
      return {
        invoice,
        order: await this.orders.findOrderForActivation(id)
      };
    }
    if ((invoice as { lifecycleProcessed?: boolean }).lifecycleProcessed) {
      return {
        invoice,
        order: await this.orders.findOrderForActivation(id)
      };
    }

    await this.orders.markOrderPaid(id, dto.method);

    const serviceByBundledDomain = new Map<string, string>();
    const activationItems = [...order.items].sort((a, b) => activationPriority(a) - activationPriority(b));
    let allAutomatic = true;

    for (const item of activationItems) {
      try {
        const linkedServiceId = item.type === "DOMAIN" && item.domainName ? serviceByBundledDomain.get(item.domainName) : undefined;
        const result = await this.activateItem(order.userId, item, order.customerSnapshot, linkedServiceId);
        const bundledDomain = bundledDomainName(item.configuration);
        if (item.type === "SHARED_HOSTING" && bundledDomain && result.service?.id) {
          serviceByBundledDomain.set(bundledDomain, result.service.id);
        }
        if (result.outcome !== "active") {
          allAutomatic = false;
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : "Provisioning failed";
        await this.orders.markItemFailed(item.id, message);
        allAutomatic = false;
      }
    }

    if (allAutomatic) {
      await this.orders.markOrderComplete(id);
    } else {
      await this.orders.markOrderInProgress(id, "At least one item needs manual action or failed automatic provisioning.");
    }

    return {
      invoice,
      order: await this.orders.findOrderForActivation(id)
    };
  }

  private async payCheckoutInvoice(invoiceId: string, dto: PayOrderDto) {
    let invoice;
    try {
      invoice = await this.billing.payInvoice(invoiceId, dto, { processLifecycle: false });
    } catch (error) {
      await this.billing.recordAction?.({
        action: "order.payment_error",
        metadata: { error: error instanceof Error ? error.message : "Payment failed", invoiceId },
        subject: "order",
        subjectId: invoiceId
      });
      throw error;
    }
    if (invoice.status !== "PAID") {
      // Redirect-based payment (PayPal/Mollie) — order will be created on confirm-payment
      return { invoice, order: { id: invoiceId } };
    }
    // Synchronous payment (Sandbox/TEST) — create the order now
    const result = await this.ensureOrderForInvoice(invoiceId);
    if (result?.order?.id) {
      const orderId = result.order.id as string;
      await this.orders.markOrderPaid(orderId, dto.method);
      await this.orders.markOrderInProgress(orderId, "Payment received. Provisioning is running in the background.");
    }
    if (typeof (this.billing as unknown as { onInvoicePaid?: unknown }).onInvoicePaid === "function") {
      void (this.billing as unknown as { onInvoicePaid: (invoiceId: string, input: { source: string }) => Promise<unknown> })
        .onInvoicePaid(invoiceId, { source: "gateway" })
        .catch(() => undefined);
    }
    const finalOrder = result?.order?.id ? await this.orders.findOrderForActivation(result.order.id as string) : { id: invoiceId };
    return { invoice, order: finalOrder };
  }

  private async ensureOrderForInvoice(invoiceId: string): Promise<{ existed: boolean; order: Record<string, any> } | null> {
    const invoice = await this.billing.getInvoice(invoiceId).catch(() => null);
    if (!invoice) return null;

    const existingOrder = (invoice as Record<string, any>).order;
    if (existingOrder) return { existed: true, order: existingOrder };

    const snapshot = isRecord(invoice.orderSnapshot) ? invoice.orderSnapshot : {};
    const items = Array.isArray(snapshot.items) ? (snapshot.items as PricedOrderItem[]) : null;
    if (!items) return null;

    const cs = isRecord(invoice.customerSnapshot) ? invoice.customerSnapshot : {};
    const order = await this.orders.createOrder({
      customerSnapshot: cs,
      invoiceId,
      items,
      setupFeeCents: typeof snapshot.setupFeeCents === "number" ? snapshot.setupFeeCents : 0,
      subtotalCents: (invoice as Record<string, any>).subtotalCents as number,
      taxAmountCents: (invoice as Record<string, any>).taxAmountCents as number,
      totalCents: (invoice as Record<string, any>).totalCents as number,
      userId: (invoice as Record<string, any>).userId as string
    });

    if (typeof (this.orders as unknown as { createPendingEntitiesForOrder?: unknown }).createPendingEntitiesForOrder === "function") {
      await (this.orders as unknown as { createPendingEntitiesForOrder: (order: unknown, invoiceId: string) => Promise<unknown> }).createPendingEntitiesForOrder(
        order,
        invoiceId
      );
    }

    await this.billing.recordAction?.({
      action: "order.created",
      metadata: { invoiceId, source: "storefront", totalCents: (invoice as Record<string, any>).totalCents },
      subject: "order",
      subjectId: order.id
    });

    void this.dispatchOrderEmail(order, invoice as Record<string, any>, cs).catch(() => undefined);

    return { existed: false, order };
  }

  // Enforce that a domain name can only be active once per type across the whole system:
  // - a domain registration name may not already exist as an active domain record, and
  // - a hosting account's domain may not already back another active hosting service.
  // A client may still hold one domain registration AND one hosting service for the same name
  // (the normal "register the domain, then host it" flow), and may hold many hosting services
  // for different domain names.
  private async assertOrderItemsAvailable(items: PricedOrderItem[], remedy: string) {
    for (const item of items) {
      if (item.type === "DOMAIN" && item.domainName) {
        const existingDomain = await this.orders.findActiveDomainRecord(item.domainName);
        if (existingDomain) {
          throw new BadRequestException(`Domain ${item.domainName} is already active in the system. ${remedy}`);
        }
        continue;
      }
      if (item.type === "SHARED_HOSTING") {
        const hostingDomain = orderItemHostingDomain(item);
        if (hostingDomain) {
          const existingHosting = await this.orders.findActiveHostingServiceByDomain(hostingDomain);
          if (existingHosting) {
            throw new BadRequestException(`A hosting service for ${hostingDomain} is already active in the system. ${remedy}`);
          }
        }
      }
    }
  }

  private async priceItems(items: OrderItemDto[]): Promise<PricedOrderItem[]> {
    if (items.length === 0) {
      throw new BadRequestException("Order needs at least one item");
    }

    const pricedItems = await Promise.all(items.map((item) => this.priceItem(item)));
    return applyFreeDomainDiscount(pricedItems);
  }

  private async dispatchOrderEmail(order: Record<string, any>, invoice: Record<string, any>, snapshot: Record<string, unknown>) {
    if (!this.emails) {
      return [];
    }
    // Order-email money uses the invoice's frozen currency; locale = recipient locale → main.
    const userLocale = stringOrUndefined(invoice.user?.locale) ?? stringOrUndefined(snapshot.locale);
    const locale = userLocale ?? (await this.billing.i18nLanguages()).main;
    const currency = stringOrUndefined(invoice.currency) ?? await this.billing.mainCurrency();
    return this.emails.dispatch("order_confirmation", {
      context: {
        customer_email: stringOrUndefined(snapshot.email),
        customer_name: stringOrUndefined(snapshot.name) ?? stringOrUndefined(snapshot.email),
        invoice_number: invoice.finalInvoiceNumber ?? invoice.tempInvoiceNumber ?? invoice.invoiceNumber,
        invoice_total_amount: formatMoney(invoice.totalCents, currency, locale),
        order_number: order.orderNumber,
        service: Array.isArray(order.items) ? order.items.map((item) => item.description).filter(Boolean).join(", ") : ""
      },
      user: {
        email: stringOrUndefined(snapshot.email),
        id: order.userId,
        locale: userLocale,
        name: stringOrUndefined(snapshot.name) ?? stringOrUndefined(snapshot.email)
      }
    });
  }

  // Label for the discount invoice line, in the invoice's frozen main language.
  private async discountLineLabel() {
    const main = (await this.billing.i18nLanguages()).main;
    return main === "de" ? "Rabatt" : "Discount";
  }

  private async priceItem(item: OrderItemDto): Promise<PricedOrderItem> {
    const product = await this.orders.findProduct(item.productId);
    if (!product) {
      throw new NotFoundException("Product not found");
    }

    const configuration = item.configuration ?? {};
    const configuredPrice = item.productPriceId
      ? product.prices.find((candidate) => candidate.id === item.productPriceId)
      : product.prices[0];
    // Domains register/renew yearly. Map whatever cycle the item carries (an explicit domain cycle,
    // or the hosting cycle it was bundled with) onto a domain-appropriate yearly cycle so the domain
    // never inherits a monthly/one-time hosting cadence, then price by that resolved cycle.
    const requestedCycle =
      product.type === "DOMAIN"
        ? domainCycleFor(configuredDomainCycle(configuration) ?? configuredPrice?.billingCycle)
        : undefined;
    const requestedPrice = requestedCycle
      ? product.prices.find((candidate) => candidate.billingCycle === requestedCycle) ??
        (await this.orders.findDomainProductPrice(product.id, requestedCycle))
      : undefined;
    let price =
      requestedPrice ??
      configuredPrice ??
      (product.type === "DOMAIN"
        ? await this.orders.findDomainProductPrice(product.id, requestedCycle ?? "YEAR_1")
        : undefined);
    if (!price) {
      throw new BadRequestException(`No active price for ${product.name}`);
    }

    let quantity = item.quantity ?? 1;
    let billingCycle: string = requestedCycle ?? price.billingCycle;
    let unitAmountCents = price.amountCents;
    // Renewals bill this (captured on the service). Defaults to the first-invoice amount.
    let recurringAmountCents = unitAmountCents;
    let description = product.name;

    if (product.type === "DOMAIN") {
      if (!isYearlyCycle(billingCycle)) {
        throw new BadRequestException("Domains can only be ordered on a yearly billing cycle (e.g. YEAR_1).");
      }
      if (!item.domainName) {
        throw new BadRequestException("Domain orders need a domain name");
      }
      const action = domainAction(configuration) === "transfer" ? "transfer" : "register";
      const years = yearsFromCycle(billingCycle);
      const livePrice = await this.domainPricing.priceFor(item.domainName, price.amountCents, action, years);
      unitAmountCents = livePrice.amountCents;
      recurringAmountCents = unitAmountCents;
      quantity = years;
      description = `${item.domainName} domain ${action}`;
      configuration.domainPricing = livePrice;
    } else {
      // Admin custom pricing (never applied to domains — those are priced live from resell.biz):
      // override the unit amount and, if given, the billing cycle. When the admin opts out of
      // applying the custom price to renewals, the service keeps billing the product list price.
      const custom = customPricing(item);
      if (custom) {
        // The form sends no productPriceId with custom pricing, so `price` is an arbitrary first
        // price. Anchor the item (and its subscription's product price) to the list price matching
        // the custom cycle when one exists, so a renewals opt-out falls back to the right list amount.
        if (custom.billingCycle && !item.productPriceId) {
          price = product.prices.find((candidate) => candidate.billingCycle === custom.billingCycle) ?? price;
        }
        unitAmountCents = custom.amountCents;
        if (custom.billingCycle) {
          billingCycle = custom.billingCycle;
        }
        recurringAmountCents = custom.applyToRenewals ? custom.amountCents : price.amountCents;
        // Persist the renewal amount only when it diverges from the first-invoice price (custom price
        // opted out of renewals). Order-item rows have no dedicated column, so it rides on the
        // configuration JSON, where `createPendingEntitiesForOrder` reads it for Service.recurringAmountCents.
        if (recurringAmountCents !== unitAmountCents) {
          configuration.renewalAmountCents = recurringAmountCents;
        }
      }
    }

    return {
      billingCycle,
      configuration,
      description,
      domainName: item.domainName,
      productId: product.id,
      productPriceId: price.id,
      productSnapshot: {
        name: product.name,
        type: product.type,
        slug: product.slug,
        provisioningModule: product.provisioningModule ?? null,
        freeDomainBillingCycle: product.freeDomainBillingCycle ?? null
      },
      quantity,
      recurringAmountCents,
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
    productId?: string | null;
    productPriceId: string;
    serviceId?: string | null;
    setupFeeCents?: number | null;
    type: string;
    unitAmountCents?: number | null;
  }, customerSnapshot?: unknown, linkedServiceId?: string) {
    const product = item.productId ? await this.orders.findProduct(item.productId) : null;
    const moduleName = product ? effectiveModule(product) : undefined;
    // The order's pending-entities step (createPendingEntitiesForOrder) already created this item's
    // service + subscription, carrying the captured order price (incl. admin custom pricing). Reuse it —
    // creating a second service here dropped recurringAmountCents (renewals silently billed the list
    // price, breaking "apply custom price to renewals") and double-billed via a duplicate subscription.
    const existingServiceId = typeof item.serviceId === "string" && item.serviceId ? item.serviceId : undefined;
    const service = linkedServiceId
      ? { id: linkedServiceId }
      : existingServiceId
        ? { id: existingServiceId }
        : await this.orders.createServiceForItem(
            item,
            userId,
            ["DOMAIN", "SHARED_HOSTING"].includes(item.type) ? "PROVISIONING" : "ACTIVE"
          );
    if (!linkedServiceId && !existingServiceId) {
      await this.billing.createSubscription({
        billingCycle: item.billingCycle,
        nextInvoiceAt: nextBillingDate(new Date(), item.billingCycle).toISOString(),
        productPriceId: item.productPriceId,
        serviceId: service.id,
        userId
      });
    }

    if (item.type === "SHARED_HOSTING") {
      await this.orders.markItemProvisioning(item.id);
      void this.finishHostingProvisioning(item, service.id, customerSnapshot, moduleName);
      return { outcome: "pending" as const, service };
    }

    if (item.type !== "DOMAIN") {
      await this.orders.markItemActive(item.id);
      return { outcome: "active" as const, service };
    }

    if (!item.domainName) {
      throw new BadRequestException("Domain order item is missing domain name");
    }

    await this.orders.markItemProvisioning(item.id);
    if (domainTld(item.domainName) === "de") {
      const metadata = {
        manual: true,
        provider: "admin",
        reason: ".de domains are handled manually outside Resell.biz"
      };
      await this.orders.createDomainRecord({
        domain: item.domainName,
        raw: metadata,
        registrarModule: moduleName ?? "resellbiz",
        serviceId: service.id,
        status: "PENDING",
        userId
      });
      await this.orders.markItemSkipped(item.id, "Manual .de registration required", metadata);
      return { outcome: "pending" as const, service };
    }

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
      registrarModule: moduleName ?? "resellbiz",
      serviceId: service.id,
      status: provisioning.status === "FAILED" ? "FAILED" : provisioning.status === "ACTIVE" ? "ACTIVE" : "PENDING",
      userId
    });

    if (provisioning.status === "FAILED") {
      throw new BadRequestException("ResellBiz domain registration failed");
    }

    if (provisioning.status === "ACTIVE") {
      await this.orders.markItemActive(item.id, provisioning.externalId, provisioning.metadata, "resellbiz");
      return { outcome: "active" as const, service };
    }

    return { outcome: "pending" as const, service };
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

  private async finishHostingProvisioning(
    item: {
      configuration: unknown;
      id: string;
      type: string;
    },
    serviceId: string,
    customerSnapshot?: unknown,
    moduleName?: string
  ) {
    try {
      if (!moduleName) {
        await this.orders.markItemSkipped(item.id, "Manual provisioning required");
        return;
      }
      const provider = this.external.hostingProvider(moduleName, item.type);
      const provisioning = await provider.provision({
        options: hostingOptions(item.configuration, customerSnapshot),
        productType: item.type,
        serviceId
      });
      if (provisioning.status === "ACTIVE") {
        await this.orders.markItemActive(item.id, provisioning.externalId, provisioning.metadata, moduleName);
        return;
      }
      if (provisioning.status === "FAILED") {
        await this.orders.markItemFailed(item.id, "Hosting provisioning failed");
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "Hosting provisioning failed";
      await this.orders.markItemFailed(item.id, message);
    }
  }
}

function customerSnapshot(customer: CheckoutOrderDto["customer"], email: string, customerNumber?: number) {
  return {
    address: customer.address,
    countryCode: customer.countryCode ?? "DE",
    customerNumber,
    customerType: customer.customerType ?? "INDIVIDUAL",
    email,
    companyName: customer.companyName,
    name: customer.name,
    phone: customer.phone,
    vatId: customer.vatId
  };
}

function assertDomainRegistrantContact(customer: CheckoutOrderDto["customer"]) {
  const address = isRecord(customer.address) ? customer.address : {};
  assertRequiredString(customer.name, "Name");
  assertRequiredString(customer.email, "Email");
  assertRequiredString(customer.countryCode ?? "DE", "Country");
  assertRequiredString(address.line1, "Address");
  assertRequiredString(address.postalCode, "Zip");
  assertRequiredString(address.city, "City");
  const phone = String(customer.phone ?? "").replace(/[^\d+]/g, "").replace(/\D/g, "");
  if (!phone) {
    throw new BadRequestException("Phone number is required");
  }
}

function assertRequiredString(value: unknown, label: string) {
  if (typeof value !== "string" || !value.trim()) {
    throw new BadRequestException(`${label} is required for domain registration`);
  }
}

function customerSnapshotFromUser(user: {
  contacts?: Array<{ address?: unknown; phone?: string | null }>;
  countryCode?: string;
  customerNumber?: number | null;
  customerType?: string;
  email: string;
  name: string;
  vatId?: string | null;
}) {
  const contact = user.contacts?.[0];
  return {
    address: isRecord(contact?.address) ? contact?.address : undefined,
    countryCode: user.countryCode ?? "DE",
    customerNumber: user.customerNumber,
    customerType: user.customerType ?? "INDIVIDUAL",
    email: user.email,
    name: user.name,
    phone: contact?.phone,
    vatId: user.vatId ?? undefined
  };
}

// A service item grants a free domain when its product is configured with a free-domain billing
// cycle and the ordered cycle is at least that long (e.g. "YEAR_1" → every annual cycle).
function cycleAtLeast(cycle: string, threshold: string) {
  const ordered = billingCycles.indexOf(cycle as never);
  const minimum = billingCycles.indexOf(threshold as never);
  return ordered >= 0 && minimum >= 0 && ordered >= minimum;
}

function applyFreeDomainDiscount(items: PricedOrderItem[]) {
  const grantsFreeDomain = items.some((item) => {
    const threshold = item.productSnapshot?.freeDomainBillingCycle;
    return item.type !== "DOMAIN" && threshold && cycleAtLeast(item.billingCycle, threshold);
  });
  if (!grantsFreeDomain) {
    return items;
  }

  return items.map((item) => {
    if (item.type !== "DOMAIN") {
      return item;
    }
    if (item.unitAmountCents > 1500) {
      return {
        ...item,
        configuration: {
          ...item.configuration,
          freeDomainEligible: false,
          freeDomainReason: "Domain price is above 15 EUR."
        }
      };
    }

    return {
      ...item,
      configuration: {
        ...item.configuration,
        freeDomainApplied: true
      },
      description: `${item.description} (free with annual hosting)`,
      totalCents: item.setupFeeCents,
      unitAmountCents: 0
    };
  });
}

// Read admin custom-pricing off an order item, if present. Only meaningful for non-domain products;
// the caller guards that. `applyToRenewals` defaults to true (the common case: custom price sticks).
function customPricing(item: OrderItemDto): { amountCents: number; applyToRenewals: boolean; billingCycle?: string } | undefined {
  if (typeof item.customAmountCents !== "number") {
    return undefined;
  }
  return {
    amountCents: item.customAmountCents,
    applyToRenewals: item.applyCustomToRenewals !== false,
    billingCycle: typeof item.customBillingCycle === "string" && item.customBillingCycle ? item.customBillingCycle : undefined
  };
}

// Read the order-level discount off an admin create-order request, if a positive amount was set.
function orderDiscount(dto: AdminCreateOrderDto): { amountCents: number; type: "one-time" | "recurring" } | undefined {
  const amountCents = typeof dto.discountAmountCents === "number" ? dto.discountAmountCents : 0;
  if (!dto.discountType || amountCents <= 0) {
    return undefined;
  }
  return { amountCents, type: dto.discountType };
}

function invoiceLineQuantity(item: PricedOrderItem) {
  return item.setupFeeCents > 0 ? 1 : item.quantity;
}

function invoiceLineUnitAmount(item: PricedOrderItem) {
  return item.setupFeeCents > 0 ? item.totalCents : item.unitAmountCents;
}

function hostingOptions(configuration: unknown, customerSnapshot?: unknown) {
  const config = isRecord(configuration) ? configuration : {};
  const customer = isRecord(customerSnapshot) ? customerSnapshot : {};
  return {
    ...config,
    contactEmail: typeof customer.email === "string" ? customer.email : undefined,
    description: typeof customer.name === "string" ? customer.name : undefined,
    domainName: typeof config.domainName === "string" ? config.domainName : undefined
  };
}

function activationPriority(item: { configuration: unknown; type: string }) {
  return item.type === "SHARED_HOSTING" && bundledDomainName(item.configuration) ? 0 : 1;
}

function bundledDomainName(configuration: unknown) {
  if (!isRecord(configuration) || configuration.bundledDomain !== true || typeof configuration.domainName !== "string") {
    return undefined;
  }

  return configuration.domainName.trim().toLowerCase();
}

// The domain a hosting account is provisioned under: explicit item.domainName, otherwise
// configuration.domainName (bundled or standalone hosting both store it there).
function orderItemHostingDomain(item: { domainName?: string | null; configuration: unknown }) {
  if (typeof item.domainName === "string" && item.domainName.trim()) {
    return item.domainName.trim().toLowerCase();
  }
  if (isRecord(item.configuration) && typeof item.configuration.domainName === "string" && item.configuration.domainName.trim()) {
    return item.configuration.domainName.trim().toLowerCase();
  }
  return undefined;
}

function orderStatusFromAdmin(status: string) {
  const normalized = status.trim().toLowerCase();
  if (["completed", "complete"].includes(normalized)) {
    return "COMPLETE";
  }
  if (["pending", "pending_payment"].includes(normalized)) {
    return "PENDING";
  }
  if (["in_progress", "in-progress", "progress", "provisioning", "paid"].includes(normalized)) {
    return "PROVISIONING";
  }
  if (["failed", "fail"].includes(normalized)) {
    return "FAILED";
  }
  if (["canceled", "cancelled", "cancel"].includes(normalized)) {
    return "CANCELLED";
  }
  throw new BadRequestException("Unknown order status");
}

function yearsFromCycle(cycle: string) {
  return Number(cycle.match(/^YEAR_(\d+)$/)?.[1] ?? 1);
}

function normalizedDomainYears(value?: string | number) {
  const years = typeof value === "number" ? value : Number.parseInt(String(value ?? "1"), 10);
  return Number.isFinite(years) && years > 0 ? years : 1;
}

function domainProductFallbackCents(product: { prices?: Array<{ amountCents: number; billingCycle: string }> } | null | undefined, years: number) {
  const cycle = `YEAR_${years}`;
  return product?.prices?.find((price) => price.billingCycle === cycle)?.amountCents ?? product?.prices?.[0]?.amountCents ?? 0;
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

function nextBillingDate(date: Date, cycle: string) {
  const next = new Date(date);
  const yearly = cycle.match(/^YEAR_(\d+)$/);
  const months = {
    MONTHLY: 1,
    QUARTERLY: 3,
    SEMI_ANNUAL: 6
  }[cycle];
  next.setMonth(next.getMonth() + (yearly ? Number(yearly[1]) * 12 : months ?? 12));
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

// The cycle an order item requested for its domain, if any — the hosting cycle it was bundled with
// (storefront) or the domain cycle the admin form resolved. `domainCycleFor` normalizes it to a
// yearly cadence; a missing/blank value falls back to the configured domain price's own cycle.
function configuredDomainCycle(configuration: unknown) {
  if (!isRecord(configuration) || typeof configuration.billingCycle !== "string" || !configuration.billingCycle) {
    return undefined;
  }

  return configuration.billingCycle;
}

function domainTld(domainName: string) {
  return domainName.split(".").at(-1)?.toLowerCase();
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
    state: optionalString(address.state) ?? "N/A",
    vatId: optionalString(snapshot.vatId),
    zipCode: requiredString(address.postalCode, "Zip")
  };
}

function splitPhone(value: string) {
  const compact = value.replace(/[^\d+]/g, "");
  const digits = compact.replace(/\D/g, "");
  const knownCodes = ["49", "43", "41", "33", "34", "39", "44", "1"];
  const countryCode = compact.startsWith("+") ? knownCodes.find((code) => digits.startsWith(code)) ?? digits.slice(0, 2) : "49";
  const number = compact.startsWith("+") ? digits.slice(countryCode.length) : digits.startsWith("49") && digits.length > 10 ? digits.slice(2) : digits;
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

function stringOrUndefined(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
