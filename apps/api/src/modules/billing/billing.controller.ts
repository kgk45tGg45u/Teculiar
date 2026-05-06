import { Body, Controller, Get, Param, Patch, Post, Query, UseGuards } from "@nestjs/common";
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
  listInvoices(@Query("status") status?: string, @Query("userId") userId?: string) {
    return this.billing.listInvoices({ status, userId });
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

  @Get("billing/invoices")
  listInvoices(@Query("userId") userId?: string) {
    return this.billing.listInvoices({ userId });
  }

  @Post("billing/maintenance")
  runAdminMaintenance() {
    return this.billing.runAdminMaintenance();
  }

  @Patch("billing/settings")
  updateSettings(@Body() body: { invoiceDaysAhead?: number; ticketAutoCloseHours?: number; vatPercent?: number }) {
    return this.billing.updateSettings(body);
  }

  @Patch("services/:id/status")
  updateServiceStatus(@Param("id") id: string, @Body("status") status: string) {
    return this.billing.updateServiceStatus(id, status);
  }
}
