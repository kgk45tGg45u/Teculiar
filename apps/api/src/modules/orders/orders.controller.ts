import { Body, Controller, Get, Param, Patch, Post, Query, Req, UseGuards } from "@nestjs/common";
import type { Request } from "express";
import { Roles } from "../../common/decorators/roles.decorator";
import { RolesGuard } from "../../common/guards/roles.guard";
import { JwtAuthGuard, OptionalJwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { AdminCreateOrderDto, CheckoutOrderDto, PayOrderDto, PreviewOrderDto } from "./dto/order.dto";
import { OrdersService } from "./orders.service";

@Controller()
export class OrdersController {
  constructor(private readonly orders: OrdersService) {}

  @Get("storefront/products")
  homepageProducts(@Query("category") category?: string) {
    return this.orders.homepageProducts(category);
  }

  @Get("storefront/domain-prices")
  storefrontDomainPrices() {
    return this.orders.listStorefrontDomainPrices();
  }

  @Get("domains/search")
  searchDomain(@Query("domain") domain: string, @Query("years") years?: string) {
    return this.orders.searchDomain(domain, years);
  }

  @Post("orders/preview")
  preview(@Body() dto: PreviewOrderDto) {
    return this.orders.previewOrder(dto);
  }

  @UseGuards(OptionalJwtAuthGuard)
  @Post("orders/checkout")
  checkout(@Body() dto: CheckoutOrderDto, @Req() request: Request & { user?: { sub: string } }) {
    return this.orders.checkout(dto, request.user);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles("admin", "staff", "super_admin", "support_agent", "sales_agent")
  @Get("orders/admin")
  adminOrders() {
    return this.orders.listAdminOrders();
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles("admin", "staff", "super_admin", "support_agent", "sales_agent")
  @Post("orders/admin")
  createAdminOrder(@Body() dto: AdminCreateOrderDto) {
    return this.orders.createAdminOrder(dto);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles("admin", "staff", "super_admin", "support_agent", "sales_agent")
  @Get("orders/admin/domain-prices")
  adminDomainPrices() {
    return this.orders.listDomainPrices();
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles("admin", "staff", "super_admin", "support_agent", "sales_agent")
  @Post("orders/admin/domain-prices")
  upsertDomainPrice(
    @Body() body: { action: string; amountCents?: number; manual?: boolean; suggested?: boolean; tld: string; years: number }
  ) {
    return this.orders.upsertDomainPrice(body);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles("admin", "staff", "super_admin", "support_agent", "sales_agent")
  @Post("orders/admin/domain-prices/sync")
  syncDomainPrices(@Body("customerId") customerId?: number) {
    return this.orders.syncDomainPrices(customerId);
  }

  @Post("orders/:id/pay")
  pay(@Param("id") id: string, @Body() dto: PayOrderDto) {
    return this.orders.payOrder(id, dto);
  }

  @UseGuards(JwtAuthGuard)
  @Get("orders/:id")
  order(@Param("id") id: string, @Req() request: Request & { user: { sub: string; roles?: string[] } }) {
    return this.orders.getOrder(id, request.user);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles("admin", "staff", "super_admin", "support_agent", "sales_agent")
  @Patch("orders/:id/status")
  updateOrderStatus(@Param("id") id: string, @Body("status") status: string) {
    return this.orders.updateOrderStatus(id, status);
  }
}
