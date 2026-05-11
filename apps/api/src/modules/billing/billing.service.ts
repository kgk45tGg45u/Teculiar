import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import type { PaymentMethodType } from "@prisma/client";
import { ExternalService } from "../external/external.service";
import { BillingEngineService } from "./billing-engine.service";
import { BillingRepository } from "./billing.repository";
import { CreateInvoiceDto } from "./dto/create-invoice.dto";
import { CreateSubscriptionDto } from "./dto/create-subscription.dto";
import { PayInvoiceDto } from "./dto/pay-invoice.dto";
import { addBillingCycle } from "./platform-rules";
import { AbstractPaymentService } from "./processors/abstract-payment.service";

@Injectable()
export class BillingService {
  constructor(
    private readonly billing: BillingRepository,
    private readonly engine: BillingEngineService,
    private readonly payments: AbstractPaymentService,
    private readonly external?: ExternalService
  ) {}

  async createInvoice(dto: CreateInvoiceDto) {
    const coupon = await this.billing.findCoupon(dto.couponCode);
    const [vatRate, sellerSnapshot, footerLines] = await Promise.all([this.vatPercent(), this.invoiceSellerSnapshot(), this.invoiceFooterLines()]);
    const draft = this.engine.createDraft({
      lines: dto.lines.map((line) => ({ ...line, taxRate: line.vatRate })),
      coupon: coupon
        ? coupon.type === "FIXED"
          ? { type: "FIXED", amountCents: coupon.amountCents }
          : { type: "PERCENTAGE", percent: coupon.percent }
        : undefined,
      taxContext: {
        sellerCountryCode: "DE",
        buyerCountryCode: dto.buyerCountryCode,
        buyerVatId: dto.buyerVatId,
        isBusinessCustomer: Boolean(dto.isBusinessCustomer)
      },
      vatRate
    });

    return this.billing.createInvoice({
      userId: dto.userId,
      teamId: dto.teamId,
      status: dto.status ?? "DRAFT",
      issuedAt: dto.issuedAt ? new Date(dto.issuedAt) : new Date(),
      dueAt: new Date(dto.dueAt),
      subtotalCents: draft.subtotalCents,
      discountCents: draft.discountCents,
      taxAmountCents: draft.taxAmountCents,
      totalCents: draft.totalCents,
      reverseCharge: draft.reverseCharge,
      taxReason: draft.taxReason,
      customerSnapshot: dto.customerSnapshot,
      sellerSnapshot,
      footerLines,
      orderSnapshot: dto.orderSnapshot,
      couponId: coupon?.id,
      lines: draft.lines.map((line) => ({
        ...line,
        billingCycle: line.billingCycle,
        domainRecordId: line.domainRecordId,
        lifecycleAction: line.lifecycleAction,
        metadata: line.metadata,
        orderItemId: line.orderItemId,
        serviceId: line.serviceId,
        type: line.type
      }))
    });
  }

  listInvoices(filters: { status?: string; userId?: string }) {
    return this.billing.listInvoices(filters);
  }

  async getInvoice(id: string, user?: { roles?: string[]; sub: string }) {
    const invoice = await this.billing.findInvoice(id);
    if (!invoice) {
      throw new NotFoundException("Invoice not found");
    }
    const staff = user?.roles?.some((role) => ["admin", "staff"].includes(role));
    if (user && !staff && invoice.userId !== user.sub) {
      throw new NotFoundException("Invoice not found");
    }

    return invoice;
  }

  async invoicePdf(id: string, user?: { roles?: string[]; sub: string }) {
    const invoice = await this.getInvoice(id, user);
    const seller = isRecord(invoice.sellerSnapshot) ? invoice.sellerSnapshot : {};
    const buyer = isRecord(invoice.customerSnapshot) ? invoice.customerSnapshot : {};
    const buyerAddress = isRecord(buyer.address) ? buyer.address : {};
    const lines = [
      seller.companyName ? String(seller.companyName) : "Company",
      [seller.address, seller.zip, seller.city, seller.country].filter(Boolean).join(", "),
      seller.vatNumber ? `USt-IdNr: ${seller.vatNumber}` : "",
      "",
      buyer.name ? String(buyer.name) : "",
      [buyerAddress.line1, buyerAddress.postalCode, buyerAddress.city, buyer.countryCode].filter(Boolean).join(", "),
      "",
      `Rechnung ${invoice.finalInvoiceNumber ?? invoice.tempInvoiceNumber ?? invoice.invoiceNumber}`,
      `Status: ${invoice.status}`,
      `Datum: ${invoice.issuedAt.toISOString().slice(0, 10)}`,
      `Faellig: ${invoice.dueAt.toISOString().slice(0, 10)}`,
      "",
      ...invoice.items.map((item) => `${item.description}${item.billingCycle ? ` (${formatBillingCycle(item.billingCycle)})` : ""}  ${item.quantity} x ${formatEuro(item.unitAmountCents)} = ${formatEuro(item.totalCents)}`),
      "",
      `Zwischensumme: ${formatEuro(invoice.subtotalCents)}`,
      invoice.taxAmountCents > 0 ? `USt.: ${formatEuro(invoice.taxAmountCents)}` : "",
      `Gesamt: ${formatEuro(invoice.totalCents)}`,
      seller.paymentInstructions ? `Zahlung: ${seller.paymentInstructions}` : "",
      seller.bankDetails ? `Bank: ${seller.bankDetails}` : "",
      "",
      ...(Array.isArray(invoice.footerLines) ? invoice.footerLines.filter((line): line is string => typeof line === "string") : [])
    ].filter(Boolean);

    return createSimplePdf(lines);
  }

