import { Body, Controller, Get, Param, Patch, Post, Query, Req, UseGuards } from "@nestjs/common";
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

  /** Admin: view a single invoice (stays in admin panel) */
  @Get("billing/invoices/:id")
  getInvoice(@Param("id") id: string) {
    return this.billing.getInvoice(id);
  }

  /** Admin: mark invoice as paid, triggers service activation */
  @Post("billing/invoices/:id/mark-paid")
  markPaid(@Param("id") id: string) {
    return this.billing.adminMarkPaid(id);
  }

  /** Admin: mark invoice as unpaid (reverses payment status) */
  @Post("billing/invoices/:id/mark-unpaid")
  markUnpaid(@Param("id") id: string) {
    return this.billing.adminMarkUnpaid(id);
  }

  /** Admin: create a custom invoice for a client */
  @Post("billing/clients/:clientId/invoices")
  createCustomInvoice(
    @Param("clientId") clientId: string,
    @Body() body: { dueAt: string; lines: Array<{ description: string; quantity: number; unitAmountCents: number }>; notes?: string }
  ) {
    return this.billing.adminCreateCustomInvoice({ userId: clientId, ...body });
  }

  /** Admin: list all clients */
  @Get("clients")
  listClients() {
    return this.billing.listClients();
  }

  /** Admin: get a single client with their services, domains, invoices */
  @Get("clients/:id")
  getClient(@Param("id") id: string) {
    return this.billing.getClient(id);
  }

  @Post("billing/maintenance")
  runAdminMaintenance() {
    return this.billing.runAdminMaintenance();
  }

  @Patch("billing/settings")
  updateSettings(
    @Body() body: {
      invoiceDaysAhead?: number;
      ticketAutoCloseHours?: number;
      vatPercent?: number;
      sellerName?: string;
      sellerAddressLine1?: string;
      sellerPostalCode?: string;
      sellerCity?: string;
      sellerCountryCode?: string;
      sellerVatId?: string;
      sellerEmail?: string;
      sellerPhone?: string;
      invoiceFooterLine1?: string;
      invoiceFooterLine2?: string;
      invoiceFooterLine3?: string;
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
}
