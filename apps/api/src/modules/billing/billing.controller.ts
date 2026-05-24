import { Body, Controller, Delete, Get, Param, Patch, Post, Query, Req, UploadedFile, UseGuards, UseInterceptors } from "@nestjs/common";
import type { Request, Response } from "express";
import { FileInterceptor } from "@nestjs/platform-express";
import { Res } from "@nestjs/common";
import { Roles } from "../../common/decorators/roles.decorator";
import { RolesGuard } from "../../common/guards/roles.guard";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { BillingService } from "./billing.service";
import { CreateInvoiceDto } from "./dto/create-invoice.dto";
import { CreateSubscriptionDto } from "./dto/create-subscription.dto";
import { PayInvoiceDto } from "./dto/pay-invoice.dto";

@UseGuards(JwtAuthGuard, RolesGuard)
@Controller("billing")
export class BillingController {
  constructor(private readonly billing: BillingService) {}

  @Get("invoices")
  listInvoices(
    @Req() request: Request & { user: { sub: string; roles?: string[] } },
    @Query("status") status?: string
  ) {
    return this.billing.listInvoices({ status, userId: request.user.sub });
  }

  @Get("invoices/:id")
  getInvoice(@Param("id") id: string, @Req() request: Request & { user: { sub: string; roles?: string[] } }) {
    return this.billing.getInvoice(id, request.user);
  }

  @Get("invoices/:id/html")
  async invoiceHtml(
    @Param("id") id: string,
    @Req() request: Request & { user: { sub: string; roles?: string[] } },
    @Res() response: Response
  ) {
    const html = await this.billing.invoiceHtml(id, request.user);
    response.setHeader("Content-Type", "text/html; charset=utf-8");
    response.setHeader("Content-Disposition", `inline; filename="invoice-${id}.html"`);
    response.send(html);
  }

  @Get("invoices/:id/pdf")
  async invoicePdf(
    @Param("id") id: string,
    @Req() request: Request & { user: { sub: string; roles?: string[] } },
    @Res() response: Response
  ) {
    const pdf = await this.billing.invoicePdf(id, request.user);
    response.setHeader("Content-Type", "application/pdf");
    response.setHeader("Content-Disposition", `attachment; filename="invoice-${id}.pdf"`);
    response.send(pdf);
  }

  @Roles("admin", "staff")
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

  @Post("invoices/:id/confirm-payment")
  confirmInvoicePayment(@Param("id") id: string) {
    return this.billing.confirmInvoicePayment(id);
  }

  @Post("add-funds")
  addFunds(
    @Req() request: Request & { user: { sub: string } },
    @Body() body: { amountCents: number; method: string }
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

  @Delete("payment-methods/:id")
  deletePaymentMethod(@Param("id") id: string, @Req() request: Request & { user: { sub: string } }) {
    return this.billing.deletePaymentMethod(request.user.sub, id);
  }

  @Roles("admin", "staff")
  @Post("invoices/:id/mark-paid")
  markInvoicePaid(@Param("id") id: string, @Body() body: { actorId?: string }) {
    return this.billing.markInvoicePaid(id, { actorId: body.actorId, source: "admin" });
  }

  @Roles("admin", "staff")
  @Post("invoices/:id/mark-unpaid")
  markInvoiceUnpaid(@Param("id") id: string, @Body() body: { actorId?: string; reason?: string }) {
    return this.billing.markInvoiceUnpaid(id, body);
  }

  @Roles("admin", "staff")
  @Post("invoices/:id/refund")
  refundInvoice(@Param("id") id: string, @Body() body: { actorId?: string; reason?: string }) {
    return this.billing.refundInvoice(id, body);
  }

  @Roles("admin", "staff")
  @Delete("invoices/:id")
  deleteInvoice(@Param("id") id: string) {
    return this.billing.deleteInvoice(id);
  }

  @Roles("admin", "staff")
  @Post("subscriptions")
  createSubscription(@Body() dto: CreateSubscriptionDto) {
    return this.billing.createSubscription(dto);
  }

  @Roles("admin", "staff")
  @Post("subscriptions/:id/renew")
  renewSubscription(@Param("id") id: string) {
    return this.billing.renewSubscription(id);
  }

  @Roles("admin", "staff")
  @Get("reports/revenue")
  revenueReport() {
    return this.billing.revenueReport();
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
}

@UseGuards(JwtAuthGuard, RolesGuard)
@Roles("admin", "staff")
@Controller("admin/dev")
export class BillingDevController {
  constructor(private readonly billing: BillingService) {}

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
  listInvoices(@Query("userId") userId?: string) {
    return this.billing.listInvoices({ userId });
  }

  @Get("logs")
  listLogs(@Query("limit") limit?: string) {
    return this.billing.listLogs(limit ? Number(limit) : undefined);
  }

  @Post("billing/maintenance")
  runAdminMaintenance() {
    return this.billing.runAdminMaintenance();
  }

  @Patch("billing/settings")
  updateSettings(
    @Body()
    body: {
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
    }
  ) {
    return this.billing.updateSettings(body);
  }

  @Patch("billing/payment-gateways")
  updatePaymentGateways(
    @Body() body: { gateways?: Array<{ config?: Record<string, unknown>; enabled?: boolean; method: string }> }
  ) {
    return this.billing.updatePaymentGateways(body.gateways ?? []);
  }

  @Post("assets/logo")
  @UseInterceptors(FileInterceptor("image"))
  uploadSiteLogo(@UploadedFile() file?: { buffer: Buffer; mimetype: string; originalname?: string; size: number }) {
    return this.billing.uploadSiteLogo(file);
  }

  @Get("modules")
  getModules() {
    return this.billing.getModules();
  }

  @Patch("modules/:name")
  updateModule(
    @Param("name") name: string,
    @Body() body: { active?: boolean; config?: Record<string, unknown> }
  ) {
    return this.billing.updateModule(name, body);
  }

  @Patch("services/:id/status")
  updateServiceStatus(@Param("id") id: string, @Body("status") status: string) {
    return this.billing.updateServiceStatus(id, status);
  }

  @Post("module-logs/:id/retry")
  retryModuleAction(@Param("id") id: string, @Body() body: { actorId?: string }) {
    return this.billing.retryModuleAction(id, body);
  }
}