  async sendInvoice(id: string) {
    const invoice = await this.billing.findInvoice(id);
    if (!invoice) {
      throw new NotFoundException("Invoice not found");
    }
    if (invoice.status === "DRAFT") {
      return this.billing.updateInvoiceStatus(id, "UNPAID");
    }
    return this.billing.updateInvoiceStatus(id, "PENDING");
  }

  async payInvoice(id: string, dto: PayInvoiceDto) {
    const invoice = await this.billing.findInvoice(id);
    if (!invoice) {
      throw new NotFoundException("Invoice not found");
    }
    if (!["UNPAID", "OVERDUE", "FAILED"].includes(invoice.status)) {
      throw new BadRequestException("Invoice is not payable");
    }

    const processor = this.payments.get(dto.method);
    const result = await processor.charge({
      invoiceId: id,
      amountCents: invoice.totalCents,
      currency: "EUR",
      paymentMethodId: dto.paymentMethodId
    });

    await this.billing.createTransaction({
      invoiceId: id,
      method: dto.method,
      status: result.status,
      amountCents: invoice.totalCents,
      currency: "EUR",
      providerReference: result.providerReference,
      raw: result.raw ?? {}
    });

    if (result.status === "SUCCEEDED") {
      const paid = await this.billing.markInvoicePaid(id);
      await this.onInvoicePaid(id, { source: "gateway" });
      return { ...paid, lifecycleProcessed: true };
    }

    if (result.status === "FAILED") {
      return this.billing.updateInvoiceStatus(id, "FAILED");
    }

    return this.billing.updateInvoiceStatus(id, "PENDING");
  }

  async markInvoicePaid(id: string, input: { actorId?: string; source?: string } = {}) {
    const paid = await this.billing.markInvoicePaid(id);
    await this.onInvoicePaid(id, { actorId: input.actorId, source: input.source ?? "admin" });
    return { ...paid, lifecycleProcessed: true };
  }

  async markInvoiceUnpaid(id: string, input: { actorId?: string; reason?: string } = {}) {
    const invoice = await this.billing.markInvoiceUnpaid(id);
    await Promise.all([
      this.billing.createAuditLog({
        action: "invoice.marked_unpaid",
        actorId: input.actorId,
        metadata: { reason: input.reason },
        subject: "invoice",
        subjectId: id
      }),
      this.billing.suspendServicesForInvoice(id)
    ]);
    return invoice;
  }

  deleteInvoice(id: string) {
    return this.billing.deleteInvoice(id);
  }

  async onInvoicePaid(invoiceId: string, input: { actorId?: string; source?: string } = {}) {
    const invoice = await this.billing.findInvoiceForLifecycle(invoiceId);
    if (!invoice) {
      throw new NotFoundException("Invoice not found");
    }

    await this.billing.createAuditLog({
      action: "invoice.paid",
      actorId: input.actorId,
      metadata: { source: input.source ?? "system" },
      subject: "invoice",
      subjectId: invoiceId
    });

    const items = lifecycleItems(invoice);
    const results: Array<{ ok: boolean; pending?: boolean }> = [];
    for (const item of items) {
      if (item.service) {
        results.push(await this.processPaidService(invoice, item, input));
      }
      if (item.domainRecord) {
        results.push(await this.processPaidDomain(invoice, item, input));
      }
    }

    const orderId = invoice.order?.id;
    if (orderId) {
      const failed = results.some((result) => !result.ok);
      const pending = results.some((result) => result.pending);
      await this.billing.setOrderLifecycleStatus(
        orderId,
        failed || pending ? "PROVISIONING" : "COMPLETE",
        failed ? "At least one paid invoice action failed." : pending ? "At least one paid invoice action is still pending." : undefined
      );
    }

    return {
      failed: results.filter((result) => !result.ok).length,
      invoiceId,
      processed: results.length
    };
  }

