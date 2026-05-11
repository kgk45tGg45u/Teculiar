import { Body, Controller, Delete, Get, Param, Patch, Post, Query, Req, UseGuards } from "@nestjs/common";
import type { Request, Response } from "express";
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
    @Query("status") status?: string,
    @Query("userId") userId?: string
  ) {
    const staff = request.user.roles?.some((role) => ["admin", "staff"].includes(role));
    return this.billing.listInvoices({ status, userId: staff ? userId : request.user.sub });
  }

  @Get("invoices/:id")
  getInvoice(@Param("id") id: string, @Req() request: Request & { user: { sub: string; roles?: string[] } }) {
    return this.billing.getInvoice(id, request.user);
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

@Controller("storefront")
export class BillingStorefrontController {
  constructor(private readonly billing: BillingService) {}

  @Get("settings")
  settings() {
    return this.billing.settings();
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

  @Post("billing/maintenance")
  runAdminMaintenance() {
    return this.billing.runAdminMaintenance();
  }

  @Patch("billing/settings")
  updateSettings(
    @Body()
    body: {
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

  @Patch("services/:id/status")
  updateServiceStatus(@Param("id") id: string, @Body("status") status: string) {
    return this.billing.updateServiceStatus(id, status);
  }

  @Post("module-logs/:id/retry")
  retryModuleAction(@Param("id") id: string, @Body() body: { actorId?: string }) {
    return this.billing.retryModuleAction(id, body);
  }
}
