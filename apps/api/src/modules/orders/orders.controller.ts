import { Body, Controller, Get, Param, Patch, Post, Query, Req, UseGuards } from "@nestjs/common";
import type { Request } from "express";
import { AgentAuditService } from "../../common/agent-audit.service";
import { Roles } from "../../common/decorators/roles.decorator";
import { RolesGuard } from "../../common/guards/roles.guard";
import { maskUserRef, shouldMask } from "../../common/pii-mask";
import { JwtAuthGuard, OptionalJwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { AdminCreateOrderDto, CheckoutOrderDto, PayOrderDto, PreviewOrderDto } from "./dto/order.dto";
import { OrdersService } from "./orders.service";

@Controller()
export class OrdersController {
  constructor(
    private readonly orders: OrdersService,
    private readonly agentAudit: AgentAuditService
  ) {}

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

  // "agent" (read-only, PII masked) added only here — never to orders/admin POST/PATCH below.
  // AgentWriteBlockGuard also structurally blocks agent from any non-GET request regardless.
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles("admin", "staff", "super_admin", "support_agent", "sales_agent", "agent")
  @Get("orders/admin")
  async adminOrders(@Req() request: Request & { user: { roles?: string[]; sub: string } }) {
    const orders = await this.orders.listAdminOrders();
    if (!shouldMask(request.user.roles)) return orders;
    this.agentAudit.recordRead(request.user.sub, "orders");
    return orders.map((order) => (order.user ? { ...order, user: maskUserRef(order.user) } : order));
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles("admin", "staff", "super_admin", "support_agent", "sales_agent")
  @Post("orders/admin")
  createAdminOrder(@Body() dto: AdminCreateOrderDto) {
    return this.orders.createAdminOrder(dto);
  }

  // Pricing rows only, no customer data — safe for the read-only agent credential.
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles("admin", "staff", "super_admin", "support_agent", "sales_agent", "agent")
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

  // Masking for the agent role happens inside getOrder (orders.service.ts) — it also gates the
  // staff-visibility bypass, so this route serves clients (own orders), staff (all), and agent
  // (all, masked) from one place.
  @UseGuards(JwtAuthGuard)
  @Get("orders/:id")
  order(@Param("id") id: string, @Req() request: Request & { user: { sub: string; roles?: string[] } }) {
    if (shouldMask(request.user.roles)) this.agentAudit.recordRead(request.user.sub, "orders", id);
    return this.orders.getOrder(id, request.user);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles("admin", "staff", "super_admin", "support_agent", "sales_agent")
  @Patch("orders/:id/status")
  updateOrderStatus(@Param("id") id: string, @Body("status") status: string) {
    return this.orders.updateOrderStatus(id, status);
  }
}