  async retryModuleAction(id: string, input: { actorId?: string } = {}) {
    const log = await this.billing.findModuleLog(id);
    if (!log) {
      throw new NotFoundException("Module log not found");
    }
    const successful = await this.billing.successfulModuleLogForTarget({
      action: log.action,
      domainRecordId: log.domainRecordId,
      serviceId: log.serviceId
    });
    if (successful) {
      await this.billing.createAuditLog({
        action: "module.retry_skipped",
        actorId: input.actorId,
        metadata: { existingLogId: successful.id, failedLogId: id },
        subject: "module_log",
        subjectId: id
      });
      return { skipped: true, reason: "successful_module_action_exists" };
    }

    return { skipped: false, reason: "retry_requires_related_invoice" };
  }

  private async processPaidService(invoice: Record<string, any>, item: LifecycleItem, input: { actorId?: string; source?: string }) {
    const service = item.service;
    if (!service || ["TERMINATED", "CANCELLED"].includes(service.status)) {
      return { ok: true };
    }

    const action = serviceAction(item, service);
    if (!canRunActionForPaidInvoice(invoice, action, input.source)) {
      return { ok: true, pending: true };
    }
    if (action === "none") {
      return { ok: true };
    }

    const idempotencyKey = `invoice:${invoice.id}:service:${service.id}:${action}`;
    const moduleName = service.moduleName ?? service.product?.provisioningModule ?? hostingModuleName(service.product?.type);
    const existing = await this.billing.findModuleLogByKey(idempotencyKey);
    if (existing) {
      return { ok: existing.status !== "FAILED", pending: existing.status !== "SUCCEEDED" && existing.status !== "FAILED" };
    }

    const request = {
      action,
      options: hostingOptions(service.configuration, invoice.customerSnapshot),
      productType: service.product?.type,
      serviceId: service.id
    };
    const log = await this.billing.createModuleLog({
      action,
      actorId: input.actorId,
      idempotencyKey,
      invoiceId: invoice.id,
      moduleName,
      orderId: invoice.order?.id,
      orderItemId: item.orderItem?.id ?? item.orderItemId,
      request,
      serviceId: service.id
    });

    try {
      const result = await this.runServiceModule(moduleName, action, request, service);
      if (result.status === "FAILED") {
        await this.billing.failModuleLog(log.id, "Service module returned FAILED", result as Record<string, unknown>);
        await this.billing.setServiceLifecycleStatus(service.id, "FAILED");
        if (item.orderItem?.id ?? item.orderItemId) {
          await this.billing.setOrderItemLifecycleStatus(item.orderItem?.id ?? item.orderItemId, "FAILED", {
            errorMessage: "Service module returned FAILED"
          });
        }
        await this.billing.createAuditLog({
          action: "service.provisioning_failed",
          actorId: input.actorId,
          metadata: { action, moduleName },
          subject: "service",
          subjectId: service.id
        });
        return { ok: false };
      }

      await this.billing.succeedModuleLog(log.id, result as Record<string, unknown>);
      const active = result.status === "ACTIVE" || ["renew", "unsuspend"].includes(action);
      await this.billing.setServiceLifecycleStatus(service.id, active ? "ACTIVE" : "PROVISIONING", {
        externalId: result.externalId,
        moduleReference: result.externalId,
        renewsAt: nextServiceDueDate(service, invoice.paidAt ?? invoice.dueAt ?? new Date())
      });
      if (item.orderItem?.id ?? item.orderItemId) {
        await this.billing.setOrderItemLifecycleStatus(item.orderItem?.id ?? item.orderItemId, active ? "ACTIVE" : "PROVISIONING", {
          providerReference: result.externalId
        });
      }
      await this.billing.createAuditLog({
        action: action === "unsuspend" ? "service.unsuspended" : action === "renew" ? "service.renewed" : "service.activated",
        actorId: input.actorId,
        metadata: { moduleName },
        subject: "service",
        subjectId: service.id
      });
      return { ok: true, pending: !active };
    } catch (error) {
      const message = error instanceof Error ? error.message : "Service module failed";
      await this.billing.failModuleLog(log.id, message);
      await this.billing.setServiceLifecycleStatus(service.id, "FAILED");
      if (item.orderItem?.id ?? item.orderItemId) {
        await this.billing.setOrderItemLifecycleStatus(item.orderItem?.id ?? item.orderItemId, "FAILED", { errorMessage: message });
      }
      await this.billing.createAuditLog({
        action: "service.provisioning_failed",
        actorId: input.actorId,
        metadata: { action, error: message, moduleName },
        subject: "service",
        subjectId: service.id
      });
      return { ok: false };
    }
  }

