import { Body, Controller, Get, Param, Post, Query } from "@nestjs/common";
import { CheckoutOrderDto, PayOrderDto, PreviewOrderDto } from "./dto/order.dto";
import { OrdersService } from "./orders.service";

@Controller()
export class OrdersController {
  constructor(private readonly orders: OrdersService) {}

  @Get("storefront/products")
  homepageProducts() {
    return this.orders.homepageProducts();
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

  // Temporary dev endpoint until admin auth UI is wired.
  @Get("orders/admin")
  adminOrders() {
    return this.orders.listAdminOrders();
  }

  @Get("orders/admin/domain-prices")
  adminDomainPrices() {
    return this.orders.listDomainPrices();
  }

  @Post("orders/admin/domain-prices")
  upsertDomainPrice(
    @Body() body: { action: string; amountCents: number; manual?: boolean; suggested?: boolean; tld: string; years: number }
  ) {
    return this.orders.upsertDomainPrice(body);
  }

  @Post("orders/admin/domain-prices/sync")
  syncDomainPrices(@Body("customerId") customerId?: number) {
    return this.orders.syncDomainPrices(customerId);
  }

  @Post("orders/:id/pay")
  pay(@Param("id") id: string, @Body() dto: PayOrderDto) {
    return this.orders.payOrder(id, dto);
  }

  @Get("orders/:id")
  order(@Param("id") id: string) {
    return this.orders.getOrder(id);
  }
}
