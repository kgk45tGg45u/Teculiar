import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
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
    private readonly payments: AbstractPaymentService
  ) {}

  async createInvoice(dto: CreateInvoiceDto) {
    const coupon = await this.billing.findCoupon(dto.couponCode);
    const draft = this.engine.createDraft({
      lines: dto.lines.map((line) => ({ ...line, taxRate: 0 })),
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
      }
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
      couponId: coupon?.id,
      lines: draft.lines.map((line) => ({
        ...line,
        serviceId: dto.lines.find((item) => item.description === line.description)?.serviceId
      }))
    });
  }

  listInvoices(filters: { status?: string; userId?: string }) {
    return this.billing.listInvoices(filters);
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
      return this.billing.updateInvoiceStatus(id, "PAID");
    }

    if (result.status === "FAILED") {
      return this.billing.updateInvoiceStatus(id, "FAILED");
    }

    return this.billing.updateInvoiceStatus(id, "PENDING");
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
          quantity: 1,
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

  updateSettings(input: { invoiceDaysAhead?: number; ticketAutoCloseHours?: number }) {
    return Promise.all([
      input.invoiceDaysAhead === undefined
        ? undefined
        : this.billing.upsertSettingNumber("invoiceDaysAhead", input.invoiceDaysAhead),
      input.ticketAutoCloseHours === undefined
        ? undefined
        : this.billing.upsertSettingNumber("ticketAutoCloseHours", input.ticketAutoCloseHours)
    ]);
  }

  updateServiceStatus(id: string, status: string) {
    return this.billing.setServiceStatus(id, status);
  }
}