  private async processPaidDomain(invoice: Record<string, any>, item: LifecycleItem, input: { actorId?: string; source?: string }) {
    const domain = item.domainRecord;
    if (!domain || ["CANCELLED", "EXPIRED"].includes(domain.status)) {
      return { ok: true };
    }

    const action = domainActionForItem(item, domain);
    if (!canRunActionForPaidInvoice(invoice, action, input.source)) {
      return { ok: true, pending: true };
    }
    if (domainTld(domain.domain) === "de" && action === "register_domain") {
      await this.billing.setDomainLifecycleStatus(domain.id, "PENDING");
      if (item.orderItem?.id ?? item.orderItemId) {
        await this.billing.setOrderItemLifecycleStatus(item.orderItem?.id ?? item.orderItemId, "SKIPPED", {
          errorMessage: "Manual .de registration required"
        });
      }
      return { ok: true, pending: true };
    }

    const idempotencyKey = `invoice:${invoice.id}:domain:${domain.id}:${action}`;
    const existing = await this.billing.findModuleLogByKey(idempotencyKey);
    if (existing) {
      return { ok: existing.status !== "FAILED", pending: existing.status !== "SUCCEEDED" && existing.status !== "FAILED" };
    }

    const request = domainModuleRequest(action, domain, item, invoice.customerSnapshot);
    const log = await this.billing.createModuleLog({
      action,
      actorId: input.actorId,
      domainRecordId: domain.id,
      idempotencyKey,
      invoiceId: invoice.id,
      moduleName: domain.registrarModule ?? domain.registrarProvider ?? "resellbiz",
      orderId: invoice.order?.id,
      orderItemId: item.orderItem?.id ?? item.orderItemId,
      request
    });

    try {
      const result = await this.runDomainModule(action, request);
      if (result.status === "FAILED") {
        await this.billing.failModuleLog(log.id, "Registrar module returned FAILED", result as Record<string, unknown>);
        await this.billing.setDomainLifecycleStatus(domain.id, "FAILED", { externalId: result.externalId });
        if (item.orderItem?.id ?? item.orderItemId) {
          await this.billing.setOrderItemLifecycleStatus(item.orderItem?.id ?? item.orderItemId, "FAILED", {
            errorMessage: "Registrar module returned FAILED"
          });
        }
        await this.billing.createAuditLog({
          action: "domain.registrar_failed",
          actorId: input.actorId,
          metadata: { action },
          subject: "domain",
          subjectId: domain.id
        });
        return { ok: false };
      }

      const active = result.status === "ACTIVE";
      await this.billing.succeedModuleLog(log.id, result as Record<string, unknown>);
      await this.billing.setDomainLifecycleStatus(domain.id, active ? "ACTIVE" : "PENDING", {
        externalId: result.externalId,
        expiresAt: nextDomainExpiry(domain)
      });
      if (item.orderItem?.id ?? item.orderItemId) {
        await this.billing.setOrderItemLifecycleStatus(item.orderItem?.id ?? item.orderItemId, active ? "ACTIVE" : "PROVISIONING", {
          providerReference: result.externalId
        });
      }
      await this.billing.createAuditLog({
        action: action === "renew_domain" ? "domain.renewed" : action === "transfer_domain" ? "domain.transfer_started" : "domain.registered",
        actorId: input.actorId,
        metadata: {},
        subject: "domain",
        subjectId: domain.id
      });
      return { ok: true, pending: !active };
    } catch (error) {
      const message = error instanceof Error ? error.message : "Registrar module failed";
      await this.billing.failModuleLog(log.id, message);
      await this.billing.setDomainLifecycleStatus(domain.id, "FAILED");
      if (item.orderItem?.id ?? item.orderItemId) {
        await this.billing.setOrderItemLifecycleStatus(item.orderItem?.id ?? item.orderItemId, "FAILED", { errorMessage: message });
      }
      await this.billing.createAuditLog({
        action: "domain.registrar_failed",
        actorId: input.actorId,
        metadata: { action, error: message },
        subject: "domain",
        subjectId: domain.id
      });
      return { ok: false };
    }
  }

  private async runServiceModule(moduleName: string, action: string, request: Record<string, any>, service: Record<string, any>) {
    if (!this.external) {
      return { externalId: service.externalId ?? service.id, metadata: { bypassed: true }, status: "ACTIVE" as const };
    }
    if (["renew", "unsuspend"].includes(action)) {
      return { externalId: service.externalId ?? service.id, metadata: { action }, status: "ACTIVE" as const };
    }
    if (moduleName === "hetzner" || ["VPS", "DEDICATED_SERVER"].includes(service.product?.type)) {
      return this.external.hetzner.provision(request as never);
    }
    return this.external.virtualmin.provision(request as never);
  }

  private async runDomainModule(action: string, request: Record<string, any>) {
    if (!this.external) {
      return { externalId: request.domain, metadata: { bypassed: true }, status: "ACTIVE" as const };
    }
    if (action === "transfer_domain") {
      return this.external.resellBiz.transfer(request as never);
    }
    if (action === "renew_domain") {
      return this.external.resellBiz.renew(request as never);
    }
    return this.external.resellBiz.register(request as never);
  }

