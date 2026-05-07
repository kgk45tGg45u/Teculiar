import { Body, Controller, Delete, Get, Param, Patch, Post, Req, UseGuards } from "@nestjs/common";
import type { Request } from "express";
import { Roles } from "../../common/decorators/roles.decorator";
import { RolesGuard } from "../../common/guards/roles.guard";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { CreateProductDto } from "./dto/create-product.dto";
import { ProductsService } from "./products.service";

@Controller()
export class ProductsController {
  constructor(private readonly products: ProductsService) {}

  @Get("products")
  listProducts() {
    return this.products.listProducts();
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles("admin", "staff")
  @Post("admin/dev/products")
  createProductDev(@Body() dto: CreateProductDto) {
    return this.products.createProduct(dto);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles("admin", "staff")
  @Get("admin/dev/services")
  listServicesDev() {
    return this.products.listServices();
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles("admin", "staff")
  @Get("admin/dev/virtualmin/templates")
  listVirtualminTemplatesDev() {
    return this.products.listVirtualminTemplates();
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles("admin", "staff")
  @Get("admin/dev/virtualmin/plans/detect")
  detectVirtualminPlansDev() {
    return this.products.detectVirtualminHostingPlans();
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles("admin", "staff")
  @Post("admin/dev/virtualmin/plans/sync")
  syncVirtualminPlansDev(@Body("plans") plans?: Array<{ id: string; limits?: Record<string, string | undefined>; name: string }>) {
    return this.products.syncVirtualminHostingPlans(plans);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles("admin", "staff")
  @Patch("admin/dev/products/:id")
  updateProductDev(@Param("id") id: string, @Body() dto: CreateProductDto) {
    return this.products.updateProduct(id, dto);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles("admin", "staff")
  @Delete("admin/dev/products/:id")
  deleteProductDev(@Param("id") id: string) {
    return this.products.deleteProduct(id);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles("admin", "staff")
  @Post("products")
  createProduct(@Body() dto: CreateProductDto) {
    return this.products.createProduct(dto);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles("admin", "staff")
  @Patch("products/:id")
  updateProduct(@Param("id") id: string, @Body() dto: CreateProductDto) {
    return this.products.updateProduct(id, dto);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles("admin", "staff")
  @Delete("products/:id")
  deleteProduct(@Param("id") id: string) {
    return this.products.deleteProduct(id);
  }

  @UseGuards(JwtAuthGuard)
  @Get("services")
  listServices(@Req() request: Request & { user: { sub: string; roles?: string[] } }) {
    const canSeeAll = request.user.roles?.some((role) => ["admin", "staff"].includes(role));
    return this.products.listServicesFresh(canSeeAll ? undefined : request.user.sub);
  }

  @UseGuards(JwtAuthGuard)
  @Get("services/:id")
  getService(@Param("id") id: string, @Req() request: Request & { user: { sub: string; roles?: string[] } }) {
    return this.products.getService(id, request.user);
  }

  @UseGuards(JwtAuthGuard)
  @Get("services/:id/hosting-panel")
  hostingControlPanel(@Param("id") id: string, @Req() request: Request & { user: { sub: string; roles?: string[] } }) {
    return this.products.hostingControlPanel(id, request.user);
  }

  @UseGuards(JwtAuthGuard)
  @Post("services/:id/hosting-panel")
  hostingControlAction(
    @Param("id") id: string,
    @Req() request: Request & { user: { sub: string; roles?: string[] } },
    @Body() body: Record<string, string | undefined>
  ) {
    return this.products.hostingControlAction(id, body, request.user);
  }

  @UseGuards(JwtAuthGuard)
  @Post("services")
  createService(
    @Req() request: Request & { user: { sub: string } },
    @Body() body: { productId: string; productPriceId: string; configuration: Record<string, unknown> }
  ) {
    return this.products.createService({
      userId: request.user.sub,
      productId: body.productId,
      productPriceId: body.productPriceId,
      configuration: body.configuration
    });
  }

  @UseGuards(JwtAuthGuard)
  @Post("services/:id/restart")
  restartService(@Param("id") id: string) {
    return this.products.restartService(id);
  }

  @UseGuards(JwtAuthGuard)
  @Post("services/:id/change-plan")
  changeServicePlan(
    @Param("id") id: string,
    @Req() request: Request & { user: { sub: string; roles?: string[] } },
    @Body() body: { productPriceId?: string }
  ) {
    return this.products.changeServicePlan(id, body, request.user);
  }

  @UseGuards(JwtAuthGuard)
  @Post("services/:id/renew-domain")
  renewDomain(
    @Param("id") id: string,
    @Req() request: Request & { user: { sub: string; roles?: string[] } },
    @Body("years") years: number
  ) {
    return this.products.renewDomain(id, Number(years), request.user);
  }

  @UseGuards(JwtAuthGuard)
  @Post("services/:id/cancel")
  cancelService(@Param("id") id: string) {
    return this.products.cancelService(id);
  }
}
