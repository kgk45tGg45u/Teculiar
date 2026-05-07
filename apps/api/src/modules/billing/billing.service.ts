import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import type { PaymentMethodType } from "@prisma/client";
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
    const [vatRate, footerLines] = await Promise.all([this.vatPercent(), this.invoiceFooterLines()]);
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
      footerLines,
      orderSnapshot: dto.orderSnapshot,
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
    const lines = [
      "Dezhost",
      `Rechnung ${invoice.invoiceNumber}`,
      `Status: ${invoice.status}`,
      `Datum: ${invoice.issuedAt.toISOString().slice(0, 10)}`,
      `Faellig: ${invoice.dueAt.toISOString().slice(0, 10)}`,
      "",
      ...invoice.items.map((item) => `${item.description}  ${item.quantity} x ${formatEuro(item.unitAmountCents)} = ${formatEuro(item.totalCents)}`),
      "",
      `Zwischensumme: ${formatEuro(invoice.subtotalCents)}`,
      invoice.taxAmountCents > 0 ? `USt.: ${formatEuro(invoice.taxAmountCents)}` : "",
      `Gesamt: ${formatEuro(invoice.totalCents)}`,
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

  vatPercent() {
    return this.billing.settingNumber("vatPercent", 19);
  }

  async settings() {
    const [invoiceDaysAhead, ticketAutoCloseHours, vatPercent, invoiceFooterLine1, invoiceFooterLine2, invoiceFooterLine3] = await Promise.all([
      this.billing.settingNumber("invoiceDaysAhead", 7),
      this.billing.settingNumber("ticketAutoCloseHours", 24),
      this.vatPercent(),
      this.billing.settingString("invoiceFooterLine1"),
      this.billing.settingString("invoiceFooterLine2"),
      this.billing.settingString("invoiceFooterLine3")
    ]);

    return { invoiceDaysAhead, invoiceFooterLine1, invoiceFooterLine2, invoiceFooterLine3, ticketAutoCloseHours, vatPercent };
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
    invoiceDaysAhead?: number;
    invoiceFooterLine1?: string;
    invoiceFooterLine2?: string;
    invoiceFooterLine3?: string;
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
      input.invoiceFooterLine3 === undefined ? undefined : this.billing.upsertSettingString("invoiceFooterLine3", input.invoiceFooterLine3)
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
}

function formatEuro(cents: number) {
  return `${(cents / 100).toFixed(2)} EUR`;
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
