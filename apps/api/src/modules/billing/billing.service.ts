import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import type { PaymentMethodType } from "@prisma/client";
import { resolveVat, sanitizeTaxCountryConfig, type TaxContext, type TaxCountryConfig, vatPercentForCountry } from "@dezhost/shared";
import { formatDate, formatMoney } from "../../common/i18n";
import { EmailService } from "../email/email.service";
import { ExternalService } from "../external/external.service";
import { ModuleRegistryService } from "../module-registry/module-registry.service";
import { TicketsService } from "../tickets/tickets.service";
import { BillingEngineService } from "./billing-engine.service";
import { BillingRepository } from "./billing.repository";
import { CreateInvoiceDto } from "./dto/create-invoice.dto";
import { CreateSubscriptionDto } from "./dto/create-subscription.dto";
import { PayInvoiceDto } from "./dto/pay-invoice.dto";
import { renderInvoiceDocument, renderInvoicePdfFromHtml } from "./invoice-document";
import { addBillingCycle } from "./platform-rules";
import { AbstractPaymentService } from "./processors/abstract-payment.service";

@Injectable()
export class BillingService {
  constructor(
    private readonly billing: BillingRepository,
    private readonly engine: BillingEngineService,
    private readonly payments: AbstractPaymentService,
    private readonly external?: ExternalService,
    private readonly emails?: EmailService,
    private readonly ticketsService?: TicketsService,
    private readonly modules?: ModuleRegistryService
  ) {}

  private onCheckoutInvoicePaidHook?: (invoiceId: string) => Promise<void>;

  registerOnCheckoutInvoicePaid(fn: (invoiceId: string) => Promise<void>): void {
    this.onCheckoutInvoicePaidHook = fn;
  }