  async createSubscription(dto: CreateSubscriptionDto) {
    const coupon = await this.billing.findCoupon(dto.couponCode);
    return this.billing.createSubscription({
      userId: dto.userId,
      serviceId: dto.serviceId,
      productPriceId: dto.productPriceId,
      billingCycle: dto.billingCycle,
      nextInvoiceAt: new Date(dto.nextInvoiceAt),
      couponId: coupon?.id
    });
  }

  async renewSubscription(id: string) {
    const subscription = await this.billing.findSubscription(id);
    if (!subscription) {
      throw new NotFoundException("Subscription not found");
    }

    const invoice = await this.createInvoice({
      userId: subscription.userId,
      dueAt: new Date(Date.now() + 1000 * 60 * 60 * 24 * 14).toISOString(),
      status: "UNSENT",
      buyerCountryCode: subscription.user.countryCode,
      buyerVatId: subscription.user.vatId ?? undefined,
      isBusinessCustomer: subscription.user.customerType === "BUSINESS",
      couponCode: subscription.coupon?.code,
      lines: [
        {
          description: `${subscription.service.product.name} renewal`,
          billingCycle: subscription.billingCycle,
          lifecycleAction: "renew",
          quantity: 1,
          type: "SERVICE_RENEWAL",
          unitAmountCents: subscription.productPrice.amountCents,
          serviceId: subscription.serviceId,
          servicePeriodStart: subscription.nextInvoiceAt.toISOString(),
          servicePeriodEnd: addBillingCycle(subscription.nextInvoiceAt, subscription.billingCycle).toISOString()
        }
      ]
    });

    await this.billing.advanceSubscription(id, addBillingCycle(subscription.nextInvoiceAt, subscription.billingCycle));

    return invoice;
  }

  revenueReport() {
    return this.billing.revenueReport();
  }

  async adminDashboardStats() {
    const [paid, activeServices, openTickets, failedPayments] = await this.billing.adminDashboardStats();

    return {
      mrrCents: paid._sum.totalCents ?? 0,
      activeServices,
      openTickets,
      failedPayments
    };
  }

  async runAdminMaintenance(now = new Date()) {
    const [invoiceDaysAhead, ticketCloseHours] = await Promise.all([
      this.billing.settingNumber("invoiceDaysAhead", 7),
      this.billing.settingNumber("ticketAutoCloseHours", 24)
    ]);
    const dueSubscriptions = await this.billing.dueSubscriptions(invoiceDaysAhead, now);
    let generatedInvoices = 0;

    for (const subscription of dueSubscriptions) {
      const latest = subscription.invoices[0];
      if (latest && latest.dueAt >= subscription.nextInvoiceAt) {
        continue;
      }

      await this.renewSubscription(subscription.id);
      generatedInvoices += 1;
    }

    const overdueInvoices = await this.billing.overdueUnpaidInvoices(now);
    const serviceIds = overdueInvoices.flatMap((invoice) =>
      invoice.items.map((item) => item.serviceId).filter((serviceId): serviceId is string => Boolean(serviceId))
    );

    await Promise.all(overdueInvoices.map((invoice) => this.billing.markInvoiceOverdue(invoice.id)));
    const suspended = await this.billing.suspendServices([...new Set(serviceIds)]);

    return {
      generatedInvoices,
      invoiceDaysAhead,
      overdueInvoices: overdueInvoices.length,
      suspendedServices: suspended.count,
      ticketCloseHours
    };
  }

  vatPercent() {
    return this.billing.settingNumber("vatPercent", 19);
  }

  async settings() {
    const [
      invoiceDaysAhead,
      ticketAutoCloseHours,
      vatPercent,
      invoiceFooterLine1,
      invoiceFooterLine2,
      invoiceFooterLine3,
      invoiceCompanyName,
      invoiceCompanyAddress,
      invoiceCompanyZip,
      invoiceCompanyCity,
      invoiceCompanyCountry,
      invoiceCompanyEmail,
      invoiceCompanyPhone,
      invoiceVatNumber,
      invoicePaymentInstructions,
      invoiceBankDetails
    ] = await Promise.all([
      this.billing.settingNumber("invoiceDaysAhead", 7),
      this.billing.settingNumber("ticketAutoCloseHours", 24),
      this.vatPercent(),
      this.billing.settingString("invoiceFooterLine1"),
      this.billing.settingString("invoiceFooterLine2"),
      this.billing.settingString("invoiceFooterLine3"),
      this.billing.settingString("invoiceCompanyName"),
      this.billing.settingString("invoiceCompanyAddress"),
      this.billing.settingString("invoiceCompanyZip"),
      this.billing.settingString("invoiceCompanyCity"),
      this.billing.settingString("invoiceCompanyCountry", "DE"),
      this.billing.settingString("invoiceCompanyEmail"),
      this.billing.settingString("invoiceCompanyPhone"),
      this.billing.settingString("invoiceVatNumber"),
      this.billing.settingString("invoicePaymentInstructions"),
      this.billing.settingString("invoiceBankDetails")
    ]);

    return {
      invoiceBankDetails,
      invoiceCompanyAddress,
      invoiceCompanyCity,
      invoiceCompanyCountry,
      invoiceCompanyEmail,
      invoiceCompanyName,
      invoiceCompanyPhone,
      invoiceCompanyZip,
      invoiceDaysAhead,
      invoiceFooterLine1,
      invoiceFooterLine2,
      invoiceFooterLine3,
      invoicePaymentInstructions,
      invoiceVatNumber,
      ticketAutoCloseHours,
      vatPercent
    };
  }

