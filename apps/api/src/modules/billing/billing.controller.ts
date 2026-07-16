import { Body, Controller, Delete, Get, Param, Patch, Post, Query, Req, UploadedFile, UseGuards, UseInterceptors, NotFoundException } from "@nestjs/common";
import type { Request, Response } from "express";
import { FileInterceptor } from "@nestjs/platform-express";
import { Res } from "@nestjs/common";
import { JwtService, type JwtSignOptions } from "@nestjs/jwt";
import { AgentAuditService } from "../../common/agent-audit.service";
import { Roles } from "../../common/decorators/roles.decorator";
import { RolesGuard } from "../../common/guards/roles.guard";
import { deepMaskPii, maskInvoice, shouldMask } from "../../common/pii-mask";
import { JwtAuthGuard, OptionalJwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { accessSecret, refreshSecret } from "../../tenancy/jwt-secrets";
import { BillingService } from "./billing.service";
import { CreateInvoiceDto } from "./dto/create-invoice.dto";
import { CreateSubscriptionDto } from "./dto/create-subscription.dto";
import { PayInvoiceDto } from "./dto/pay-invoice.dto";

@UseGuards(JwtAuthGuard, RolesGuard)
@Controller("billing")
export class BillingController {
  constructor(
    private readonly billing: BillingService,
    private readonly agentAudit: AgentAuditService
  ) {}

  @Get("invoices")
  listInvoices(
    @Req() request: Request & { user: { sub: string; roles?: string[] } },
    @Query("status") status?: string
  ) {
    return this.billing.listInvoices({ status, userId: request.user.sub });
  }

  @Get("invoices/:id")
  getInvoice(@Param("id") id: string, @Req() request: Request & { user: { sub: string; roles?: string[] } }) {
    // Masking for the agent role happens inside getInvoice (billing.service.ts), which also
    // covers the HTML/PDF renders below.
    if (shouldMask(request.user.roles)) this.agentAudit.recordRead(request.user.sub, "billing.invoices", id);
    return this.billing.getInvoice(id, request.user);
  }

  @Get("invoices/:id/html")
  async invoiceHtml(
    @Param("id") id: string,
    @Req() request: Request & { user: { sub: string; roles?: string[] } },
    @Res() response: Response,
    @Query("locale") locale?: string
  ) {
    const html = await this.billing.invoiceHtml(id, request.user, locale);
    response.setHeader("Content-Type", "text/html; charset=utf-8");
    response.setHeader("Content-Disposition", `inline; filename="invoice-${id}.html"`);
    response.send(html);
  }

  @Get("invoices/:id/pdf")
  async invoicePdf(
    @Param("id") id: string,
    @Req() request: Request & { user: { sub: string; roles?: string[] } },
    @Res() response: Response,
    @Query("locale") locale?: string
  ) {
    const pdf = await this.billing.invoicePdf(id, request.user, locale);
    response.setHeader("Content-Type", "application/pdf");
    response.setHeader("Content-Disposition", `attachment; filename="invoice-${id}.pdf"`);
    response.send(pdf);
  }

  @Roles("admin", "staff", "super_admin")
  @Post("invoices")
  createInvoice(@Body() dto: CreateInvoiceDto) {
    return this.billing.createInvoice(dto);
  }

  @Post("invoices/:id/send")
  sendInvoice(@Param("id") id: string) {
    return this.billing.sendInvoice(id);
  }

  @Post("invoices/:id/pay")
  payInvoice(@Param("id") id: string, @Body() dto: PayInvoiceDto) {
    return this.billing.payInvoice(id, dto);
  }

  @Post("invoices/:id/bank-transfer-claimed")
  claimBankTransferPaid(
    @Param("id") id: string,
    @Req() request: Request & { user: { sub: string } }
  ) {
    return this.billing.claimBankTransferPaid(id, request.user.sub);
  }

  @Post("add-funds")
  addFunds(
    @Req() request: Request & { user: { sub: string } },
    @Body() body: { amountCents: number; iban?: string; method: string }
  ) {
    return this.billing.addFunds(request.user.sub, body);
  }

  @Get("payment-methods")
  listPaymentMethods(@Req() request: Request & { user: { sub: string } }) {
    return this.billing.listPaymentMethods(request.user.sub);
  }

  @Post("payment-methods/setup")
  setupPaymentMethod(
    @Req() request: Request & { user: { sub: string } },
    @Body() body: { iban?: string; method: string }
  ) {
    return this.billing.setupPaymentMethod(request.user.sub, body);
  }

  @Post("payment-methods/:id/confirm")
  confirmPaymentMethod(@Param("id") id: string, @Req() request: Request & { user: { sub: string } }) {
    return this.billing.confirmPaymentMethod(request.user.sub, id);
  }

  @Patch("payment-methods/:id")
  updatePaymentMethod(
    @Param("id") id: string,
    @Req() request: Request & { user: { sub: string } },
    @Body() body: { automatic?: boolean; default?: boolean }
  ) {
    return this.billing.updatePaymentMethod(request.user.sub, id, body);
  }

  @Post("payment-methods/:id/set-default")
  setDefaultPaymentMethod(@Param("id") id: string, @Req() request: Request & { user: { sub: string } }) {
    return this.billing.setDefaultPaymentMethod(request.user.sub, id);
  }

  @Delete("payment-methods/:id")
  deletePaymentMethod(@Param("id") id: string, @Req() request: Request & { user: { sub: string } }) {
    return this.billing.deletePaymentMethod(request.user.sub, id);
  }

  @Roles("admin", "staff", "super_admin")
  @Post("invoices/:id/mark-paid")
  markInvoicePaid(@Param("id") id: string, @Body() body: { actorId?: string }) {
    return this.billing.markInvoicePaid(id, { actorId: body.actorId, source: "admin" });
  }

  @Roles("admin", "staff", "super_admin")
  @Post("invoices/:id/mark-unpaid")
  markInvoiceUnpaid(@Param("id") id: string, @Body() body: { actorId?: string; reason?: string }) {
    return this.billing.markInvoiceUnpaid(id, body);
  }

  @Roles("admin", "staff", "super_admin")
  @Post("invoices/:id/refund")
  refundInvoice(@Param("id") id: string, @Body() body: { actorId?: string; reason?: string }) {
    return this.billing.refundInvoice(id, body);
  }

  @Roles("admin", "staff", "super_admin")
  @Delete("invoices/:id")
  deleteInvoice(@Param("id") id: string) {
    return this.billing.deleteInvoice(id);
  }

  @Roles("admin", "staff", "super_admin")
  @Post("subscriptions")
  createSubscription(@Body() dto: CreateSubscriptionDto) {
    return this.billing.createSubscription(dto);
  }

  @Roles("admin", "staff", "super_admin")
  @Post("subscriptions/:id/renew")
  renewSubscription(@Param("id") id: string) {
    return this.billing.renewSubscription(id);
  }

  @Roles("admin", "staff", "super_admin")
  @Get("reports/revenue")
  revenueReport() {
    return this.billing.revenueReport();
  }

}

// Public confirm-payment endpoint.
//
// This lives in its own controller WITHOUT the class-level `@UseGuards(JwtAuthGuard, RolesGuard)`
// that BillingController applies. In NestJS, controller-level guards are NOT replaced by a
// method-level guard — they BOTH run. So a method-level OptionalJwtAuthGuard on BillingController
// could never make the route public: the strict class-level JwtAuthGuard rejected guests with
// 401 "Missing access token" before the optional guard ran. That broke every guest checkout that
// returned from Mollie/PayPal (the payment-return page calls this with no session yet), so the
// invoice never finalized and no order materialized.
//
// Here OptionalJwtAuthGuard is the ONLY guard: guests pass through (request.user undefined) and
// logged-in clients still get request.user populated from their token.
@Controller("billing")
@UseGuards(OptionalJwtAuthGuard)
export class BillingConfirmController {
  constructor(
    private readonly billing: BillingService,
    private readonly jwt: JwtService
  ) {}

  // New customers returning from a payment gateway don't have a session yet.
  // On success the response includes an accessToken so the frontend can call
  // storeAuth() and land the user directly in the client area without a login step.
  @Post("invoices/:id/confirm-payment")
  async confirmInvoicePayment(
    @Param("id") id: string,
    @Req() request: Request & { user?: { sub?: string } }
  ) {
    const result = await this.billing.confirmInvoicePayment(id);

    // Auto-login: issue a JWT when payment succeeded and the caller has no existing session.
    // Re-fetch the invoice to get the post-materialization userId (the pending-checkout user
    // gets replaced with the real user during finalizePaidInvoice → materializePaidCheckoutUser).
    if (result.status === "PAID" && !request.user?.sub) {
      const freshInvoice = await this.billing.getInvoice(id);
      const userId = (freshInvoice as Record<string, unknown> | null)?.userId;
      if (typeof userId === "string") {
        const user = await this.billing.getUserForAutoLogin(userId);
        if (user) {
          const expiresIn = (process.env.JWT_ACCESS_TTL ?? "15m") as JwtSignOptions["expiresIn"];
          const accessToken = await this.jwt.signAsync(
            { sub: user.id, email: user.email, roles: user.roles },
            { expiresIn, secret: accessSecret() }
          );
          const refreshToken = await this.jwt.signAsync(
            { sub: user.id },
            { expiresIn: (process.env.JWT_REFRESH_TTL ?? "30d") as JwtSignOptions["expiresIn"], secret: refreshSecret() }
          );
          return { ...result, accessToken, refreshToken, tokenType: "Bearer", user };
        }
      }
    }
    return result;
  }
}

@Controller("billing/webhooks")
export class BillingWebhookController {
  constructor(private readonly billing: BillingService) {}

  @Post(":method")
  paymentWebhook(@Param("method") method: string, @Body() body: Record<string, unknown>) {
    return this.billing.handlePaymentWebhook(method, body);
  }
}

@Controller("storefront")
export class BillingStorefrontController {
  constructor(private readonly billing: BillingService) {}

  @Get("settings")
  settings() {
    return this.billing.publicSettings();
  }

  @Get("payment-gateways")
  paymentGateways() {
    return this.billing.storefrontPaymentGateways();
  }

  @Get("theme-image/:theme/:field")
  @Get("theme-image/:theme/:field/:filename")
  async themeImage(@Param("theme") theme: string, @Param("field") field: string, @Res() res: Response) {
    const { mimeType, buffer } = await this.billing.serveThemeHeroImage(theme, field);
    res.setHeader("Content-Type", mimeType);
    res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
    res.end(buffer);
  }
}

// "agent" (read-only, PII masked) is added at class level: every GET below is safe for it
// (settings/gateways are non-PII; invoices and logs are masked explicitly), and
// AgentWriteBlockGuard structurally blocks agent from the non-GET routes lower in this class
// (services/:id/status, module-logs/:id/retry) regardless of this decorator.
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles("admin", "staff", "super_admin", "support_agent", "sales_agent", "agent")
@Controller("admin/dev")
export class BillingDevController {
  constructor(
    private readonly billing: BillingService,
    private readonly agentAudit: AgentAuditService
  ) {}

  @Get("billing/dashboard")
  adminDashboardStats() {
    return this.billing.adminDashboardStats();
  }

  @Get("billing/settings")
  settings() {
    return this.billing.settings();
  }

  @Get("billing/payment-gateways")
  paymentGateways() {
    return this.billing.adminPaymentGateways();
  }

  @Get("billing/invoices")
  async listInvoices(
    @Req() request: Request & { user: { roles?: string[]; sub: string } },
    @Query("userId") userId?: string
  ) {
    const invoices = await this.billing.listInvoices({ userId });
    if (!shouldMask(request.user.roles)) return invoices;
    this.agentAudit.recordRead(request.user.sub, "billing.invoices", userId);
    return invoices.map(maskInvoice);
  }

  // Log rows carry actor identity and arbitrary metadata/payload JSON that can embed customer
  // data — deep-masked for the read-only agent credential rather than blocked outright, so the
  // Logs page structure stays testable.
  @Get("logs")
  async listLogs(
    @Req() request: Request & { user: { roles?: string[] } },
    @Query("limit") limit?: string,
    @Query("kind") kind?: string,
    @Query("page") page?: string,
    @Query("pageSize") pageSize?: string
  ) {
    // Paginated mode (used by the admin Logs page tabs) is enabled by passing ?kind=system|cron.
    // Without it the legacy flat list (capped by ?limit) is returned for backward compatibility.
    const logs =
      kind === "system" || kind === "cron"
        ? await this.billing.listLogsPaged({
            kind,
            page: page ? Number(page) : undefined,
            pageSize: pageSize ? Number(pageSize) : undefined
          })
        : await this.billing.listLogs(limit ? Number(limit) : undefined);
    return shouldMask(request.user.roles) ? deepMaskPii(logs) : logs;
  }

  @Post("billing/maintenance")
  @Roles("admin", "super_admin")
  runAdminMaintenance() {
    return this.billing.runAdminMaintenance();
  }

  @Roles("admin", "super_admin")
  @Patch("billing/settings")
  updateSettings(
    @Body()
    body: {
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
      siteLogoUrl?: string;
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
    }
  ) {
    return this.billing.updateSettings(body);
  }

  @Roles("admin", "super_admin")
  @Patch("billing/payment-gateways")
  updatePaymentGateways(
    @Body() body: { gateways?: Array<{ config?: Record<string, unknown>; enabled?: boolean; method: string }> }
  ) {
    return this.billing.updatePaymentGateways(body.gateways ?? []);
  }

  @Roles("admin", "super_admin")
  @Post("assets/logo")
  @UseInterceptors(FileInterceptor("image"))
  uploadSiteLogo(@UploadedFile() file?: { buffer: Buffer; mimetype: string; originalname?: string; size: number }) {
    return this.billing.uploadSiteLogo(file);
  }

  @Roles("admin", "super_admin")
  @Post("assets/favicon")
  @UseInterceptors(FileInterceptor("image"))
  uploadFavicon(@UploadedFile() file?: { buffer: Buffer; mimetype: string; originalname?: string; size: number }) {
    return this.billing.uploadFavicon(file);
  }

  @Roles("admin", "super_admin")
  @Post("assets/founder-photo")
  @UseInterceptors(FileInterceptor("image"))
  uploadFounderPhoto(@UploadedFile() file?: { buffer: Buffer; mimetype: string; originalname?: string; size: number }) {
    return this.billing.uploadFounderPhoto(file);
  }

  @Roles("admin", "super_admin")
  @Post("assets/og-image")
  @UseInterceptors(FileInterceptor("image"))
  uploadOgImage(
    @UploadedFile() file: { buffer: Buffer; mimetype: string; originalname?: string; size: number } | undefined,
    @Body("type") type: string
  ) {
    return this.billing.uploadOgImage(file, type);
  }

  @Roles("admin", "super_admin")
  @Get("seo-settings")
  getSeoSettings() {
    return this.billing.getSeoSettings();
  }

  @Roles("admin", "super_admin")
  @Patch("seo-settings")
  updateSeoSettings(@Body() body: Record<string, string>) {
    return this.billing.updateSeoSettings(body);
  }

  @Get("modules")
  getModules() {
    return this.billing.getModules();
  }

  @Roles("admin", "super_admin")
  @Patch("modules/:name")
  updateModule(
    @Param("name") name: string,
    @Body() body: { active?: boolean; config?: Record<string, unknown> }
  ) {
    return this.billing.updateModule(name, body);
  }

  // Explicit overrides (without "agent") so these two don't inherit the class-level grant above —
  // both mutate a real customer's service/module state. AgentWriteBlockGuard's BLOCKED_PREFIXES
  // also covers /admin/dev/services and /admin/dev/module-logs, but keep the decorator honest too.
  @Roles("admin", "staff", "super_admin", "support_agent", "sales_agent")
  @Patch("services/:id/status")
  updateServiceStatus(@Param("id") id: string, @Body("status") status: string) {
    return this.billing.updateServiceStatus(id, status);
  }

  @Roles("admin", "staff", "super_admin", "support_agent", "sales_agent")
  @Post("module-logs/:id/retry")
  retryModuleAction(@Param("id") id: string, @Body() body: { actorId?: string }) {
    return this.billing.retryModuleAction(id, body);
  }

  @Roles("admin", "super_admin")
  @Get("theme/settings")
  getThemeSettings() {
    return this.billing.getThemeSettings();
  }

  @Roles("admin", "super_admin")
  @Post("assets/theme-image/:theme/:field")
  @UseInterceptors(FileInterceptor("image"))
  uploadThemeHeroImage(
    @Param("theme") theme: string,
    @Param("field") field: string,
    @UploadedFile() file?: { buffer: Buffer; mimetype: string; originalname?: string; size: number }
  ) {
    return this.billing.uploadThemeHeroImage(theme, field, file);
  }
}