  async createInvoice(dto: CreateInvoiceDto & { suppressNewInvoiceEmail?: boolean }) {
    const coupon = await this.billing.findCoupon(dto.couponCode);
    const [taxConfig, sellerSnapshot, footerLines, currency, languages] = await Promise.all([this.taxCountryConfig(), this.invoiceSellerSnapshot(), this.invoiceFooterLines(), this.mainCurrency(), this.i18nLanguages()]);
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
      taxConfig
    });

    const invoice = await this.billing.createInvoice({
      userId: dto.userId,
      teamId: dto.teamId,
      status: dto.status ?? "PENDING",
      issuedAt: dto.issuedAt ? new Date(dto.issuedAt) : new Date(),
      dueAt: new Date(dto.dueAt),
      subtotalCents: draft.subtotalCents,
      discountCents: draft.discountCents,
      taxAmountCents: draft.taxAmountCents,
      totalCents: draft.totalCents,
      reverseCharge: draft.reverseCharge,
      taxReason: draft.taxReason,
      currency,
      // Freeze the invoice's language at creation (main language), mirroring `currency`.
      locale: languages.main,
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
    void this.recordAction({
      action: "invoice.created",
      actorId: dto.userId,
      metadata: { status: invoice.status, totalCents: invoice.totalCents },
      subject: "invoice",
      subjectId: invoice.id
    }).catch(() => undefined);
    if (!dto.suppressNewInvoiceEmail) {
      void this.dispatchInvoiceEmail("new_invoice", invoice, {
        customerSnapshot: dto.customerSnapshot,
        userId: dto.userId
      }).catch(() => undefined);
    }
    return invoice;
  }

  listInvoices(filters: { status?: string; userId?: string }) {
    return this.billing.listInvoices(filters);
  }

  listLogs(limit?: number) {
    return this.billing.listLogs(limit);
  }

  listLogsPaged(input: { kind: "system" | "cron"; page?: number; pageSize?: number }) {
    return this.billing.listLogsPaged(input);
  }

  recordAction(input: { action: string; actorId?: string; metadata?: Record<string, unknown>; subject: string; subjectId?: string }) {
    const repository = this.billing as BillingRepository & {
      createAuditLog?: (data: typeof input) => Promise<unknown>;
    };
    return repository.createAuditLog?.(input) ?? Promise.resolve(undefined);
  }

  listPaymentMethods(userId: string) {
    return this.billing.listUserPaymentMethods(userId);
  }

  async setupPaymentMethod(userId: string, input: { iban?: string; method: string }) {
    if (!["CREDIT_CARD", "PAYPAL", "SEPA"].includes(input.method)) {
      throw new BadRequestException("Unsupported automatic payment method.");
    }
    const user = await this.billing.findUserForPaymentSetup(userId);
    if (!user) {
      throw new NotFoundException("User not found");
    }
    const customer = await this.payments.createMollieCustomer({
      email: user.email,
      name: user.name || user.email
    });
    const setup = await this.payments.setupMollieMandate({
      customerId: customer.id,
      iban: input.iban,
      method: input.method,
      name: user.name || user.email,
      redirectUrl: `${publicWebUrl()}/client/billing/payment-method-return`,
      webhookUrl: gatewayWebhookUrl(input.method)
    }) as { mandateId?: string; paymentRedirectUrl?: string; providerReference: string; status: "FAILED" | "PENDING" | "SUCCEEDED" };
    const verified = setup.status === "SUCCEEDED";
    const paymentMethod = await this.billing.createPaymentMethod({
      automatic: true,
      label: paymentMethodLabel(input.method),
      mandateId: setup.mandateId,
      provider: "mollie",
      providerCustomerId: customer.id,
      providerToken: setup.mandateId ?? setup.providerReference,
      status: verified ? "VALID" : "PENDING",
      type: input.method,
      userId,
      verifiedAt: verified ? new Date() : undefined
    });
    return {
      paymentMethod,
      paymentRedirectUrl: setup.paymentRedirectUrl,
      status: paymentMethod.status
    };
  }

  async confirmPaymentMethod(userId: string, id: string) {
    const method = await this.billing.findPaymentMethod(id, userId);
    if (!method) {
      throw new NotFoundException("Payment method not found");
    }
    if (method.status === "VALID") {
      return method;
    }
    const confirmed = await this.payments.confirmMollieMandateSetup({
      customerId: method.providerCustomerId,
      method: method.type,
      providerReference: method.providerToken
    });
    if (confirmed.status !== "SUCCEEDED") {
      return this.billing.updatePaymentMethod(method.id, { status: confirmed.status });
    }
    return this.billing.updatePaymentMethod(method.id, {
      mandateId: confirmed.mandateId,
      providerCustomerId: confirmed.customerId,
      providerToken: confirmed.mandateId,
      status: "VALID",
      verifiedAt: new Date()
    });
  }

  async updatePaymentMethod(userId: string, id: string, input: { automatic?: boolean; default?: boolean }) {
    const method = await this.billing.findPaymentMethod(id, userId);
    if (!method) {
      throw new NotFoundException("Payment method not found");
    }
    return this.billing.updatePaymentMethod(id, input);
  }

  deletePaymentMethod(userId: string, id: string) {
    return this.billing.deletePaymentMethod(id, userId);
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

    if (invoice.status === "PAID") {
      (invoice as Record<string, unknown>).paymentMethodLabel = await this.resolvePaymentMethodLabel(invoice);
    }

    return invoice;
  }

  // Resolves the display name for the gateway used to pay an invoice. Names are
  // admin-defined under settings > Payment gateways and fall back to a sensible
  // default when unset. Returns undefined when no successful payment exists.
  private async resolvePaymentMethodLabel(invoice: {
    transactions?: Array<{ createdAt: Date; method: string; status: string }>;
  }): Promise<string | undefined> {
    const transactions = invoice.transactions ?? [];
    const paid = transactions
      .filter((transaction) => transaction.status === "SUCCEEDED")
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())[0];
    const method = paid?.method;
    if (!method) {
      return undefined;
    }
    if (method === "BANK_TRANSFER") {
      const name = await this.billing.settingString("bankTransfer.displayName");
      return name.trim() || defaultPaymentMethodLabel(method);
    }
    const gateway = await this.billing.paymentGateway(method);
    const displayName = gateway && isRecord(gateway.config) ? stringFrom(gateway.config.displayName) : undefined;
    return displayName ?? defaultPaymentMethodLabel(method);
  }

  // Locale an invoice renders in. The viewer's current display language (passed by the portal
  // when opening the HTML/PDF) wins so the document matches the on-screen invoice, which follows
  // the language toggle. Otherwise: the invoice's own frozen snapshot, else the buyer's current
  // language, else the configured main language. Amounts always stay in the frozen currency.
  private async invoiceLocale(invoice: Record<string, any>, preferred?: string): Promise<string> {
    const requested = localeCodeFrom(preferred);
    if (requested) {
      return requested;
    }
    const stored = stringFrom(invoice.locale);
    if (stored) {
      return stored;
    }
    const userLocale = stringFrom(invoice.user?.locale);
    if (userLocale) {
      return userLocale;
    }
    return (await this.i18nLanguages()).main;
  }

  async invoiceHtml(id: string, user?: { roles?: string[]; sub: string }, locale?: string) {
    const invoice = await this.getInvoice(id, user);
    const { url } = await this.invoiceLogo();
    const resolved = await this.invoiceLocale(invoice, locale);
    return renderInvoiceDocument(invoice, { logoUrl: url, locale: resolved }).html;
  }

  async invoicePdf(id: string, user?: { roles?: string[]; sub: string }, locale?: string) {
    const invoice = await this.getInvoice(id, user);
    const { url, image } = await this.invoiceLogo();
    const resolved = await this.invoiceLocale(invoice, locale);
    const html = renderInvoiceDocument(invoice, { logoUrl: url, locale: resolved }).html;
    return renderInvoicePdfFromHtml(html, image);
  }

  // The invoice uses the same logo the admin configures on the settings page. For the HTML view we
  // pass the URL straight through; for the PDF we need raw PNG/JPEG bytes (pdfkit can't render SVG),
  // which we recover from the uploaded SVG wrapper or a data URL. Anything else falls back to text.
  private async invoiceLogo(): Promise<{ url?: string; image?: Buffer }> {
    const url = (await this.billing.settingString("siteLogoUrl")) || undefined;
    if (!url) {
      return {};
    }
    return { url, image: await loadPdfLogoImage(url) };
  }

  async sendInvoice(id: string) {
    const invoice = await this.billing.findInvoice(id);
    if (!invoice) {
      throw new NotFoundException("Invoice not found");
    }
    return this.billing.updateInvoiceStatus(id, "PENDING");
  }

  async payInvoice(id: string, dto: PayInvoiceDto, options: { processLifecycle?: boolean } = {}) {
    const invoice = await this.billing.findInvoice(id);
    if (!invoice) {
      throw new NotFoundException("Invoice not found");
    }
    if (!["PENDING", "OVERDUE", "FAILED"].includes(invoice.status)) {
      throw new BadRequestException("Invoice is not payable");
    }

    await this.recordAction({
      action: "invoice.payment_started",
      metadata: { method: dto.method, totalCents: invoice.totalCents },
      subject: "invoice",
      subjectId: id
    });

    // Bank Wire Transfer is an internal manual gateway — no payment processor involved.
    // The invoice stays PENDING until admin manually confirms receipt via the claimed endpoint.
    if (dto.method === "BANK_TRANSFER") {
      const providerReference = `wire-${id}`;
      await this.billing.createTransaction({
        invoiceId: id,
        method: "BANK_TRANSFER",
        status: "PENDING",
        amountCents: invoice.totalCents,
        currency: invoice.currency,
        providerReference,
        raw: { manual: true }
      });
      await this.recordAction({
        action: "invoice.payment_pending",
        metadata: { method: "BANK_TRANSFER", providerReference },
        subject: "invoice",
        subjectId: id
      });
      return this.billing.updateInvoiceStatus(id, "PENDING");
    }

    // Apply account balance only when the client opts in (manual payment) and the invoice is not a
    // funds-deposit invoice. A funds deposit tops up the balance, so it can never be paid FROM it.
    const invoiceSnapshot = isRecord(invoice.orderSnapshot) ? invoice.orderSnapshot : {};
    const isFundsDeposit = typeof invoiceSnapshot.accountCreditCents === "number" && invoiceSnapshot.accountCreditCents > 0;
    const useAccountBalance = dto.useAccountBalance === true;
    const userBalanceCents = !isFundsDeposit && useAccountBalance ? (invoice.user?.balanceCents ?? 0) : 0;
    const appliedBalanceCents = Math.min(userBalanceCents, invoice.totalCents);
    const externalAmountCents = invoice.totalCents - appliedBalanceCents;

    // Balance covers the full invoice — no external payment needed
    if (!isFundsDeposit && appliedBalanceCents >= invoice.totalCents) {
      const debit = await this.billing.debitUserBalance(invoice.userId, invoice.totalCents);
      if (debit.count !== 1) {
        throw new BadRequestException("Account balance is no longer sufficient to cover this invoice.");
      }
      await this.billing.createTransaction({
        invoiceId: id,
        method: "ACCOUNT_BALANCE",
        status: "SUCCEEDED",
        amountCents: invoice.totalCents,
        currency: invoice.currency,
        providerReference: `account_balance_${id}_${Date.now()}`,
        raw: { source: "account_balance" }
      });
      await this.recordAction({
        action: "invoice.payment_succeeded",
        metadata: { method: "ACCOUNT_BALANCE", totalCents: invoice.totalCents },
        subject: "invoice",
        subjectId: id
      });
      const fullyPaid = await this.finalizePaidInvoice(id, { source: "account_balance" }, options);
      return options.processLifecycle === false ? fullyPaid : { ...fullyPaid, lifecycleProcessed: true };
    }

    const processor = this.payments.get(dto.method);
    let result;
    try {
      result = await processor.charge({
        invoiceId: id,
        amountCents: externalAmountCents,
        currency: invoice.currency,
        description: `Invoice ${invoice.invoiceNumber}`,
        iban: dto.iban ? validateAndNormalizeIban(dto.iban) : undefined,
        paymentMethodId: dto.paymentMethodId,
        redirectUrl: `${publicWebUrl()}/client/billing/payment-return?invoiceId=${encodeURIComponent(id)}`,
        userId: invoice.userId,
        webhookUrl: gatewayWebhookUrl(dto.method)
      });
    } catch (error) {
      await this.recordAction({
        action: "invoice.payment_error",
        metadata: { error: error instanceof Error ? error.message : "Payment processor failed", method: dto.method },
        subject: "invoice",
        subjectId: id
      });
      throw error;
    }

    await this.billing.createTransaction({
      invoiceId: id,
      method: dto.method,
      status: result.status,
      amountCents: externalAmountCents,
      currency: invoice.currency,
      providerReference: result.providerReference,
      raw: { ...(result.raw ?? {}), ...(appliedBalanceCents > 0 ? { balanceCents: appliedBalanceCents } : {}) }
    });

    if (result.status === "SUCCEEDED") {
      await this.recordAction({
        action: "invoice.payment_succeeded",
        metadata: { method: dto.method, providerReference: result.providerReference },
        subject: "invoice",
        subjectId: id
      });
      const paid = await this.finalizePaidInvoice(id, { source: "gateway" }, options);
      if (options.processLifecycle === false) {
        return paid;
      }
      return { ...paid, lifecycleProcessed: true };
    }

    if (result.status === "FAILED") {
      await this.recordAction({
        action: "invoice.payment_failed",
        metadata: { method: dto.method, providerReference: result.providerReference },
        subject: "invoice",
        subjectId: id
      });
      return this.billing.updateInvoiceStatus(id, "FAILED");
    }

    await this.recordAction({
      action: "invoice.payment_pending",
      metadata: { method: dto.method, providerReference: result.providerReference },
      subject: "invoice",
      subjectId: id
    });
    const pending = await this.billing.updateInvoiceStatus(id, "PENDING");
    return { ...pending, paymentRedirectUrl: result.paymentRedirectUrl, providerReference: result.providerReference };
  }

  async addFunds(userId: string, input: { amountCents: number; iban?: string; method: string }) {
    if (!Number.isInteger(input.amountCents) || input.amountCents <= 0) {
      throw new BadRequestException("Amount must be greater than zero.");
    }
    const user = await this.billing.findUserBillingProfile(userId);
    if (!user) {
      throw new NotFoundException("User not found");
    }
    const normalizedIban = input.iban ? validateAndNormalizeIban(input.iban) : undefined;
    const payment: PayInvoiceDto = input.method === "SANDBOX"
      ? { method: "CREDIT_CARD", paymentMethodId: "sandbox" }
      : input.method === "PAYPAL"
        ? { method: "PAYPAL", paymentMethodId: "checkout" }
        : { method: input.method, paymentMethodId: input.method.toLowerCase(), ...(normalizedIban ? { iban: normalizedIban } : {}) } as PayInvoiceDto;
    const invoice = await this.createInvoice({
      buyerCountryCode: "DE",
      customerSnapshot: customerSnapshotFromBillingProfile(user),
      dueAt: new Date().toISOString(),
      lines: [{
        description: "Funds deposit",
        quantity: 1,
        type: "CUSTOM",
        unitAmountCents: input.amountCents,
        vatRate: 0
      }],
      orderSnapshot: { accountCreditCents: input.amountCents },
      status: "PENDING",
      userId
    });
    const paid = await this.payInvoice(invoice.id, payment, { processLifecycle: false });
    return {
      amountCents: input.amountCents,
      invoiceId: invoice.id,
      invoiceNumber: invoice.invoiceNumber,
      paymentRedirectUrl: (paid as { paymentRedirectUrl?: string }).paymentRedirectUrl,
      status: paid.status
    };
  }

  async markInvoicePaid(id: string, input: { actorId?: string; source?: string } = {}) {
    const paid = await this.finalizePaidInvoice(id, { actorId: input.actorId, source: input.source ?? "admin" });
    return { ...paid, lifecycleProcessed: true };
  }

  async confirmInvoicePayment(id: string) {
    const invoice = await this.billing.findInvoice(id);
    if (!invoice) {
      throw new NotFoundException("Invoice not found");
    }
    // Short-circuit: if the webhook (or a concurrent confirm call) already paid this invoice,
    // skip the gateway capture entirely and return the already-paid state.  This prevents
    // ORDER_ALREADY_CAPTURED errors from PayPal when both the webhook and the payment-return
    // page race to confirm the same transaction.
    if (invoice.status === "PAID") {
      return { invoice, status: "PAID" };
    }
    const transaction = [...(invoice.transactions ?? [])].reverse().find((item) => item.status === "PENDING") ?? invoice.transactions?.at(-1);
    if (!transaction) {
      throw new BadRequestException("Invoice has no payment transaction to confirm.");
    }
    const processor = this.payments.get(transaction.method);
    const result = processor.confirm ? await processor.confirm(transaction.providerReference) : { providerReference: transaction.providerReference, status: "SUCCEEDED" as const };
    await this.billing.updateTransactionStatus(transaction.id, result.status, result.raw ?? {});
    if (result.status === "SUCCEEDED") {
      await this.applyAutomaticBalanceDebit(invoice, transaction);

      if (transaction.method === "PAYPAL" && isRecord(result.raw)) {
        const vaultId = stringFrom(result.raw.paypalVaultId);
        const customerId = stringFrom(result.raw.paypalCustomerId);
        if (vaultId) {
          void this.savePayPalVaultToken(invoice.userId, vaultId, customerId).catch(() => undefined);
        }
      }

      if (["CREDIT_CARD", "SEPA"].includes(transaction.method)) {
        const customerIdFromRaw = isRecord(result.raw)
          ? (stringFrom(result.raw.customerId) ?? stringFrom(result.raw.mollieCustomerId))
          : undefined;
        const customerIdFromTx = isRecord(transaction.raw) ? stringFrom(transaction.raw.mollieCustomerId) : undefined;
        const mollieCustomerId = customerIdFromRaw ?? customerIdFromTx;
        if (mollieCustomerId) {
          void this.saveMollieMandate(invoice.userId, mollieCustomerId, String(transaction.method)).catch(() => undefined);
        }
      }

      const paid = await this.finalizePaidInvoice(id, { source: "gateway" });
      return { invoice: paid, status: "PAID" };
    }
    if (result.status === "FAILED") {
      return { invoice: await this.billing.updateInvoiceStatus(id, "FAILED"), status: "FAILED" };
    }
    return { invoice: await this.billing.updateInvoiceStatus(id, "PENDING"), status: "PENDING" };
  }

  private async saveMollieMandate(userId: string, mollieCustomerId: string, method: string) {
    const result = await this.payments.getMollieMandateForCustomer(mollieCustomerId, method);
    if (!result) {
      return;
    }
    const existing = await this.billing.findUserPaymentMethodByToken(userId, result.mandateId);
    if (existing) {
      return existing;
    }
    return this.billing.createPaymentMethod({
      automatic: true,
      label: method === "CREDIT_CARD" ? "Credit/debit card" : "SEPA Direct Debit",
      mandateId: result.mandateId,
      provider: "mollie",
      providerCustomerId: mollieCustomerId,
      providerToken: result.mandateId,
      status: "VALID",
      type: method,
      userId,
      verifiedAt: new Date()
    });
  }

  async getUserForAutoLogin(userId: string) {
    return this.billing.findUserForAutoLogin(userId);
  }

  async setDefaultPaymentMethod(userId: string, id: string) {
    const method = await this.billing.findPaymentMethod(id, userId);
    if (!method) {
      throw new NotFoundException("Payment method not found");
    }
    return this.billing.setDefaultPaymentMethod(userId, id);
  }

  async claimBankTransferPaid(invoiceId: string, userId: string) {
    const invoice = await this.billing.findInvoice(invoiceId);
    if (!invoice) throw new NotFoundException("Invoice not found");
    if (invoice.userId !== userId) throw new NotFoundException("Invoice not found");
    if (!["PENDING", "OVERDUE", "FAILED"].includes(invoice.status)) {
      throw new BadRequestException("Invoice is not awaiting payment");
    }

    await this.recordAction({
      action: "invoice.bank_transfer_claimed",
      metadata: { invoiceId, userId },
      subject: "invoice",
      subjectId: invoiceId
    });

    if (this.ticketsService) {
      const invoiceLabel = invoice.invoiceNumber ?? invoice.id;
      await this.ticketsService.createTicketForSlug(userId, {
        body: `Customer has indicated payment via bank wire transfer for invoice ${invoiceLabel}.\n\nPlease verify the payment in your bank account and activate the service manually once confirmed.`,
        departmentSlug: "sales",
        priority: "NORMAL",
        subject: `Bank Transfer Claimed — Invoice ${invoiceLabel}`
      });
    }

    return { ok: true };
  }

  private async savePayPalVaultToken(userId: string, vaultId: string, customerId?: string) {
    const existing = await this.billing.findUserPaymentMethodByToken(userId, vaultId);
    if (existing) {
      return existing;
    }
    return this.billing.createPaymentMethod({
      automatic: true,
      label: "PayPal",
      mandateId: vaultId,
      provider: "paypal",
      providerCustomerId: customerId,
      providerToken: vaultId,
      status: "VALID",
      type: "PAYPAL",
      userId,
      verifiedAt: new Date()
    });
  }

  async markInvoiceUnpaid(id: string, input: { actorId?: string; reason?: string } = {}) {
    const lifecycleInvoice = await this.billing.findInvoiceForLifecycle(id);
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
    const lifecycleUser = lifecycleInvoice?.user;
    for (const item of lifecycleInvoice?.items ?? []) {
      if (item.service) {
        void this.dispatchServiceEmail("hosting_account_suspended", { ...item.service, status: "SUSPENDED", user: lifecycleUser }).catch(() => undefined);
      }
    }
    return invoice;
  }

  async refundInvoice(id: string, input: { actorId?: string; reason?: string } = {}) {
    const invoice = await this.billing.findInvoice(id);
    if (!invoice) {
      throw new NotFoundException("Invoice not found");
    }
    const snapshot = isRecord(invoice.orderSnapshot) ? invoice.orderSnapshot : {};
    const accountCreditCents = typeof snapshot.accountCreditCents === "number" ? snapshot.accountCreditCents : 0;
    const refunded = await this.billing.refundInvoice(id);
    if (accountCreditCents > 0) {
      await this.billing.subtractUserBalance(invoice.userId, accountCreditCents);
    }
    await this.billing.createAuditLog({
      action: "invoice.refunded",
      actorId: input.actorId,
      metadata: { accountCreditCents, reason: input.reason },
      subject: "invoice",
      subjectId: id
    });
    void this.dispatchInvoiceEmail("refund_request_sent", refunded, { customerSnapshot: invoice.customerSnapshot, userId: invoice.userId }).catch(() => undefined);
    return refunded;
  }

  deleteInvoice(id: string) {
    return this.billing.deleteInvoice(id);
  }

  async onInvoicePaid(invoiceId: string, input: { actorId?: string; source?: string } = {}) {
    // Allow orders.service to create the Order record before lifecycle items are loaded
    if (this.onCheckoutInvoicePaidHook) {
      await this.onCheckoutInvoicePaidHook(invoiceId).catch(() => undefined);
    }
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
    const tasks: Array<Promise<{ ok: boolean; pending?: boolean }>> = [];
    for (const item of items) {
      if (item.service && item.type !== "DOMAIN" && item.service.product?.type !== "DOMAIN") {
        tasks.push(this.processPaidService(invoice, item, input));
      }
      if (item.domainRecord) {
        tasks.push(this.processPaidDomain(invoice, item, input));
      }
    }
    const results = await Promise.all(tasks);

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

  async materializePaidCheckoutUser(invoiceId: string) {
    if (typeof (this.billing as unknown as { materializePaidCheckoutUser?: unknown }).materializePaidCheckoutUser !== "function") {
      return null;
    }
    return (this.billing as unknown as { materializePaidCheckoutUser: (invoiceId: string) => Promise<unknown> }).materializePaidCheckoutUser(invoiceId);
  }

  private async finalizePaidInvoice(invoiceId: string, input: { actorId?: string; source?: string } = {}, options: { processLifecycle?: boolean } = {}) {
    const invoice = await this.billing.findInvoice(invoiceId);
    if (!invoice) {
      throw new NotFoundException("Invoice not found");
    }
    // Idempotency guard: the gateway webhook AND the payment-return page both confirm the same
    // payment, and the cron can race with either. A PAID invoice has already run all of its side
    // effects (the "payment successful" email, the account-balance credit for funds deposits, and
    // order provisioning), so re-finalizing would send a duplicate confirmation email and
    // double-credit funds deposits. Return the already-paid invoice without repeating any of that.
    if (invoice.status === "PAID") {
      return invoice;
    }
    const snapshot = isRecord(invoice.orderSnapshot) ? invoice.orderSnapshot : {};
    const accountCreditCents = typeof snapshot.accountCreditCents === "number" ? snapshot.accountCreditCents : 0;
    if (accountCreditCents > 0) {
      const paid = await this.billing.finalizeFundsDepositInvoice(invoiceId);
      await this.billing.addUserBalance(paid.userId, accountCreditCents);
      void this.dispatchInvoiceEmail("payment_successful", paid).catch(() => undefined);
      return paid;
    }
    const paid = await this.billing.markInvoicePaid(invoiceId);
    const materializedUser = await this.materializePaidCheckoutUser(invoiceId);
    if (isRecord(materializedUser)) {
      void this.emails?.dispatch("welcome", {
        context: {
          customer_email: stringFrom(materializedUser.email),
          customer_name: stringFrom(materializedUser.name) ?? stringFrom(materializedUser.email)
        },
        user: {
          email: stringFrom(materializedUser.email),
          id: stringFrom(materializedUser.id),
          name: stringFrom(materializedUser.name) ?? stringFrom(materializedUser.email)
        }
      }).catch(() => undefined);
    }
    void this.dispatchInvoiceEmail("payment_successful", paid).catch(() => undefined);
    if (options.processLifecycle !== false) {
      await this.onInvoicePaid(invoiceId, { actorId: input.actorId, source: input.source ?? "system" });
    }
    return paid;
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
    const moduleName = effectiveServiceModule(service);
    const existing = await this.billing.findModuleLogByKey(idempotencyKey);
    if (existing) {
      return { ok: existing.status !== "FAILED", pending: existing.status !== "SUCCEEDED" && existing.status !== "FAILED" };
    }
    if (!moduleName) {
      await this.billing.createAuditLog({
        action: "service.manual_action_required",
        actorId: input.actorId,
        metadata: { action },
        subject: "service",
        subjectId: service.id
      });
      if (item.orderItem?.id ?? item.orderItemId) {
        await this.billing.setOrderItemLifecycleStatus(item.orderItem?.id ?? item.orderItemId, "SKIPPED", {
          errorMessage: "Manual provisioning required"
        });
      }
      return { ok: true, pending: true };
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
        await this.billing.setServiceLifecycleStatus(service.id, "PROVISIONING");
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
      // Persist any provisioning-time credentials (e.g. the Virtualmin password, which the panel
      // never returns again) so the hosting activation email can include them — even when the email
      // is sent later by the status cron rather than now.
      if (action === "create") {
        const creds = asRecord(asRecord((result as Record<string, unknown>).metadata).credentials);
        if (stringFrom(creds.password) || stringFrom(creds.controlPanelUrl) || stringFrom(creds.username)) {
          await this.billing.mergeServiceConfiguration(service.id, { hosting: creds }).catch(() => undefined);
        }
      }
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
        action: active ? (action === "unsuspend" ? "service.unsuspended" : action === "renew" ? "service.renewed" : "service.activated") : "service.provisioning_queued",
        actorId: input.actorId,
        metadata: { moduleName },
        subject: "service",
        subjectId: service.id
      });
      if (active && action === "create") {
        void this.notifyServiceActivated(service.id).catch(() => undefined);
      }
      return { ok: true, pending: !active };
    } catch (error) {
      const message = error instanceof Error ? error.message : "Service module failed";
      await this.billing.failModuleLog(log.id, message);
      await this.billing.setServiceLifecycleStatus(service.id, "PROVISIONING");
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
      await this.billing.createAuditLog({
        action: "domain.registrar_skipped",
        actorId: input.actorId,
        metadata: { action, reason: "manual_de_registration", registrar: domain.registrarModule ?? domain.registrarProvider ?? "resellbiz" },
        subject: "domain",
        subjectId: domain.id
      });
      await this.billing.setDomainLifecycleStatus(domain.id, "PENDING");
      if (item.service?.id ?? item.serviceId) {
        await this.billing.setServiceLifecycleStatus(item.service?.id ?? item.serviceId, "PENDING");
      }
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
    const moduleName = canonicalModule(domain.registrarModule ?? domain.registrarProvider) ?? "resellbiz";
    await this.billing.createAuditLog({
      action: "domain.registrar_started",
      actorId: input.actorId,
      metadata: { action, domain: domain.domain, registrar: moduleName },
      subject: "domain",
      subjectId: domain.id
    });
    const log = await this.billing.createModuleLog({
      action,
      actorId: input.actorId,
      domainRecordId: domain.id,
      idempotencyKey,
      invoiceId: invoice.id,
      moduleName,
      orderId: invoice.order?.id,
      orderItemId: item.orderItem?.id ?? item.orderItemId,
      request
    });

    try {
      const result = await this.runDomainModule(moduleName, action, request);
      if (result.status === "FAILED") {
        await this.billing.failModuleLog(log.id, "Registrar module returned FAILED", result as Record<string, unknown>);
        await this.billing.setDomainLifecycleStatus(domain.id, "PENDING", { externalId: result.externalId });
        if (item.service?.id ?? item.serviceId) {
          await this.billing.setServiceLifecycleStatus(item.service?.id ?? item.serviceId, "PROVISIONING", { externalId: result.externalId });
        }
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
      if (item.service?.id ?? item.serviceId) {
        await this.billing.setServiceLifecycleStatus(item.service?.id ?? item.serviceId, active ? "ACTIVE" : "PROVISIONING", {
          externalId: result.externalId,
          moduleReference: result.externalId,
          renewsAt: nextDomainExpiry(domain)
        });
      }
      if (item.orderItem?.id ?? item.orderItemId) {
        await this.billing.setOrderItemLifecycleStatus(item.orderItem?.id ?? item.orderItemId, active ? "ACTIVE" : "PROVISIONING", {
          providerReference: result.externalId
        });
      }
      await this.billing.createAuditLog({
        action: action === "renew_domain" ? "domain.renewed" : action === "transfer_domain" ? "domain.transfer_started" : "domain.registered",
        actorId: input.actorId,
        metadata: { externalId: result.externalId, registrar: moduleName },
        subject: "domain",
        subjectId: domain.id
      });
      if (active) {
        void this.notifyDomainActivated(domain.id).catch(() => undefined);
      }
      return { ok: true, pending: !active };
    } catch (error) {
      const message = error instanceof Error ? error.message : "Registrar module failed";
      await this.billing.failModuleLog(log.id, message);
      await this.billing.setDomainLifecycleStatus(domain.id, "PENDING");
      if (item.service?.id ?? item.serviceId) {
        await this.billing.setServiceLifecycleStatus(item.service?.id ?? item.serviceId, "PROVISIONING");
      }
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
      return { externalId: service.externalId ?? service.id, metadata: { reason: "External provider module is not configured." }, status: "QUEUED" as const };
    }
    // A disabled hosting module means automation is off — the service is left QUEUED for the admin to
    // provision/manage manually. (Unknown modules with no registry entry default to active.)
    const moduleEnabled = this.modules ? await this.modules.moduleActive(moduleName) : true;
    if (action === "unsuspend") {
      // Paying an overdue invoice re-enables the account billing maintenance disabled. Provider-generic:
      // Virtualmin re-enables the panel account, Tecreator reactivates the suspended tenant, others no-op.
      if (moduleEnabled && service.externalId) {
        const provider = this.external.hostingProvider(moduleName, service.product?.type);
        await provider.enable?.(service.externalId).catch(() => undefined);
      }
      return { externalId: service.externalId ?? service.id, metadata: { action }, status: "ACTIVE" as const };
    }
    if (action === "renew") {
      return { externalId: service.externalId ?? service.id, metadata: { action }, status: "ACTIVE" as const };
    }
    if (!moduleEnabled) {
      return {
        externalId: service.externalId ?? service.id,
        metadata: { moduleName, reason: `The ${moduleName} module is disabled — provision this service manually.` },
        status: "QUEUED" as const
      };
    }
    if (moduleName === "hetzner" || ["VPS", "DEDICATED_SERVER"].includes(service.product?.type)) {
      return this.external.hetzner.provision(request as never);
    }
    return this.external.virtualmin.provision(request as never);
  }

  private async runDomainModule(moduleName: string, action: string, request: Record<string, any>) {
    if (!this.external) {
      return { externalId: request.domain, metadata: { bypassed: true }, status: "ACTIVE" as const };
    }
    if (moduleName !== "resellbiz") {
      return { externalId: request.domain, metadata: { moduleName, reason: "Domain module is not configured." }, status: "QUEUED" as const };
    }
    // A disabled registrar module means the admin registers domains manually — leave it QUEUED.
    if (this.modules && !(await this.modules.moduleActive("resellbiz"))) {
      return {
        externalId: request.domain,
        metadata: { moduleName, reason: "The resell.biz module is disabled — register this domain manually." },
        status: "QUEUED" as const
      };
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

    // Renewals bill the captured order price (Service.recurringAmountCents), not the product list price.
    // Domain products carry a 0 list price (every TLD/term is priced live from resell.biz at checkout),
    // so renewing off productPrice would generate €0 domain invoices. Fall back to the list price only
    // for legacy services created before the order price was captured.
    const serviceRecurringCents = Number((subscription.service as { recurringAmountCents?: number } | null)?.recurringAmountCents ?? 0);
    const renewalUnitAmountCents = serviceRecurringCents > 0 ? serviceRecurringCents : subscription.productPrice.amountCents;

    const invoice = await this.createInvoice({
      userId: subscription.userId,
      dueAt: subscription.nextInvoiceAt.toISOString(),
      status: "PENDING",
      buyerCountryCode: subscription.user.countryCode,
      buyerVatId: subscription.user.vatId ?? undefined,
      isBusinessCustomer: subscription.user.customerType === "BUSINESS",
      couponCode: subscription.coupon?.code,
      lines: [
        {
          description: `${(subscription.service.product as { name?: string } | null)?.name ?? (subscription.service.productSnapshot as { name?: string } | null)?.name ?? "Service"} renewal`,
          billingCycle: subscription.billingCycle,
          lifecycleAction: "renew",
          quantity: 1,
          type: "SERVICE_RENEWAL",
          unitAmountCents: renewalUnitAmountCents,
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
    const [invoiceDaysAhead, ticketCloseHours, logRetentionDays] = await Promise.all([
      this.billing.settingNumber("invoiceDaysAhead", 7),
      this.billing.settingNumber("ticketAutoCloseHours", 24),
      this.billing.settingNumber("logRetentionDays", 0)
    ]);
    const dueSubscriptions = await this.billing.dueSubscriptions(invoiceDaysAhead, now);
    const generatedInvoiceList: { id: string; invoiceNumber: string; subscriptionId: string; totalCents: number }[] = [];

    for (const subscription of dueSubscriptions) {
      const latest = subscription.invoices[0];
      if (latest && latest.dueAt >= subscription.nextInvoiceAt) {
        continue;
      }

      const inv = await this.renewSubscription(subscription.id);
      generatedInvoiceList.push({
        id: inv.id,
        invoiceNumber: inv.invoiceNumber ?? inv.tempInvoiceNumber ?? inv.id,
        subscriptionId: subscription.id,
        totalCents: inv.totalCents
      });
    }

    const automaticPayments = await this.payInvoicesAutomatically(now);

    // Mark invoices OVERDUE as soon as they pass their due date (drives the "Overdue" badge).
    const overdueInvoices = await this.billing.overdueUnpaidInvoices(now);
    await Promise.all(overdueInvoices.map((invoice) => this.billing.markInvoiceOverdue(invoice.id)));

    // Suspension happens only once a FULL day has elapsed since the due date and the invoice is still
    // unpaid. It applies to every service type (hosting, VPS, …) with a past-due invoice. Virtualmin
    // accounts are additionally DISABLED on the panel (never deleted/terminated — that is manual).
    const suspendCutoff = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    const invoicesPastGrace = await this.billing.overdueUnpaidInvoices(suspendCutoff);
    const suspendServiceIds = [...new Set(invoicesPastGrace.flatMap((invoice) =>
      invoice.items.map((item) => item.serviceId).filter((serviceId): serviceId is string => Boolean(serviceId))
    ))];
    const servicesToSuspend = await this.billing.activeServicesByIds(suspendServiceIds);
    for (const service of servicesToSuspend) {
      // Provider-generic suspension: Virtualmin disables the panel account, Tecreator suspends the whole
      // tenant (the license), providers without a `disable` hook are skipped. Never deletes/terminates.
      if (service.externalId) {
        const provider = this.external?.hostingProvider(effectiveServiceModule(service), service.product?.type);
        await provider?.disable?.(service.externalId).catch(() => undefined);
      }
    }
    const suspended = await this.billing.suspendServices(suspendServiceIds);
    for (const service of servicesToSuspend) {
      if (service.product?.type === "SHARED_HOSTING") {
        void this.dispatchServiceEmail("hosting_account_suspended", service).catch(() => undefined);
      }
    }

    // Log retention: when the admin has set a positive "keep logs for N days", delete audit and
    // module logs older than that so the tables don't grow without bound. 0 (the default) disables
    // pruning and keeps everything.
    let prunedLogs: { auditLogs: number; moduleLogs: number } | undefined;
    if (logRetentionDays > 0) {
      const cutoff = new Date(now.getTime() - logRetentionDays * 24 * 60 * 60 * 1000);
      prunedLogs = await this.billing.pruneLogsOlderThan(cutoff);
    }

    return {
      automaticPayments,
      generatedInvoices: generatedInvoiceList.length,
      generatedInvoiceList,
      invoiceDaysAhead,
      logRetentionDays,
      prunedLogs,
      overdueInvoices: overdueInvoices.length,
      overdueInvoiceList: overdueInvoices.map((inv) => ({
        id: inv.id,
        invoiceNumber: inv.invoiceNumber ?? inv.tempInvoiceNumber ?? inv.id,
        totalCents: inv.totalCents,
        userId: inv.userId
      })),
      suspendedServices: suspended.count,
      suspendedServiceList: servicesToSuspend.map((s) => ({ id: s.id, domain: (s as Record<string, unknown>).domain ?? null })),
      ticketCloseHours
    };
  }

  async sendInvoiceReminders(now = new Date(), daysBeforeDue = 3) {
    const reminderInvoices = await this.billing.reminderInvoices(daysBeforeDue, now);
    for (const invoice of reminderInvoices) {
      await this.dispatchInvoiceEmail("invoice_reminder", invoice);
    }
    return {
      invoiceReminders: reminderInvoices.length,
      reminderList: reminderInvoices.map((inv) => ({
        id: inv.id,
        invoiceNumber: inv.invoiceNumber ?? inv.tempInvoiceNumber ?? inv.id,
        dueAt: inv.dueAt,
        totalCents: inv.totalCents
      }))
    };
  }

  private async payInvoicesFromAccountBalance() {
    const invoices = await this.billing.balancePayableInvoices();
    let paid = 0;

    for (const invoice of invoices) {
      const snapshot = isRecord(invoice.orderSnapshot) ? invoice.orderSnapshot : {};
      if (typeof snapshot.accountCreditCents === "number" && snapshot.accountCreditCents > 0) {
        continue;
      }
      if ((invoice.user?.balanceCents ?? 0) < invoice.totalCents) {
        continue;
      }

      const debit = await this.billing.debitUserBalance(invoice.userId, invoice.totalCents);
      if (debit.count !== 1) {
        continue;
      }

      await this.billing.createTransaction({
        amountCents: invoice.totalCents,
        currency: invoice.currency,
        invoiceId: invoice.id,
        method: "ACCOUNT_BALANCE",
        providerReference: `account_balance_${invoice.id}_${Date.now()}`,
        raw: { source: "account_balance" },
        status: "SUCCEEDED"
      });
      await this.finalizePaidInvoice(invoice.id, { source: "account_balance" });
      paid += 1;
    }

    return paid;
  }

  private async payInvoicesAutomatically(now = new Date()) {
    const invoices = await this.billing.automaticPayableInvoices(now);
    const paidInvoices: { id: string; invoiceNumber: string; method: string; totalCents: number }[] = [];
    const pendingInvoices: { id: string; invoiceNumber: string; method: string; totalCents: number }[] = [];
    const failedInvoices: { id: string; invoiceNumber: string; method: string; totalCents: number }[] = [];

    for (const invoice of invoices) {
      const snapshot = isRecord(invoice.orderSnapshot) ? invoice.orderSnapshot : {};
      if (typeof snapshot.accountCreditCents === "number" && snapshot.accountCreditCents > 0) {
        continue;
      }
      if (invoice.transactions.some((transaction) => transaction.status === "PENDING" && transaction.method !== "ACCOUNT_BALANCE")) {
        continue;
      }

      const balanceCents = Math.min(invoice.user?.balanceCents ?? 0, invoice.totalCents);
      if (balanceCents >= invoice.totalCents) {
        const debit = await this.billing.debitUserBalance(invoice.userId, invoice.totalCents);
        if (debit.count !== 1) {
          continue;
        }
        await this.billing.createTransaction({
          amountCents: invoice.totalCents,
          currency: invoice.currency,
          invoiceId: invoice.id,
          method: "ACCOUNT_BALANCE",
          providerReference: `account_balance_${invoice.id}_${Date.now()}`,
          raw: { source: "account_balance" },
          status: "SUCCEEDED"
        });
        await this.finalizePaidInvoice(invoice.id, { source: "account_balance" });
        paidInvoices.push({ id: invoice.id, invoiceNumber: invoice.invoiceNumber, method: "ACCOUNT_BALANCE", totalCents: invoice.totalCents });
        continue;
      }

      const paymentMethod = invoice.user?.paymentMethods[0];
      if (!paymentMethod) {
        continue;
      }

      const externalAmountCents = invoice.totalCents - balanceCents;
      const result = await this.payments.chargeSavedPayment({
        amountCents: externalAmountCents,
        currency: invoice.currency,
        customerId: paymentMethod.providerCustomerId,
        description: `Invoice ${invoice.invoiceNumber}`,
        invoiceId: invoice.id,
        mandateId: paymentMethod.mandateId ?? paymentMethod.providerToken,
        method: paymentMethod.type,
        webhookUrl: gatewayWebhookUrl(String(paymentMethod.type))
      });
      const raw = { ...(result.raw ?? {}), automaticPayment: true, balanceCents, paymentMethodId: paymentMethod.id };
      await this.billing.createTransaction({
        amountCents: externalAmountCents,
        currency: invoice.currency,
        invoiceId: invoice.id,
        method: paymentMethod.type,
        providerReference: result.providerReference,
        raw,
        status: result.status
      });
      const invoiceEntry = { id: invoice.id, invoiceNumber: invoice.invoiceNumber, method: String(paymentMethod.type), totalCents: invoice.totalCents };
      if (result.status === "SUCCEEDED") {
        await this.applyAutomaticBalanceDebit({ ...invoice, transactions: [{ raw }] }, { raw });
        await this.finalizePaidInvoice(invoice.id, { source: "automatic_payment" });
        paidInvoices.push(invoiceEntry);
      } else if (result.status === "PENDING") {
        await this.billing.updateInvoiceStatus(invoice.id, "PENDING");
        pendingInvoices.push(invoiceEntry);
      } else {
        await this.billing.updateInvoiceStatus(invoice.id, "FAILED");
        failedInvoices.push(invoiceEntry);
      }
    }

    return {
      failed: failedInvoices.length,
      failedInvoices,
      paid: paidInvoices.length,
      paidInvoices,
      pending: pendingInvoices.length,
      pendingInvoices
    };
  }

  async handlePaymentWebhook(method: string, body: Record<string, unknown>) {
    const providerReference = typeof body.id === "string" ? body.id : typeof body.resource === "string" ? body.resource : undefined;
    if (!providerReference) {
      return { ok: true, skipped: "missing_provider_reference" };
    }
    const transaction = await this.billing.findTransactionByProviderReference(providerReference);
    if (!transaction) {
      return { ok: true, skipped: "transaction_not_found" };
    }
    const result = await this.payments.get(transaction.method).confirm?.(providerReference);
    if (!result) {
      return { ok: true, skipped: "confirm_not_supported" };
    }
    const raw = { ...(isRecord(transaction.raw) ? transaction.raw : {}), provider: result.raw ?? {} };
    await this.billing.updateTransactionStatus(transaction.id, result.status, raw);
    if (result.status === "SUCCEEDED") {
      await this.applyAutomaticBalanceDebit(transaction.invoice, { ...transaction, raw });
      await this.finalizePaidInvoice(transaction.invoiceId, { source: `webhook:${method}` });
      return { ok: true, status: "PAID" };
    }
    if (result.status === "FAILED") {
      await this.billing.updateInvoiceStatus(transaction.invoiceId, "FAILED");
    }
    return { ok: true, status: result.status };
  }

  private async applyAutomaticBalanceDebit(invoice: Record<string, any>, transaction: Record<string, any>) {
    const raw = isRecord(transaction.raw) ? transaction.raw : {};
    const balanceCents = typeof raw.balanceCents === "number" ? raw.balanceCents : 0;
    if (balanceCents <= 0) {
      return;
    }
    const providerReference = `account_balance_${invoice.id}_${transaction.id ?? "automatic"}`;
    const existing = await this.billing.findTransactionByProviderReference(providerReference);
    if (existing) {
      return;
    }
    const debit = await this.billing.debitUserBalance(invoice.userId, balanceCents);
    if (debit.count !== 1) {
      throw new BadRequestException("Account balance is no longer available.");
    }
    await this.billing.createTransaction({
      amountCents: balanceCents,
      currency: invoice.currency,
      invoiceId: invoice.id,
      method: "ACCOUNT_BALANCE",
      providerReference,
      raw: { source: "automatic_payment_balance", transactionId: transaction.id },
      status: "SUCCEEDED"
    });
  }

  vatPercent() {
    return this.billing.settingNumber("vatPercent", 19);
  }

  // Per-country VAT config (the single source of truth for tax rates). Falls back to the legacy
  // flat `vatPercent` setting as the default country's rate so installs that never saved the new
  // table keep charging the same VAT.
  async taxCountryConfig(): Promise<TaxCountryConfig> {
    const stored = await this.billing.settingJson<{ default?: unknown; rates?: unknown } | null>("tax.countries", null);
    if (stored && stored.rates && typeof stored.rates === "object") {
      return sanitizeTaxCountryConfig(stored);
    }
    const legacy = await this.vatPercent();
    return sanitizeTaxCountryConfig({ enabled: true, default: "DE", rates: { DE: legacy } });
  }

  // Resolves the VAT a specific buyer pays (country rate + reverse-charge / export rules) using
  // the shared resolver. Used by the order preview and admin order creation.
  async vatForBuyer(context: { countryCode?: string | null; isBusinessCustomer?: boolean; vatId?: string | null }) {
    const config = await this.taxCountryConfig();
    const taxContext: TaxContext = {
      sellerCountryCode: "DE",
      buyerCountryCode: context.countryCode ?? "",
      buyerVatId: context.vatId ?? undefined,
      isBusinessCustomer: Boolean(context.isBusinessCustomer)
    };
    return resolveVat(taxContext, config);
  }

  siteUrl() {
    return this.billing.settingString("siteUrl");
  }

  // DeepSeek API key (DB-stored) — reused by the Customizer's per-field auto-translate.
  deepseekApiKey() {
    return this.billing.settingString("deepseekApiKey");
  }

  // Configured languages (main + others). Defaults to German main / English secondary.
  async i18nLanguages(): Promise<StoredLanguages> {
    const stored = await this.billing.settingJson<Partial<StoredLanguages> | null>("i18n.languages", null);
    if (!stored || typeof stored.main !== "string" || !stored.main) {
      return { main: "de", others: ["en"] };
    }
    return sanitizeLanguages(stored);
  }

  // Configured currencies + rates. Falls back to the legacy usdExchangeRate/usdBufferCents
  // settings (migrated into a USD entry) when currency.config has never been saved.
  async currencyConfig(): Promise<StoredCurrencyConfig> {
    const stored = await this.billing.settingJson<Partial<StoredCurrencyConfig> | null>("currency.config", null);
    if (stored && typeof stored.main === "string" && stored.main) {
      return sanitizeCurrencyConfig(stored);
    }
    const [rate, buffer] = await Promise.all([
      this.billing.settingNumber("usdExchangeRate", 1.0),
      this.billing.settingNumber("usdBufferCents", 0)
    ]);
    return { main: "EUR", others: ["USD"], rates: { USD: { rate, buffer, bufferEnabled: buffer > 0 } } };
  }

  // The configured main/base currency stamped on new invoices/orders.
  async mainCurrency(): Promise<string> {
    return (await this.currencyConfig()).main;
  }

  async publicSettings() {
    const [
      siteLogoUrl, faviconUrl, founderPhotoUrl, siteUrl, termsUrl, usdExchangeRate, usdBufferCents,
      siteName, metaDescription, blogMetaDescription, ogTitleSuffix, ogImageStatic, ogImageDashboard, ogImageBlog,
      themeBlueHomeHeroImageUrl, themeBlueWebhostingHeroImageUrl, themeBlueDomainsHeroImageUrl,
      themeBlueItSolutionsHeroImageUrl, themeBlueContactHeroImageUrl, themeBlueAboutHeroImageUrl,
      themeBlueVirtualServersHeroImageUrl, themeBlueWebdesignHeroImageUrl,
      themeBlueeBlogHeroImageUrl, themeBlueKnowledgebaseHeroImageUrl
    ] = await Promise.all([
      this.billing.settingString("siteLogoUrl"),
      this.billing.settingString("faviconUrl"),
      this.billing.settingString("founderPhotoUrl"),
      this.billing.settingString("siteUrl"),
      this.billing.settingString("termsUrl"),
      this.billing.settingNumber("usdExchangeRate", 1.0),
      this.billing.settingNumber("usdBufferCents", 0),
      this.billing.settingString("seo.siteName"),
      this.billing.settingString("seo.metaDescription"),
      this.billing.settingString("seo.blogMetaDescription"),
      this.billing.settingString("seo.ogTitleSuffix"),
      this.billing.settingString("seo.ogImageStatic"),
      this.billing.settingString("seo.ogImageDashboard"),
      this.billing.settingString("seo.ogImageBlog"),
      this.billing.settingString("theme.blue.homeHeroImageUrl"),
      this.billing.settingString("theme.blue.webhostingHeroImageUrl"),
      this.billing.settingString("theme.blue.domainsHeroImageUrl"),
      this.billing.settingString("theme.blue.itSolutionsHeroImageUrl"),
      this.billing.settingString("theme.blue.contactHeroImageUrl"),
      this.billing.settingString("theme.blue.aboutHeroImageUrl"),
      this.billing.settingString("theme.blue.virtualServersHeroImageUrl"),
      this.billing.settingString("theme.blue.webdesignHeroImageUrl"),
      this.billing.settingString("theme.blue.blogHeroImageUrl"),
      this.billing.settingString("theme.blue.knowledgebaseHeroImageUrl")
    ]);

    const [currencyConfig, languages, taxCountries] = await Promise.all([this.currencyConfig(), this.i18nLanguages(), this.taxCountryConfig()]);
    // Headline VAT (used where a single number is enough) is the default country's rate, or 0 when
    // VAT charging is switched off; the checkout uses `taxCountries` to compute the buyer-country
    // rate live.
    const defaultVatPercent = taxCountries.enabled ? vatPercentForCountry(taxCountries, taxCountries.default) : 0;

    return {
      blogMetaDescription, faviconUrl, founderPhotoUrl, metaDescription, ogImageBlog, ogImageDashboard,
      ogImageStatic, ogTitleSuffix, siteName, siteLogoUrl, siteUrl, termsUrl, usdExchangeRate, usdBufferCents,
      vatPercent: defaultVatPercent, taxCountries,
      currencyConfig, languages,
      themeBlueHomeHeroImageUrl, themeBlueWebhostingHeroImageUrl, themeBlueDomainsHeroImageUrl,
      themeBlueItSolutionsHeroImageUrl, themeBlueContactHeroImageUrl, themeBlueAboutHeroImageUrl,
      themeBlueVirtualServersHeroImageUrl, themeBlueWebdesignHeroImageUrl,
      themeBlueeBlogHeroImageUrl, themeBlueKnowledgebaseHeroImageUrl
    };
  }

  settings() {
    return this.settingsPayload(true);
  }

  cronSettings() {
    return this.settingsPayload(false);
  }

  cronLastRun(key: string) {
    return this.billing.settingString(`cron.last.${key}`).then((value) => {
      const date = value ? new Date(value) : undefined;
      return date && Number.isFinite(date.getTime()) ? date : undefined;
    });
  }

  markCronRun(key: string, date: Date) {
    return this.billing.upsertSettingString(`cron.last.${key}`, date.toISOString());
  }

  private async settingsPayload(maskSecrets: boolean) {
    const [
      invoiceDaysAhead,
      ticketAutoCloseHours,
      vatPercent,
      domainPriceUpdateHours,
      domainExpirationUpdateHours,
      domainStatusUpdateMinutes,
      hostingStatusUpdateMinutes,
      invoiceReminderDaysBeforeDue,
      mailboxCheckMinutes,
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
      invoiceBankDetails,
      siteLogoUrl,
      cronSecret,
      supportImapEnabled,
      supportImapHost,
      supportImapPort,
      supportImapSecure,
      supportImapUsername,
      supportImapPassword,
      supportImapMailbox,
      supportMailboxAddress,
      salesImapEnabled,
      salesImapHost,
      salesImapPort,
      salesImapSecure,
      salesImapUsername,
      salesImapPassword,
      salesImapMailbox,
      salesMailboxAddress,
      termsUrl,
      usdExchangeRate,
      usdBufferCents,
      adminTimezone
    ] = await Promise.all([
      this.billing.settingNumber("invoiceDaysAhead", 7),
      this.billing.settingNumber("ticketAutoCloseHours", 24),
      this.vatPercent(),
      this.billing.settingNumber("domainPriceUpdateHours", 24),
      this.billing.settingNumber("domainExpirationUpdateHours", 12),
      this.billing.settingNumber("domainStatusUpdateMinutes", 15),
      this.billing.settingNumber("hostingStatusUpdateMinutes", 15),
      this.billing.settingNumber("invoiceReminderDaysBeforeDue", 3),
      this.billing.settingNumber("mailboxCheckMinutes", 5),
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
      this.billing.settingString("invoiceBankDetails"),
      this.billing.settingString("siteLogoUrl"),
      this.billing.settingString("cronSecret"),
      this.billing.settingNumber("supportImapEnabled", 0),
      this.billing.settingString("supportImapHost"),
      this.billing.settingNumber("supportImapPort", 993),
      this.billing.settingNumber("supportImapSecure", 1),
      this.billing.settingString("supportImapUsername"),
      this.billing.settingString("supportImapPassword"),
      this.billing.settingString("supportImapMailbox", "INBOX"),
      this.billing.settingString("supportMailboxAddress", "support@dezhost.com"),
      this.billing.settingNumber("salesImapEnabled", 0),
      this.billing.settingString("salesImapHost"),
      this.billing.settingNumber("salesImapPort", 993),
      this.billing.settingNumber("salesImapSecure", 1),
      this.billing.settingString("salesImapUsername"),
      this.billing.settingString("salesImapPassword"),
      this.billing.settingString("salesImapMailbox", "INBOX"),
      this.billing.settingString("salesMailboxAddress", "sales@dezhost.com"),
      this.billing.settingString("termsUrl"),
      this.billing.settingNumber("usdExchangeRate", 1.0),
      this.billing.settingNumber("usdBufferCents", 0),
      this.billing.settingString("adminTimezone", "UTC")
    ]);

    const [founderPhotoUrl, siteUrl, deepseekApiKey, aiBlogEnabled, aiBlogArticlesPerDay, aiBlogIntervalHours, aiBlogWordCount, aiBlogLanguage, aiBlogTopicsPool, aiBlogTitlePrompt, aiBlogContentPrompt, aiBlogExcerptPrompt, aiBlogTagsPrompt, aiBlogKeywordsPrompt, logRetentionDays] = await Promise.all([
      this.billing.settingString("founderPhotoUrl"),
      this.billing.settingString("siteUrl"),
      this.billing.settingString("deepseekApiKey"),
      this.billing.settingString("aiBlogEnabled", "false"),
      this.billing.settingNumber("aiBlogArticlesPerDay", 3),
      this.billing.settingNumber("aiBlogIntervalHours", 8),
      this.billing.settingNumber("aiBlogWordCount", 800),
      this.billing.settingString("aiBlogLanguage", "de"),
      this.billing.settingString("aiBlogTopicsPool"),
      this.billing.settingString("aiBlogTitlePrompt"),
      this.billing.settingString("aiBlogContentPrompt"),
      this.billing.settingString("aiBlogExcerptPrompt"),
      this.billing.settingString("aiBlogTagsPrompt"),
      this.billing.settingString("aiBlogKeywordsPrompt"),
      this.billing.settingNumber("logRetentionDays", 0)
    ]);

    const [currencyConfig, languages, taxCountries] = await Promise.all([this.currencyConfig(), this.i18nLanguages(), this.taxCountryConfig()]);

    return {
      adminTimezone,
      currencyConfig,
      languages,
      taxCountries,
      logRetentionDays,
      cronSecret: maskSecrets && cronSecret ? "********" : cronSecret,
      deepseekApiKey: maskSecrets && deepseekApiKey ? "********" : deepseekApiKey,
      aiBlogEnabled: aiBlogEnabled === "true",
      aiBlogArticlesPerDay,
      aiBlogIntervalHours,
      aiBlogWordCount,
      aiBlogLanguage,
      aiBlogTopicsPool,
      aiBlogTitlePrompt,
      aiBlogContentPrompt,
      aiBlogExcerptPrompt,
      aiBlogTagsPrompt,
      aiBlogKeywordsPrompt,
      domainExpirationUpdateHours,
      domainPriceUpdateHours,
      domainStatusUpdateMinutes,
      hostingStatusUpdateMinutes,
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
      invoiceReminderDaysBeforeDue,
      invoiceVatNumber,
      mailboxCheckMinutes,
      salesImapEnabled: Boolean(salesImapEnabled),
      salesImapHost,
      salesImapMailbox,
      salesImapPassword: maskSecrets && salesImapPassword ? "********" : salesImapPassword,
      salesImapPort,
      salesImapSecure: Boolean(salesImapSecure),
      salesImapUsername,
      salesMailboxAddress,
      founderPhotoUrl,
      siteLogoUrl,
      siteUrl,
      supportImapEnabled: Boolean(supportImapEnabled),
      supportImapHost,
      supportImapMailbox,
      supportImapPassword: maskSecrets && supportImapPassword ? "********" : supportImapPassword,
      supportImapPort,
      supportImapSecure: Boolean(supportImapSecure),
      supportImapUsername,
      supportMailboxAddress,
      ticketAutoCloseHours,
      termsUrl,
      usdExchangeRate,
      usdBufferCents,
      vatPercent
    };
  }

  async storefrontPaymentGateways() {
    const [gateways, sandboxEnabled, bankWireEnabled, bankWireIban, bankWireBic, bankWireBankName, bankWireHolder, bankWireRef] = await Promise.all([
      this.billing.listPaymentGateways(),
      this.billing.settingNumber("sandboxGatewayEnabled", 1),
      this.billing.settingNumber("bankTransfer.enabled", 0),
      this.billing.settingString("bankTransfer.iban"),
      this.billing.settingString("bankTransfer.bic"),
      this.billing.settingString("bankTransfer.bankName"),
      this.billing.settingString("bankTransfer.accountHolder"),
      this.billing.settingString("bankTransfer.referenceNote")
    ]);
    const enabled = gateways.filter((gateway) => gateway.enabled);
    const source = gateways.length ? enabled : defaultPaymentGateways().filter((gateway) => gateway.method !== "SANDBOX");
    const withSandbox = sandboxEnabled ? [sandboxGateway(), ...source] : source;

    const result: Array<{ config?: Record<string, string | undefined> | undefined; method: string; title: string }> = withSandbox.map((gateway) => {
      const cfg = gateway.config && isRecord(gateway.config) ? gateway.config : {};
      const publicConfig: Record<string, string> = {};
      if (gateway.method === "PAYPAL" && typeof cfg.clientId === "string" && cfg.clientId) {
        publicConfig.clientId = cfg.clientId;
        publicConfig.mode = typeof cfg.mode === "string" ? cfg.mode : "test";
      }
      return {
        config: Object.keys(publicConfig).length ? publicConfig : undefined,
        method: String(gateway.method),
        title: gatewayTitle(String(gateway.method))
      };
    });

    if (bankWireEnabled) {
      result.push({
        config: {
          accountHolder: bankWireHolder,
          bankName: bankWireBankName,
          bic: bankWireBic,
          iban: bankWireIban,
          referenceNote: bankWireRef
        },
        method: "BANK_TRANSFER",
        title: "Bank Wire Transfer"
      });
    }
    return result;
  }

  async adminPaymentGateways() {
    const [gateways, sandboxEnabled, bankWireEnabled, bankWireIban, bankWireBic, bankWireBankName, bankWireHolder, bankWireRef, bankWireDisplayName] = await Promise.all([
      this.billing.listPaymentGateways(),
      this.billing.settingNumber("sandboxGatewayEnabled", 1),
      this.billing.settingNumber("bankTransfer.enabled", 0),
      this.billing.settingString("bankTransfer.iban"),
      this.billing.settingString("bankTransfer.bic"),
      this.billing.settingString("bankTransfer.bankName"),
      this.billing.settingString("bankTransfer.accountHolder"),
      this.billing.settingString("bankTransfer.referenceNote"),
      this.billing.settingString("bankTransfer.displayName")
    ]);
    const byMethod = new Map(gateways.map((gateway) => [gateway.method, gateway]));
    const result: Array<{ config: Record<string, unknown>; enabled: boolean; method: string }> = defaultPaymentGateways().map((gateway) => {
      if (gateway.method === "SANDBOX") {
        return { config: {}, enabled: Boolean(sandboxEnabled), method: "SANDBOX" };
      }
      const stored = byMethod.get(gateway.method);
      return stored
        ? { config: isRecord(stored.config) ? stored.config : {}, enabled: stored.enabled, method: stored.method }
        : gateway;
    });
    result.push({
      config: {
        accountHolder: bankWireHolder,
        bankName: bankWireBankName,
        bic: bankWireBic,
        displayName: bankWireDisplayName,
        iban: bankWireIban,
        referenceNote: bankWireRef
      },
      enabled: Boolean(bankWireEnabled),
      method: "BANK_TRANSFER"
    });
    return result;
  }

  async updatePaymentGateways(input: Array<{ config?: Record<string, unknown>; enabled?: boolean; method: string }>) {
    const results = [];
    for (const gateway of input) {
      if (gateway.method === "SANDBOX") {
        await this.billing.upsertSettingNumber("sandboxGatewayEnabled", gateway.enabled ? 1 : 0);
        results.push({ config: {}, enabled: Boolean(gateway.enabled), method: "SANDBOX", validation: { ok: true, message: "Sandbox gateway saved." } });
        continue;
      }
      if (gateway.method === "BANK_TRANSFER") {
        const cfg = gateway.config ?? {};
        await Promise.all([
          this.billing.upsertSettingNumber("bankTransfer.enabled", gateway.enabled ? 1 : 0),
          this.billing.upsertSettingString("bankTransfer.iban", String(cfg.iban ?? "")),
          this.billing.upsertSettingString("bankTransfer.bic", String(cfg.bic ?? "")),
          this.billing.upsertSettingString("bankTransfer.bankName", String(cfg.bankName ?? "")),
          this.billing.upsertSettingString("bankTransfer.accountHolder", String(cfg.accountHolder ?? "")),
          this.billing.upsertSettingString("bankTransfer.referenceNote", String(cfg.referenceNote ?? "")),
          this.billing.upsertSettingString("bankTransfer.displayName", String(cfg.displayName ?? ""))
        ]);
        results.push({ config: cfg, enabled: Boolean(gateway.enabled), method: "BANK_TRANSFER", validation: { ok: true, message: "Bank wire settings saved." } });
        continue;
      }
      const validation = await this.payments.validateConfig({
        config: gateway.config ?? {},
        enabled: Boolean(gateway.enabled),
        method: gateway.method
      });
      const saved = await this.billing.upsertPaymentGateway({
        config: { ...(gateway.config ?? {}), verifiedAt: Boolean(gateway.enabled) ? new Date().toISOString() : undefined },
        enabled: Boolean(gateway.enabled),
        method: gateway.method
      });
      results.push({ ...saved, validation });
    }
    return results;
  }

  updateSettings(input: {
    adminTimezone?: string;
    cronSecret?: string;
    domainExpirationUpdateHours?: number;
    domainPriceUpdateHours?: number;
    domainStatusUpdateMinutes?: number;
    hostingStatusUpdateMinutes?: number;
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
    invoiceReminderDaysBeforeDue?: number;
    invoiceVatNumber?: string;
    mailboxCheckMinutes?: number;
    salesImapEnabled?: boolean;
    salesImapHost?: string;
    salesImapMailbox?: string;
    salesImapPassword?: string;
    salesImapPort?: number;
    salesImapSecure?: boolean;
    salesImapUsername?: string;
    salesMailboxAddress?: string;
    founderPhotoUrl?: string;
    siteLogoUrl?: string;
    siteUrl?: string;
    supportImapEnabled?: boolean;
    supportImapHost?: string;
    supportImapMailbox?: string;
    supportImapPassword?: string;
    supportImapPort?: number;
    supportImapSecure?: boolean;
    supportImapUsername?: string;
    supportMailboxAddress?: string;
    ticketAutoCloseHours?: number;
    termsUrl?: string;
    usdExchangeRate?: number;
    usdBufferCents?: number;
    vatPercent?: number;
    deepseekApiKey?: string;
    aiBlogEnabled?: boolean;
    aiBlogArticlesPerDay?: number;
    aiBlogIntervalHours?: number;
    aiBlogWordCount?: number;
    aiBlogLanguage?: string;
    aiBlogTopicsPool?: string;
    aiBlogTitlePrompt?: string;
    aiBlogContentPrompt?: string;
    aiBlogExcerptPrompt?: string;
    aiBlogTagsPrompt?: string;
    aiBlogKeywordsPrompt?: string;
    logRetentionDays?: number;
    languages?: { main?: string; others?: string[] };
    currencyConfig?: { main?: string; others?: string[]; rates?: Record<string, { rate?: number; buffer?: number; bufferEnabled?: boolean }> };
    taxCountries?: { enabled?: boolean; default?: string; rates?: Record<string, number> };
  }) {
    return Promise.all([
      input.languages === undefined ? undefined : this.billing.upsertSettingJson("i18n.languages", sanitizeLanguages(input.languages)),
      input.currencyConfig === undefined ? undefined : this.billing.upsertSettingJson("currency.config", sanitizeCurrencyConfig(input.currencyConfig)),
      input.taxCountries === undefined ? undefined : this.billing.upsertSettingJson("tax.countries", sanitizeTaxCountryConfig(input.taxCountries)),
      input.logRetentionDays === undefined
        ? undefined
        : this.billing.upsertSettingNumber("logRetentionDays", Math.max(0, Math.trunc(input.logRetentionDays))),
      input.cronSecret === undefined || input.cronSecret === "********"
        ? undefined
        : this.billing.upsertSettingString("cronSecret", input.cronSecret),
      input.domainPriceUpdateHours === undefined
        ? undefined
        : this.billing.upsertSettingNumber("domainPriceUpdateHours", positiveSetting(input.domainPriceUpdateHours, 24)),
      input.domainExpirationUpdateHours === undefined
        ? undefined
        : this.billing.upsertSettingNumber("domainExpirationUpdateHours", positiveSetting(input.domainExpirationUpdateHours, 12)),
      input.domainStatusUpdateMinutes === undefined
        ? undefined
        : this.billing.upsertSettingNumber("domainStatusUpdateMinutes", positiveSetting(input.domainStatusUpdateMinutes, 15)),
      input.hostingStatusUpdateMinutes === undefined
        ? undefined
        : this.billing.upsertSettingNumber("hostingStatusUpdateMinutes", positiveSetting(input.hostingStatusUpdateMinutes, 15)),
      input.invoiceReminderDaysBeforeDue === undefined
        ? undefined
        : this.billing.upsertSettingNumber("invoiceReminderDaysBeforeDue", positiveSetting(input.invoiceReminderDaysBeforeDue, 3)),
      input.mailboxCheckMinutes === undefined
        ? undefined
        : this.billing.upsertSettingNumber("mailboxCheckMinutes", positiveSetting(input.mailboxCheckMinutes, 5)),
      input.invoiceDaysAhead === undefined
        ? undefined
        : this.billing.upsertSettingNumber("invoiceDaysAhead", positiveSetting(input.invoiceDaysAhead, 7)),
      input.ticketAutoCloseHours === undefined
        ? undefined
        : this.billing.upsertSettingNumber("ticketAutoCloseHours", positiveSetting(input.ticketAutoCloseHours, 24)),
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
      input.invoiceBankDetails === undefined ? undefined : this.billing.upsertSettingString("invoiceBankDetails", input.invoiceBankDetails),
      input.founderPhotoUrl === undefined ? undefined : this.billing.upsertSettingString("founderPhotoUrl", input.founderPhotoUrl),
      input.siteLogoUrl === undefined ? undefined : this.billing.upsertSettingString("siteLogoUrl", input.siteLogoUrl),
      input.siteUrl === undefined ? undefined : this.billing.upsertSettingString("siteUrl", input.siteUrl),
      input.termsUrl === undefined ? undefined : this.billing.upsertSettingString("termsUrl", input.termsUrl),
      input.supportImapEnabled === undefined
        ? undefined
        : this.billing.upsertSettingNumber("supportImapEnabled", input.supportImapEnabled ? 1 : 0),
      input.supportImapHost === undefined ? undefined : this.billing.upsertSettingString("supportImapHost", input.supportImapHost),
      input.supportImapPort === undefined
        ? undefined
        : this.billing.upsertSettingNumber("supportImapPort", positiveSetting(input.supportImapPort, 993)),
      input.supportImapSecure === undefined
        ? undefined
        : this.billing.upsertSettingNumber("supportImapSecure", input.supportImapSecure ? 1 : 0),
      input.supportImapUsername === undefined
        ? undefined
        : this.billing.upsertSettingString("supportImapUsername", input.supportImapUsername),
      input.supportImapPassword === undefined || input.supportImapPassword === "********"
        ? undefined
        : this.billing.upsertSettingString("supportImapPassword", input.supportImapPassword),
      input.supportImapMailbox === undefined
        ? undefined
        : this.billing.upsertSettingString("supportImapMailbox", input.supportImapMailbox || "INBOX"),
      input.supportMailboxAddress === undefined
        ? undefined
        : this.billing.upsertSettingString("supportMailboxAddress", input.supportMailboxAddress || "support@dezhost.com"),
      input.salesImapEnabled === undefined
        ? undefined
        : this.billing.upsertSettingNumber("salesImapEnabled", input.salesImapEnabled ? 1 : 0),
      input.salesImapHost === undefined ? undefined : this.billing.upsertSettingString("salesImapHost", input.salesImapHost),
      input.salesImapPort === undefined
        ? undefined
        : this.billing.upsertSettingNumber("salesImapPort", positiveSetting(input.salesImapPort, 993)),
      input.salesImapSecure === undefined
        ? undefined
        : this.billing.upsertSettingNumber("salesImapSecure", input.salesImapSecure ? 1 : 0),
      input.salesImapUsername === undefined
        ? undefined
        : this.billing.upsertSettingString("salesImapUsername", input.salesImapUsername),
      input.salesImapPassword === undefined || input.salesImapPassword === "********"
        ? undefined
        : this.billing.upsertSettingString("salesImapPassword", input.salesImapPassword),
      input.salesImapMailbox === undefined
        ? undefined
        : this.billing.upsertSettingString("salesImapMailbox", input.salesImapMailbox || "INBOX"),
      input.salesMailboxAddress === undefined
        ? undefined
        : this.billing.upsertSettingString("salesMailboxAddress", input.salesMailboxAddress || "sales@dezhost.com"),
      input.usdExchangeRate === undefined
        ? undefined
        : this.billing.upsertSettingNumber("usdExchangeRate", Math.max(0.0001, input.usdExchangeRate)),
      input.usdBufferCents === undefined
        ? undefined
        : this.billing.upsertSettingNumber("usdBufferCents", Math.max(0, Math.round(input.usdBufferCents))),
      input.adminTimezone === undefined
        ? undefined
        : this.billing.upsertSettingString("adminTimezone", input.adminTimezone),
      input.deepseekApiKey === undefined || input.deepseekApiKey === "********"
        ? undefined
        : this.billing.upsertSettingString("deepseekApiKey", input.deepseekApiKey),
      input.aiBlogEnabled === undefined
        ? undefined
        : this.billing.upsertSettingString("aiBlogEnabled", input.aiBlogEnabled ? "true" : "false"),
      input.aiBlogArticlesPerDay === undefined
        ? undefined
        : this.billing.upsertSettingNumber("aiBlogArticlesPerDay", Math.max(1, Math.min(24, input.aiBlogArticlesPerDay))),
      input.aiBlogIntervalHours === undefined
        ? undefined
        : this.billing.upsertSettingNumber("aiBlogIntervalHours", Math.max(1, input.aiBlogIntervalHours)),
      input.aiBlogWordCount === undefined
        ? undefined
        : this.billing.upsertSettingNumber("aiBlogWordCount", Math.max(200, input.aiBlogWordCount)),
      input.aiBlogLanguage === undefined ? undefined : this.billing.upsertSettingString("aiBlogLanguage", input.aiBlogLanguage),
      input.aiBlogTopicsPool === undefined ? undefined : this.billing.upsertSettingString("aiBlogTopicsPool", input.aiBlogTopicsPool),
      input.aiBlogTitlePrompt === undefined ? undefined : this.billing.upsertSettingString("aiBlogTitlePrompt", input.aiBlogTitlePrompt),
      input.aiBlogContentPrompt === undefined ? undefined : this.billing.upsertSettingString("aiBlogContentPrompt", input.aiBlogContentPrompt),
      input.aiBlogExcerptPrompt === undefined ? undefined : this.billing.upsertSettingString("aiBlogExcerptPrompt", input.aiBlogExcerptPrompt),
      input.aiBlogTagsPrompt === undefined ? undefined : this.billing.upsertSettingString("aiBlogTagsPrompt", input.aiBlogTagsPrompt),
      input.aiBlogKeywordsPrompt === undefined ? undefined : this.billing.upsertSettingString("aiBlogKeywordsPrompt", input.aiBlogKeywordsPrompt)
    ]);
  }

  async uploadSiteLogo(file?: { buffer: Buffer; mimetype: string; originalname?: string; size: number }) {
    if (!file) {
      throw new BadRequestException("Logo image is required.");
    }
    if (file.size > 2_000_000) {
      throw new BadRequestException("Logo image must be smaller than 2 MB.");
    }
    if (!["image/png", "image/jpeg", "image/webp", "image/svg+xml"].includes(file.mimetype)) {
      throw new BadRequestException("Logo must be PNG, JPG, WebP, or SVG.");
    }
    const dir = await webUploadsDir();
    const svg = [
      '<svg xmlns="http://www.w3.org/2000/svg" width="180" height="60" viewBox="0 0 180 60">',
      `<image href="data:${file.mimetype};base64,${file.buffer.toString("base64")}" width="180" height="60" preserveAspectRatio="xMidYMid meet"/>`,
      "</svg>"
    ].join("");
    const filename = `site-logo-${Date.now()}.svg`;
    await writeFile(join(dir, filename), svg, "utf8");
    const logoUrl = `/uploads/${filename}`;
    await this.billing.upsertSettingString("siteLogoUrl", logoUrl);
    return { height: 60, logoUrl, width: 180 };
  }

  async getSeoSettings() {
    const keys = ["seo.siteName", "seo.metaDescription", "seo.blogMetaDescription", "seo.ogTitleSuffix", "seo.ogImageStatic", "seo.ogImageDashboard", "seo.ogImageBlog"];
    const values = await Promise.all(keys.map((k) => this.billing.settingString(k)));
    return Object.fromEntries(keys.map((k, i) => [k.replace("seo.", ""), values[i] ?? ""]));
  }

  async updateSeoSettings(input: Record<string, string>) {
    const allowed = ["siteName", "metaDescription", "blogMetaDescription", "ogTitleSuffix", "ogImageStatic", "ogImageDashboard", "ogImageBlog"];
    await Promise.all(
      Object.entries(input)
        .filter(([k]) => allowed.includes(k))
        .map(([k, v]) => this.billing.upsertSettingString(`seo.${k}`, v))
    );
    return this.getSeoSettings();
  }

  async uploadOgImage(file: { buffer: Buffer; mimetype: string; originalname?: string; size: number } | undefined, type: string) {
    if (!file) throw new BadRequestException("Image is required.");
    if (file.size > 2_000_000) throw new BadRequestException("OG image must be smaller than 2 MB.");
    if (!["image/png", "image/jpeg", "image/webp", "image/svg+xml"].includes(file.mimetype)) {
      throw new BadRequestException("OG image must be PNG, JPG, WebP, or SVG.");
    }
    const allowed = ["static", "dashboard", "blog"];
    const safeType = allowed.includes(type) ? type : "static";
    const ext = file.mimetype === "image/jpeg" ? "jpg" : file.mimetype === "image/webp" ? "webp" : file.mimetype === "image/svg+xml" ? "svg" : "png";
    const dir = await webUploadsDir();
    const filename = `og-${safeType}-${Date.now()}.${ext}`;
    await writeFile(join(dir, filename), file.buffer);
    const imageUrl = `/uploads/${filename}`;
    await this.billing.upsertSettingString(`seo.ogImage${safeType.charAt(0).toUpperCase() + safeType.slice(1)}`, imageUrl);
    return { imageUrl, type: safeType };
  }

  async uploadFounderPhoto(file?: { buffer: Buffer; mimetype: string; originalname?: string; size: number }) {
    if (!file) throw new BadRequestException("Photo is required.");
    if (file.size > 5_000_000) throw new BadRequestException("Photo must be smaller than 5 MB.");
    if (!["image/png", "image/jpeg", "image/webp", "image/svg+xml"].includes(file.mimetype)) {
      throw new BadRequestException("Photo must be PNG, JPG, WebP, or SVG.");
    }
    const dir = await webUploadsDir();
    const ext = file.mimetype === "image/jpeg" ? "jpg" : file.mimetype === "image/webp" ? "webp" : file.mimetype === "image/svg+xml" ? "svg" : "png";
    const filename = `founder-photo-${Date.now()}.${ext}`;
    await writeFile(join(dir, filename), file.buffer);
    const photoUrl = `/uploads/${filename}`;
    await this.billing.upsertSettingString("founderPhotoUrl", photoUrl);
    return { photoUrl };
  }

  async uploadFavicon(file?: { buffer: Buffer; mimetype: string; originalname?: string; size: number }) {
    if (!file) {
      throw new BadRequestException("Favicon image is required.");
    }
    if (file.size > 512_000) {
      throw new BadRequestException("Favicon must be smaller than 512 KB.");
    }
    const allowed = ["image/png", "image/x-icon", "image/vnd.microsoft.icon", "image/svg+xml", "image/webp"];
    if (!allowed.includes(file.mimetype)) {
      throw new BadRequestException("Favicon must be PNG, ICO, SVG, or WebP.");
    }
    const dir = await webUploadsDir();
    const ext = file.mimetype === "image/x-icon" || file.mimetype === "image/vnd.microsoft.icon" ? "ico"
      : file.mimetype === "image/svg+xml" ? "svg"
      : file.mimetype === "image/webp" ? "webp"
      : "png";
    const filename = `favicon-${Date.now()}.${ext}`;
    await writeFile(join(dir, filename), file.buffer);
    const faviconUrl = `/uploads/${filename}`;
    await this.billing.upsertSettingString("faviconUrl", faviconUrl);
    return { faviconUrl };
  }

  async getThemeSettings() {
    const [
      homeHeroImageUrl, webhostingHeroImageUrl, domainsHeroImageUrl, itSolutionsHeroImageUrl,
      contactHeroImageUrl, aboutHeroImageUrl, virtualServersHeroImageUrl, webdesignHeroImageUrl,
      blogHeroImageUrl, knowledgebaseHeroImageUrl
    ] = await Promise.all([
      this.billing.settingString("theme.blue.homeHeroImageUrl"),
      this.billing.settingString("theme.blue.webhostingHeroImageUrl"),
      this.billing.settingString("theme.blue.domainsHeroImageUrl"),
      this.billing.settingString("theme.blue.itSolutionsHeroImageUrl"),
      this.billing.settingString("theme.blue.contactHeroImageUrl"),
      this.billing.settingString("theme.blue.aboutHeroImageUrl"),
      this.billing.settingString("theme.blue.virtualServersHeroImageUrl"),
      this.billing.settingString("theme.blue.webdesignHeroImageUrl"),
      this.billing.settingString("theme.blue.blogHeroImageUrl"),
      this.billing.settingString("theme.blue.knowledgebaseHeroImageUrl")
    ]);
    return {
      blue: {
        homeHeroImageUrl, webhostingHeroImageUrl, domainsHeroImageUrl, itSolutionsHeroImageUrl,
        contactHeroImageUrl, aboutHeroImageUrl, virtualServersHeroImageUrl, webdesignHeroImageUrl,
        blogHeroImageUrl, knowledgebaseHeroImageUrl
      }
    };
  }

  async uploadThemeHeroImage(
    theme: string,
    field: string,
    file: { buffer: Buffer; mimetype: string; originalname?: string; size: number } | undefined
  ) {
    if (!file) throw new BadRequestException("Image is required.");
    if (file.size > 5_000_000) throw new BadRequestException("Image must be smaller than 5 MB.");
    const allowedMimetypes = ["image/png", "image/jpeg", "image/webp", "image/svg+xml", "image/gif"];
    if (!allowedMimetypes.includes(file.mimetype)) throw new BadRequestException("Image must be PNG, JPG, WebP, SVG, or GIF.");
    const allowedThemes = ["blue"];
    const allowedFields = [
      "homeHeroImageUrl", "webhostingHeroImageUrl", "domainsHeroImageUrl", "itSolutionsHeroImageUrl",
      "contactHeroImageUrl", "aboutHeroImageUrl", "virtualServersHeroImageUrl", "webdesignHeroImageUrl",
      "blogHeroImageUrl", "knowledgebaseHeroImageUrl"
    ];
    if (!allowedThemes.includes(theme) || !allowedFields.includes(field)) throw new BadRequestException("Invalid theme or field.");
    const dataUri = `data:${file.mimetype};base64,${file.buffer.toString("base64")}`;
    const safeFilename = (file.originalname ?? `image.${file.mimetype.split("/")[1]}`)
      .replace(/[^a-zA-Z0-9._-]/g, "_");
    const imageUrl = `/api/v1/storefront/theme-image/${theme}/${field}/${safeFilename}`;
    await Promise.all([
      this.billing.upsertSettingString(`theme.${theme}.${field}`, imageUrl),
      this.billing.upsertSettingString(`theme.${theme}.${field}.data`, dataUri),
    ]);
    return { field, imageUrl, theme };
  }

  async serveThemeHeroImage(theme: string, field: string) {
    const allowedThemes = ["blue"];
    const allowedFields = [
      "homeHeroImageUrl", "webhostingHeroImageUrl", "domainsHeroImageUrl", "itSolutionsHeroImageUrl",
      "contactHeroImageUrl", "aboutHeroImageUrl", "virtualServersHeroImageUrl", "webdesignHeroImageUrl",
      "blogHeroImageUrl", "knowledgebaseHeroImageUrl"
    ];
    if (!allowedThemes.includes(theme) || !allowedFields.includes(field)) throw new NotFoundException("Image not found.");
    const dataUri = await this.billing.settingString(`theme.${theme}.${field}.data`);
    if (!dataUri || !dataUri.startsWith("data:")) throw new NotFoundException("Image not found.");
    const commaIdx = dataUri.indexOf(",");
    const meta = dataUri.slice(5, commaIdx);
    const mimeType = meta.replace(";base64", "");
    const buffer = Buffer.from(dataUri.slice(commaIdx + 1), "base64");
    return { mimeType, buffer };
  }

  // Module catalog, enabled-state and config are owned by the ModuleRegistryService (DB-backed with
  // .env fallback). These delegates keep the existing /admin/dev/modules routes stable.
  async getModules() {
    if (!this.modules) {
      return [];
    }
    return this.modules.list();
  }

  async updateModule(name: string, input: { active?: boolean; config?: Record<string, unknown> }) {
    if (!this.modules) {
      return [];
    }
    return this.modules.update(name, input);
  }

  async updateServiceStatus(id: string, status: string) {
    const service = await this.billing.setServiceStatus(id, status);
    if (status === "ACTIVE") {
      // Reload with relations and backfill the Virtualmin panel username / control-panel URL before
      // emailing, otherwise {{virtualmin_control_panel_username}} renders empty for admin-activated
      // accounts (the create call never returns the panel-derived username).
      const full = (await this.billing.serviceForEmail(id).catch(() => undefined)) ?? service;
      await this.ensureHostingCredentials(full).catch(() => undefined);
      void this.dispatchServiceEmail("hosting_account_information", full).catch(() => undefined);
    }
    if (status === "SUSPENDED") {
      void this.dispatchServiceEmail("hosting_account_suspended", service).catch(() => undefined);
    }
    if (status === "TERMINATED") {
      void this.dispatchServiceEmail("hosting_account_terminated", service).catch(() => undefined);
    }
    return service;
  }

  private async dispatchInvoiceEmail(eventKey: string, invoiceInput: Record<string, any>, options: { customerSnapshot?: unknown; userId?: string } = {}) {
    if (!this.emails) {
      return [];
    }
    // Reload the full invoice when items or transactions are missing, otherwise {{service}}
    // and {{payment_gateway}} would render empty (some callers pass a partially-loaded invoice).
    const hasRelations = Array.isArray(invoiceInput.items) && Array.isArray(invoiceInput.transactions);
    const invoice = hasRelations && invoiceInput.customerSnapshot && invoiceInput.invoiceNumber
      ? invoiceInput
      : (await this.billing.findInvoice(invoiceInput.id)) ?? invoiceInput;
    if (!invoice) {
      return [];
    }
    const snapshot = asRecord(options.customerSnapshot ?? invoice.customerSnapshot);
    const user = asRecord(invoice.user);
    const itemNames = (invoice.items ?? []).map((item: Record<string, any>) => item.description).filter(Boolean);
    const orderItemNames = (invoice.order?.items ?? []).map((item: Record<string, any>) => item.description).filter(Boolean);
    // Email money uses the invoice's frozen currency; locale = up-to-date recipient locale → main.
    const locale = stringFrom(user.locale) ?? (await this.i18nLanguages()).main;
    const currency = stringFrom(invoice.currency) ?? await this.mainCurrency();
    return this.emails.dispatch(eventKey, {
      context: {
        customer_email: stringFrom(user.email) ?? stringFrom(snapshot.email),
        customer_name: stringFrom(user.name) ?? stringFrom(snapshot.name) ?? stringFrom(snapshot.email),
        invoice_due_date: invoice.dueAt ? formatDate(invoice.dueAt, locale) : "",
        invoice_link: `${publicWebUrl()}/client/invoices/${invoice.id}`,
        invoice_number: invoice.finalInvoiceNumber ?? invoice.tempInvoiceNumber ?? invoice.invoiceNumber,
        invoice_total_amount: formatMoney(invoice.totalCents, currency, locale),
        order_number: stringFrom(invoice.order?.orderNumber),
        payment_gateway: paymentGatewayLabel(invoice.transactions),
        service: (itemNames.length ? itemNames : orderItemNames).join(", ")
      },
      teamId: invoice.teamId,
      user: {
        email: stringFrom(user.email) ?? stringFrom(snapshot.email),
        id: stringFrom(user.id) ?? options.userId ?? invoice.userId,
        locale: stringFrom(user.locale),
        name: stringFrom(user.name) ?? stringFrom(snapshot.name) ?? stringFrom(snapshot.email)
      }
    });
  }

  private async dispatchServiceEmail(eventKey: string, service: Record<string, any>) {
    if (!this.emails) {
      return [];
    }
    const user = asRecord(service.user);
    const product = asRecord(service.product);
    const productSnapshot = asRecord(service.productSnapshot);
    const domain = service.domainRecords?.[0]?.domain ?? asRecord(service.configuration).domainName;
    const hosting = asRecord(asRecord(service.configuration).hosting);
    const controlPanelUrl = stringFrom(hosting.controlPanelUrl) ?? "";
    const controlPanelUsername = stringFrom(hosting.username) ?? "";
    const controlPanelPassword = stringFrom(hosting.password) ?? "";
    const mailServer = mailServerHost(controlPanelUrl, stringFrom(domain));
    // Never leave {{service}} empty: fall back through the live product, the snapshot taken at
    // order time, and finally the service id.
    const serviceName = stringFrom(product.name) ?? stringFrom(productSnapshot.name) ?? service.id;
    return this.emails.dispatch(eventKey, {
      context: {
        // Virtualmin module shortcodes.
        virtualmin_control_panel_password: controlPanelPassword,
        virtualmin_control_panel_url: controlPanelUrl,
        virtualmin_control_panel_username: controlPanelUsername,
        virtualmin_mail_server: mailServer,
        virtualmin_imap_port: mailServer ? "993" : "",
        virtualmin_smtp_port: mailServer ? "587" : "",
        // Legacy aliases so email layouts saved before the module rename keep working.
        control_panel_password: controlPanelPassword,
        control_panel_url: controlPanelUrl,
        control_panel_username: controlPanelUsername,
        customer_email: stringFrom(user.email),
        customer_name: stringFrom(user.name) ?? stringFrom(user.email),
        domain: stringFrom(domain),
        service: serviceName,
        service_link: `${publicWebUrl()}/client/services/${service.id}`
      },
      teamId: service.teamId,
      user: {
        email: stringFrom(user.email),
        id: service.userId,
        locale: stringFrom(user.locale),
        name: stringFrom(user.name) ?? stringFrom(user.email)
      }
    });
  }

  private async dispatchDomainEmail(eventKey: string, domain: Record<string, any>) {
    if (!this.emails) {
      return [];
    }
    const user = asRecord(domain.user);
    const service = asRecord(domain.service);
    const product = asRecord(service.product);
    const domainStatus = domainStatusLabel(domain.status);
    const nameservers = domainNameserverList(domain.nameservers);
    return this.emails.dispatch(eventKey, {
      context: {
        customer_email: stringFrom(user.email),
        customer_name: stringFrom(user.name) ?? stringFrom(user.email),
        domain: stringFrom(domain.domain),
        domain_link: `${publicWebUrl()}/client/domains`,
        // Resell.biz module shortcodes (with legacy aliases for older saved layouts).
        resellbiz_domain_status: domainStatus,
        resellbiz_nameservers: nameservers,
        domain_status: domainStatus,
        nameservers,
        service: stringFrom(product.name)
      },
      user: {
        email: stringFrom(user.email),
        id: domain.userId,
        locale: stringFrom(user.locale),
        name: stringFrom(user.name) ?? stringFrom(user.email)
      }
    });
  }

  // Send the hosting activation email exactly once, whichever path marked the service ACTIVE
  // (immediate provisioning, the status-reconciliation cron, or a client-triggered refresh). For a
  // Virtualmin account the panel-assigned username and control-panel address are fetched and stored
  // here if provisioning could not capture them. Idempotency is enforced with a `service.activation_email`
  // audit log.
  async notifyServiceActivated(serviceId: string) {
    if (await this.billing.hasAuditLog("service.activation_email", serviceId)) {
      return { reason: "already_notified", sent: false };
    }
    const service = await this.billing.serviceForEmail(serviceId);
    if (!service || service.status !== "ACTIVE") {
      return { reason: "not_active", sent: false };
    }
    await this.ensureHostingCredentials(service);
    await this.dispatchServiceEmail("hosting_account_information", service).catch(() => undefined);
    await this.billing.createAuditLog({ action: "service.activation_email", subject: "service", subjectId: serviceId });
    return { sent: true };
  }

  // Send the domain activation email exactly once when a domain reaches ACTIVE (registered on the
  // registrar). Idempotency is enforced with a `domain.activation_email` audit log.
  async notifyDomainActivated(domainId: string) {
    if (await this.billing.hasAuditLog("domain.activation_email", domainId)) {
      return { reason: "already_notified", sent: false };
    }
    const domain = await this.billing.domainForEmail(domainId);
    if (!domain || domain.status !== "ACTIVE") {
      return { reason: "not_active", sent: false };
    }
    await this.dispatchDomainEmail("domain_information", domain).catch(() => undefined);
    await this.billing.createAuditLog({ action: "domain.activation_email", subject: "domain", subjectId: domainId });
    return { sent: true };
  }

  // Cron sweep: e-mail any service/domain that reached ACTIVE outside the immediate provisioning path
  // (the common case the customer hit — provisioning lagged the payment and the status cron flipped it
  // active later). The audit-log guard above keeps this from re-sending for already-notified accounts.
  async notifyPendingActivations() {
    // First run after this feature deploys: baseline every currently-active account as already
    // notified (no email) so we never retro-blast existing customers. Only future activations email.
    const baselineKey = "activationEmailBaselineAt";
    if (!(await this.billing.settingString(baselineKey))) {
      const seeded = await this.seedActivationBaseline();
      await this.billing.upsertSettingString(baselineKey, new Date().toISOString());
      return { baseline: seeded, domains: 0, services: 0 };
    }
    let services = 0;
    let domains = 0;
    const [serviceIds, notifiedServices] = await Promise.all([
      this.billing.activeHostingServiceIds(),
      this.billing.notifiedSubjectIds("service.activation_email")
    ]);
    for (const id of serviceIds) {
      if (notifiedServices.has(id)) {
        continue;
      }
      const result = await this.notifyServiceActivated(id).catch(() => ({ sent: false }));
      if (result.sent) {
        services += 1;
      }
    }
    const [domainIds, notifiedDomains] = await Promise.all([
      this.billing.activeDomainRecordIds(),
      this.billing.notifiedSubjectIds("domain.activation_email")
    ]);
    for (const id of domainIds) {
      if (notifiedDomains.has(id)) {
        continue;
      }
      const result = await this.notifyDomainActivated(id).catch(() => ({ sent: false }));
      if (result.sent) {
        domains += 1;
      }
    }
    return { domains, services };
  }

  // Mark every currently-active service/domain as already-notified, without sending any email. Runs
  // once (guarded by the activationEmailBaselineAt setting) the first time the activation sweep runs.
  private async seedActivationBaseline() {
    const [serviceIds, notifiedServices] = await Promise.all([
      this.billing.activeHostingServiceIds(),
      this.billing.notifiedSubjectIds("service.activation_email")
    ]);
    const newServiceIds = serviceIds.filter((id) => !notifiedServices.has(id));
    await this.billing.recordActivationBaseline("service.activation_email", "service", newServiceIds);
    const [domainIds, notifiedDomains] = await Promise.all([
      this.billing.activeDomainRecordIds(),
      this.billing.notifiedSubjectIds("domain.activation_email")
    ]);
    const newDomainIds = domainIds.filter((id) => !notifiedDomains.has(id));
    await this.billing.recordActivationBaseline("domain.activation_email", "domain", newDomainIds);
    return { domains: newDomainIds.length, services: newServiceIds.length };
  }

  // For a Virtualmin hosting service, fill in the panel-assigned username and control-panel address
  // (read-only) when provisioning could not capture them, and persist them on the service so later
  // emails and the client area can reuse them. Mutates the in-memory `service` so the very next
  // dispatch sees the values. Never throws.
  private async ensureHostingCredentials(service: Record<string, any>) {
    if (!this.external || effectiveServiceModule(service) !== "virtualmin") {
      return;
    }
    const config = asRecord(service.configuration);
    const hosting = asRecord(config.hosting);
    if (stringFrom(hosting.username) && stringFrom(hosting.controlPanelUrl)) {
      return;
    }
    const externalId = stringFrom(service.externalId);
    const domainName = externalId && !externalId.startsWith("virtualmin_")
      ? externalId
      : stringFrom(config.domainName) ?? stringFrom(service.domainRecords?.[0]?.domain);
    if (!domainName) {
      return;
    }
    const summary = await this.external.virtualmin.accountSummary(domainName).catch(() => undefined);
    if (!summary) {
      return;
    }
    const merged = {
      controlPanelUrl: stringFrom(hosting.controlPanelUrl) ?? summary.controlPanelUrl,
      password: stringFrom(hosting.password) ?? "",
      username: stringFrom(hosting.username) ?? summary.username
    };
    service.configuration = { ...config, hosting: merged };
    await this.billing.mergeServiceConfiguration(service.id, { hosting: merged }).catch(() => undefined);
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
      footerLines,
      logoUrl
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
      this.invoiceFooterLines(),
      this.billing.settingString("siteLogoUrl")
    ]);

    return {
      address,
      bankDetails,
      city,
      companyName,
      country,
      email,
      footerLines,
      logoUrl,
      paymentInstructions,
      phone,
      vatNumber,
      zip
    };
  }
}

function positiveSetting(value: unknown, fallback: number) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : fallback;
}

// ── Modular i18n / currency config (stored as JSON in SystemSetting) ──
type StoredLanguages = { main: string; others: string[] };
type StoredCurrencyRate = { rate: number; buffer: number; bufferEnabled: boolean };
type StoredCurrencyConfig = { main: string; others: string[]; rates: Record<string, StoredCurrencyRate> };

function sanitizeLanguages(input: { main?: string; others?: unknown }): StoredLanguages {
  const main = typeof input.main === "string" && input.main ? input.main : "de";
  const others = Array.isArray(input.others)
    ? Array.from(new Set(input.others.filter((code): code is string => typeof code === "string" && Boolean(code) && code !== main)))
    : [];
  return { main, others };
}

function sanitizeCurrencyConfig(input: {
  main?: string;
  others?: unknown;
  rates?: Record<string, { rate?: unknown; buffer?: unknown; bufferEnabled?: unknown }> | unknown;
}): StoredCurrencyConfig {
  const main = typeof input.main === "string" && input.main ? input.main : "EUR";
  const others = Array.isArray(input.others)
    ? Array.from(new Set(input.others.filter((code): code is string => typeof code === "string" && Boolean(code) && code !== main)))
    : [];
  const ratesIn = input.rates && typeof input.rates === "object" ? (input.rates as Record<string, { rate?: unknown; buffer?: unknown; bufferEnabled?: unknown }>) : {};
  const rates: Record<string, StoredCurrencyRate> = {};
  for (const code of others) {
    const raw = ratesIn[code] ?? {};
    const rate = Number(raw.rate);
    const buffer = Number(raw.buffer);
    rates[code] = {
      rate: Number.isFinite(rate) && rate > 0 ? rate : 1,
      buffer: Number.isFinite(buffer) && buffer >= 0 ? Math.round(buffer) : 0,
      bufferEnabled: Boolean(raw.bufferEnabled)
    };
  }
  return { main, others, rates };
}

function paymentMethodLabel(method: string) {
  if (method === "CREDIT_CARD") {
    return "Credit/debit card";
  }
  if (method === "SEPA") {
    return "SEPA Direct Debit";
  }
  if (method === "PAYPAL") {
    return "PayPal";
  }
  if (method === "BANK_TRANSFER") {
    return "Bank transfer";
  }
  if (method === "ACCOUNT_BALANCE") {
    return "Account balance";
  }
  if (method === "CRYPTO") {
    return "Cryptocurrency";
  }
  return method;
}

// The payment gateway a customer used to pay an invoice — derived from its most recent
// successful transaction (falling back to the latest transaction of any status).
function paymentGatewayLabel(transactions: unknown): string {
  if (!Array.isArray(transactions) || !transactions.length) {
    return "";
  }
  const byNewest = [...transactions].sort(
    (a, b) => new Date(b?.createdAt ?? 0).getTime() - new Date(a?.createdAt ?? 0).getTime()
  );
  const chosen = byNewest.find((transaction) => transaction?.status === "SUCCEEDED") ?? byNewest[0];
  return chosen?.method ? paymentMethodLabel(String(chosen.method)) : "";
}

// Mail server hostname customers use for IMAP/POP and SMTP. Prefers the control-panel host,
// falling back to mail.<domain>.
function mailServerHost(controlPanelUrl: string, domain?: string): string {
  if (controlPanelUrl) {
    try {
      return new URL(controlPanelUrl).hostname;
    } catch {
      // not a URL — ignore and fall back to the domain
    }
  }
  return domain ? `mail.${domain}` : "";
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
  if (["PENDING", "PROVISIONING", "FAILED", "PROVISIONING_FAILED"].includes(service.status)) {
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
  return ["create", "register_domain", "renew", "renew_domain", "unsuspend"].includes(action);
}

function hostingModuleName(productType?: string) {
  return ["VPS", "DEDICATED_SERVER"].includes(productType ?? "") ? "hetzner" : "virtualmin";
}

function effectiveServiceModule(service: Record<string, any>) {
  if (service.product?.category) {
    return canonicalModule(service.product.category.provisioningModule);
  }
  return canonicalModule(service.moduleName) ?? canonicalModule(service.product?.provisioningModule) ?? hostingModuleName(service.product?.type);
}

function canonicalModule(value: unknown) {
  const moduleName = String(value ?? "").trim().toLowerCase();
  if (!moduleName || moduleName === "none") {
    return undefined;
  }
  if (moduleName === "resell.biz") {
    return "resellbiz";
  }
  return moduleName;
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

// Human label for a domain status enum (ACTIVE → "Active") used in the activation email.
function domainStatusLabel(status: unknown) {
  const value = String(status ?? "").trim();
  if (!value) {
    return "Active";
  }
  return value.charAt(0).toUpperCase() + value.slice(1).toLowerCase();
}

// Comma-separated name servers for the activation email, falling back to the registrar defaults when
// the domain was registered with the standard Dezhost name servers (stored as null).
function domainNameserverList(nameservers: unknown) {
  const list = Array.isArray(nameservers)
    ? nameservers.filter((item): item is string => typeof item === "string" && item.length > 0)
    : [];
  if (list.length) {
    return list.join(", ");
  }
  const fallback = [process.env.RESELLBIZ_DEFAULT_NS1, process.env.RESELLBIZ_DEFAULT_NS2].filter(
    (value): value is string => Boolean(value && value.trim())
  );
  return fallback.length ? fallback.join(", ") : "ns1.domain.com, ns2.domain.com";
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

function stringFrom(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

// Accept only a well-formed locale code (e.g. "de", "en", "pt-br") so a stray query param can't
// poison the renderer; unknown-but-valid codes simply fall back per-key to English in the packs.
function localeCodeFrom(value: unknown): string | undefined {
  const code = stringFrom(value)?.toLowerCase();
  return code && /^[a-z]{2}(?:-[a-z]{2})?$/.test(code) ? code : undefined;
}

function asRecord(value: unknown): Record<string, any> {
  return isRecord(value) ? value : {};
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function defaultPaymentGateways(): Array<{ config: Record<string, unknown>; enabled: boolean; method: PaymentMethodType | "SANDBOX" }> {
  return [
    sandboxGateway(),
    { config: {}, enabled: true, method: "CREDIT_CARD" },
    { config: {}, enabled: true, method: "PAYPAL" },
    { config: {}, enabled: true, method: "SEPA" }
  ];
}

function sandboxGateway() {
  return { config: {}, enabled: true, method: "SANDBOX" as const };
}

function publicWebUrl() {
  return process.env.PUBLIC_WEB_URL ?? process.env.NEXT_PUBLIC_WEB_URL ?? process.env.APP_URL ?? "http://localhost:3000";
}

function publicApiUrl() {
  return process.env.PUBLIC_API_URL ?? "http://localhost:4000/api/v1";
}

function isLocalhostUrl(url: string) {
  return /https?:\/\/(localhost|127\.\d+\.\d+\.\d+)/.test(url);
}

// Returns a webhook URL only when the API is publicly reachable.
// Mollie (and other gateways) validate webhooks are accessible; sending a
// localhost URL causes them to reject the payment.
function gatewayWebhookUrl(method: string) {
  const base = publicApiUrl();
  return isLocalhostUrl(base) ? undefined : `${base}/billing/webhooks/${method.toLowerCase()}`;
}

function gatewayTitle(method: string) {
  return {
    CREDIT_CARD: "Credit/debit card",
    PAYPAL: "Paypal",
    SANDBOX: "Sandbox",
    SEPA: "SEPA Lastschrift"
  }[method] ?? method;
}

// Fallback label shown on invoices when the admin hasn't named the gateway.
function defaultPaymentMethodLabel(method: string) {
  return {
    ACCOUNT_BALANCE: "Guthaben",
    BANK_TRANSFER: "Banküberweisung",
    CREDIT_CARD: "Kreditkarte",
    PAYPAL: "PayPal",
    SEPA: "SEPA-Lastschrift"
  }[method] ?? method;
}

function paymentInputForGateway(method: string): PayInvoiceDto {
  return method === "SANDBOX"
    ? { method: "CREDIT_CARD", paymentMethodId: "sandbox" }
    : { method, paymentMethodId: method.toLowerCase() } as PayInvoiceDto;
}

function customerSnapshotFromBillingProfile(user: {
  contacts?: Array<{ address?: unknown; phone?: string | null }>;
  countryCode?: string;
  customerNumber?: number | null;
  customerType?: string;
  email: string;
  id: string;
  name?: string | null;
  vatId?: string | null;
}) {
  const contact = user.contacts?.[0];
  return {
    address: isRecord(contact?.address) ? contact.address : undefined,
    countryCode: user.countryCode ?? "DE",
    customerNumber: user.customerNumber,
    customerType: user.customerType ?? "INDIVIDUAL",
    email: user.email,
    name: user.name ?? user.email,
    phone: contact?.phone ?? undefined,
    userId: user.id,
    vatId: user.vatId ?? undefined
  };
}

function validateAndNormalizeIban(raw: string): string {
  const iban = raw.replace(/\s+/g, "").toUpperCase();
  if (iban.length < 15 || iban.length > 34) {
    throw new BadRequestException(`Invalid IBAN: length must be 15–34 characters (got ${iban.length}).`);
  }
  if (!/^[A-Z]{2}[0-9]{2}[A-Z0-9]+$/.test(iban)) {
    throw new BadRequestException("Invalid IBAN format: must start with a 2-letter country code and 2 check digits.");
  }
  return iban;
}

async function webUploadsDir() {
  const dir = process.cwd().endsWith("apps/api")
    ? resolve(process.cwd(), "../web/public/uploads")
    : resolve(process.cwd(), "apps/web/public/uploads");
  await mkdir(dir, { recursive: true });
  return dir;
}

// Recover raw PNG/JPEG bytes for the invoice PDF logo. Uploaded logos are stored as an SVG wrapper
// around a base64 data URL of the original image; we pull that out. Data URLs and direct png/jpg
// uploads are handled too. Returns undefined for SVG/WebP/remote logos so the PDF falls back to text.
async function loadPdfLogoImage(logoUrl: string): Promise<Buffer | undefined> {
  try {
    const dataMatch = logoUrl.match(/^data:(image\/(?:png|jpeg));base64,(.+)$/i);
    if (dataMatch) {
      return Buffer.from(dataMatch[2]!, "base64");
    }
    if (!logoUrl.startsWith("/uploads/")) {
      return undefined;
    }
    const filePath = join(await webUploadsDir(), logoUrl.replace("/uploads/", ""));
    if (logoUrl.toLowerCase().endsWith(".svg")) {
      const svg = await readFile(filePath, "utf8");
      const embedded = svg.match(/data:(image\/(?:png|jpeg));base64,([^"')\s]+)/i);
      return embedded ? Buffer.from(embedded[2]!, "base64") : undefined;
    }
    if (/\.(png|jpe?g)$/i.test(logoUrl)) {
      return await readFile(filePath);
    }
    return undefined;
  } catch {
    return undefined;
  }
}