  async storefrontPaymentGateways() {
    const gateways = await this.billing.listPaymentGateways();
    const enabled = gateways.filter((gateway) => gateway.enabled);
    const source = gateways.length ? enabled : defaultPaymentGateways();

    return source.map((gateway) => ({
      method: gateway.method,
      title: gatewayTitle(gateway.method)
    }));
  }

  async adminPaymentGateways() {
    const gateways = await this.billing.listPaymentGateways();
    const byMethod = new Map(gateways.map((gateway) => [gateway.method, gateway]));
    return defaultPaymentGateways().map((gateway) => byMethod.get(gateway.method) ?? gateway);
  }

  updatePaymentGateways(input: Array<{ config?: Record<string, unknown>; enabled?: boolean; method: string }>) {
    return Promise.all(
      input.map((gateway) =>
        this.billing.upsertPaymentGateway({
          config: gateway.config ?? {},
          enabled: Boolean(gateway.enabled),
          method: gateway.method
        })
      )
    );
  }

  updateSettings(input: {
    invoiceBankDetails?: string;
    invoiceCompanyAddress?: string;
    invoiceCompanyCity?: string;
    invoiceCompanyCountry?: string;
    invoiceCompanyEmail?: string;
    invoiceCompanyName?: string;
    invoiceCompanyPhone?: string;
    invoiceCompanyZip?: string;
    invoiceDaysAhead?: number;
    invoiceFooterLine1?: string;
    invoiceFooterLine2?: string;
    invoiceFooterLine3?: string;
    invoicePaymentInstructions?: string;
    invoiceVatNumber?: string;
    ticketAutoCloseHours?: number;
    vatPercent?: number;
  }) {
    return Promise.all([
      input.invoiceDaysAhead === undefined
        ? undefined
        : this.billing.upsertSettingNumber("invoiceDaysAhead", input.invoiceDaysAhead),
      input.ticketAutoCloseHours === undefined
        ? undefined
        : this.billing.upsertSettingNumber("ticketAutoCloseHours", input.ticketAutoCloseHours),
      input.vatPercent === undefined ? undefined : this.billing.upsertSettingNumber("vatPercent", Math.max(0, input.vatPercent)),
      input.invoiceFooterLine1 === undefined ? undefined : this.billing.upsertSettingString("invoiceFooterLine1", input.invoiceFooterLine1),
      input.invoiceFooterLine2 === undefined ? undefined : this.billing.upsertSettingString("invoiceFooterLine2", input.invoiceFooterLine2),
      input.invoiceFooterLine3 === undefined ? undefined : this.billing.upsertSettingString("invoiceFooterLine3", input.invoiceFooterLine3),
      input.invoiceCompanyName === undefined ? undefined : this.billing.upsertSettingString("invoiceCompanyName", input.invoiceCompanyName),
      input.invoiceCompanyAddress === undefined ? undefined : this.billing.upsertSettingString("invoiceCompanyAddress", input.invoiceCompanyAddress),
      input.invoiceCompanyZip === undefined ? undefined : this.billing.upsertSettingString("invoiceCompanyZip", input.invoiceCompanyZip),
      input.invoiceCompanyCity === undefined ? undefined : this.billing.upsertSettingString("invoiceCompanyCity", input.invoiceCompanyCity),
      input.invoiceCompanyCountry === undefined ? undefined : this.billing.upsertSettingString("invoiceCompanyCountry", input.invoiceCompanyCountry),
      input.invoiceCompanyEmail === undefined ? undefined : this.billing.upsertSettingString("invoiceCompanyEmail", input.invoiceCompanyEmail),
      input.invoiceCompanyPhone === undefined ? undefined : this.billing.upsertSettingString("invoiceCompanyPhone", input.invoiceCompanyPhone),
      input.invoiceVatNumber === undefined ? undefined : this.billing.upsertSettingString("invoiceVatNumber", input.invoiceVatNumber),
      input.invoicePaymentInstructions === undefined
        ? undefined
        : this.billing.upsertSettingString("invoicePaymentInstructions", input.invoicePaymentInstructions),
      input.invoiceBankDetails === undefined ? undefined : this.billing.upsertSettingString("invoiceBankDetails", input.invoiceBankDetails)
    ]);
  }

