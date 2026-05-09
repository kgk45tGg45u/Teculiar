import { Body, Controller, Get, Param, Patch, Post, Query, Req, UseGuards } from "@nestjs/common";
import type { Request } from "express";
import { Roles } from "../../common/decorators/roles.decorator";
import { RolesGuard } from "../../common/guards/roles.guard";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { CheckoutOrderDto, PayOrderDto, PreviewOrderDto } from "./dto/order.dto";
import { OrdersService } from "./orders.service";

@Controller()
export class OrdersController {
  constructor(private readonly orders: OrdersService) {}

  @Get("storefront/products")
  homepageProducts() {
    return this.orders.homepageProducts();
  }

  @Get("storefront/domain-prices")
  storefrontDomainPrices() {
    return this.orders.listDomainPrices();
  }

  @Get("domains/search")
  searchDomain(@Query("domain") domain: string) {
    return this.orders.searchDomain(domain);
  }

  @Post("orders/preview")
  preview(@Body() dto: PreviewOrderDto) {
    return this.orders.previewOrder(dto);
  }

  @Post("orders/checkout")
  checkout(@Body() dto: CheckoutOrderDto) {
    return this.orders.checkout(dto);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles("admin", "staff")
  @Get("orders/admin")
  adminOrders() {
    return this.orders.listAdminOrders();
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles("admin", "staff")
  @Get("orders/admin/domain-prices")
  adminDomainPrices() {
    return this.orders.listDomainPrices();
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles("admin", "staff")
  @Post("orders/admin/domain-prices")
  upsertDomainPrice(
    @Body() body: { action: string; amountCents: number; manual?: boolean; suggested?: boolean; tld: string; years: number }
  ) {
    return this.orders.upsertDomainPrice(body);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles("admin", "staff")
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
  @Roles("admin", "staff")
  @Patch("orders/:id/status")
  updateOrderStatus(@Param("id") id: string, @Body("status") status: string) {
    return this.orders.updateOrderStatus(id, status);
  }
}