  updateServiceStatus(id: string, status: string) {
    return this.billing.setServiceStatus(id, status);
  }

  private async invoiceFooterLines() {
    const settings = await Promise.all([
      this.billing.settingString("invoiceFooterLine1"),
      this.billing.settingString("invoiceFooterLine2"),
      this.billing.settingString("invoiceFooterLine3")
    ]);

    return settings.filter((line) => line.trim().length > 0);
  }

  private async invoiceSellerSnapshot() {
    const [
      companyName,
      address,
      zip,
      city,
      country,
      email,
      phone,
      vatNumber,
      paymentInstructions,
      bankDetails,
      footerLines
    ] = await Promise.all([
      this.billing.settingString("invoiceCompanyName"),
      this.billing.settingString("invoiceCompanyAddress"),
      this.billing.settingString("invoiceCompanyZip"),
      this.billing.settingString("invoiceCompanyCity"),
      this.billing.settingString("invoiceCompanyCountry", "DE"),
      this.billing.settingString("invoiceCompanyEmail"),
      this.billing.settingString("invoiceCompanyPhone"),
      this.billing.settingString("invoiceVatNumber"),
      this.billing.settingString("invoicePaymentInstructions"),
      this.billing.settingString("invoiceBankDetails"),
      this.invoiceFooterLines()
    ]);

    return {
      address,
      bankDetails,
      city,
      companyName,
      country,
      email,
      footerLines,
      paymentInstructions,
      phone,
      vatNumber,
      zip
    };
  }
}

function formatEuro(cents: number) {
  return `${(cents / 100).toFixed(2)} EUR`;
}

function formatBillingCycle(cycle: string) {
  return {
    MONTHLY: "monthly",
    QUARTERLY: "quarterly",
    SEMI_ANNUAL: "semi-annual",
    YEAR_1: "annually",
    YEAR_2: "2 years",
    YEAR_3: "3 years",
    YEAR_4: "4 years",
    ONE_TIME: "one time"
  }[cycle] ?? cycle.toLowerCase();
}

type LifecycleItem = {
  domainRecord?: Record<string, any> | null;
  domainRecordId?: string | null;
  lifecycleAction?: string | null;
  orderItem?: Record<string, any> | null;
  orderItemId?: string | null;
  service?: Record<string, any> | null;
  serviceId?: string | null;
  type?: string | null;
};

function lifecycleItems(invoice: Record<string, any>): LifecycleItem[] {
  const items: LifecycleItem[] = [];
  const seen = new Set<string>();
  for (const item of invoice.items ?? []) {
    if (item.service || item.domainRecord) {
      const key = `${item.service?.id ?? ""}:${item.domainRecord?.id ?? ""}:${item.orderItem?.id ?? item.orderItemId ?? ""}`;
      if (!seen.has(key)) {
        seen.add(key);
        items.push(item);
      }
    }
  }
  for (const orderItem of invoice.order?.items ?? []) {
    const domainRecord = Array.isArray(orderItem.domainRecords) ? orderItem.domainRecords[0] : undefined;
    if (!orderItem.service && !domainRecord) {
      continue;
    }
    const key = `${orderItem.service?.id ?? ""}:${domainRecord?.id ?? ""}:${orderItem.id}`;
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    items.push({ domainRecord, lifecycleAction: domainRecord?.type, orderItem, service: orderItem.service, type: orderItem.type });
  }
  return items;
}

function serviceAction(item: LifecycleItem, service: Record<string, any>) {
  const explicit = normalizeLifecycleAction(item.lifecycleAction);
  if (explicit === "renew") {
    return "renew";
  }
  if (service.status === "SUSPENDED") {
    return "unsuspend";
  }
  if (["ORDERED", "PENDING", "PROVISIONING", "FAILED", "PROVISIONING_FAILED"].includes(service.status)) {
    return "create";
  }
  return explicit === "create" ? "create" : "none";
}

function domainActionForItem(item: LifecycleItem, domain: Record<string, any>) {
  const explicit = normalizeLifecycleAction(item.lifecycleAction ?? domain.type);
  if (explicit === "renew") {
    return "renew_domain";
  }
  if (explicit === "transfer") {
    return "transfer_domain";
  }
  return "register_domain";
}

function normalizeLifecycleAction(value: unknown) {
  const normalized = typeof value === "string" ? value.toLowerCase() : "";
  if (["renew", "renew_domain", "domain_renewal", "service_renewal"].includes(normalized)) {
    return "renew";
  }
  if (["transfer", "transfer_domain"].includes(normalized)) {
    return "transfer";
  }
  if (["create", "register", "register_domain"].includes(normalized)) {
    return "create";
  }
  return normalized;
}

function canRunActionForPaidInvoice(invoice: Record<string, any>, action: string, source?: string) {
  if (source === "admin") {
    return true;
  }
  const dueAt = invoice.dueAt instanceof Date ? invoice.dueAt : new Date(invoice.dueAt);
  const overdue = dueAt.getTime() < Date.now() || invoice.status === "OVERDUE";
  if (!overdue) {
    return true;
  }
  return ["create", "register_domain"].includes(action);
}

function hostingModuleName(productType?: string) {
  return ["VPS", "DEDICATED_SERVER"].includes(productType ?? "") ? "hetzner" : "virtualmin";
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

function domainModuleRequest(action: string, domain: Record<string, any>, item: LifecycleItem, customerSnapshot: unknown) {
  if (action === "renew_domain") {
    return {
      autoRenew: domain.autoRenew ?? true,
      domain: domain.domain,
      expDate: Math.floor(new Date(domain.expiresAt ?? Date.now()).getTime() / 1000),
      orderId: Number(domain.externalId ?? 0),
      years: domain.registrationPeriodYears ?? 1
    };
  }
  if (action === "transfer_domain") {
    return {
      authCode: domain.eppCode ?? transferAuthCode(item.orderItem?.configuration),
      autoRenew: domain.autoRenew ?? true,
      customerContact: domainCustomerContact(customerSnapshot),
      domain: domain.domain,
      nameServers: domainNameServers(domain.nameservers ?? item.orderItem?.configuration),
      years: domain.registrationPeriodYears ?? 1
    };
  }
  return {
    autoRenew: domain.autoRenew ?? true,
    customerContact: domainCustomerContact(customerSnapshot),
    domain: domain.domain,
    nameServers: domainNameServers(domain.nameservers ?? item.orderItem?.configuration),
    years: domain.registrationPeriodYears ?? 1
  };
}

function nextServiceDueDate(service: Record<string, any>, baseDate: Date | string) {
  const cycle = service.billingCycle ?? service.productPrice?.billingCycle;
  if (!cycle || cycle === "ONE_TIME") {
    return undefined;
  }
  return addBillingCycle(new Date(baseDate), cycle);
}

function nextDomainExpiry(domain: Record<string, any>) {
  const years = domain.registrationPeriodYears ?? 1;
  const next = new Date(domain.expiresAt ?? Date.now());
  next.setFullYear(next.getFullYear() + years);
  return next;
}

function domainNameServers(value: unknown) {
  if (Array.isArray(value)) {
    return value.filter((item): item is string => typeof item === "string" && item.length > 0);
  }
  if (!isRecord(value) || !Array.isArray(value.nameServers)) {
    return undefined;
  }
  return value.nameServers.filter((item): item is string => typeof item === "string" && item.length > 0);
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

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function createSimplePdf(lines: string[]) {
  const escaped = lines.map((line, index) => `BT /F1 10 Tf 50 ${780 - index * 16} Td (${pdfEscape(line)}) Tj ET`).join("\n");
  const objects = [
    "1 0 obj << /Type /Catalog /Pages 2 0 R >> endobj",
    "2 0 obj << /Type /Pages /Kids [3 0 R] /Count 1 >> endobj",
    "3 0 obj << /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >> endobj",
    "4 0 obj << /Type /Font /Subtype /Type1 /BaseFont /Helvetica >> endobj",
    `5 0 obj << /Length ${Buffer.byteLength(escaped)} >> stream\n${escaped}\nendstream endobj`
  ];
  let offset = "%PDF-1.4\n".length;
  const xref = ["0000000000 65535 f "];
  const body = objects.map((object) => {
    xref.push(`${String(offset).padStart(10, "0")} 00000 n `);
    offset += Buffer.byteLength(`${object}\n`);
    return object;
  }).join("\n");
  const start = Buffer.byteLength(`%PDF-1.4\n${body}\n`);
  const pdf = `%PDF-1.4\n${body}\nxref\n0 ${xref.length}\n${xref.join("\n")}\ntrailer << /Root 1 0 R /Size ${xref.length} >>\nstartxref\n${start}\n%%EOF`;
  return Buffer.from(pdf);
}

function pdfEscape(value: string) {
  return value.replace(/[\\()]/g, "\\$&");
}

function defaultPaymentGateways(): Array<{ config: Record<string, unknown>; enabled: boolean; method: PaymentMethodType }> {
  return [
    { config: {}, enabled: true, method: "CREDIT_CARD" },
    { config: {}, enabled: true, method: "PAYPAL" },
    { config: {}, enabled: true, method: "SEPA" }
  ];
}

function gatewayTitle(method: string) {
  return {
    CREDIT_CARD: "Credit/debit card",
    PAYPAL: "Paypal",
    SEPA: "SEPA Lastschrift"
  }[method] ?? method;
}
