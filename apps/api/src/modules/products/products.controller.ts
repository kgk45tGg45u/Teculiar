import { Body, Controller, Delete, Get, Param, Patch, Post, Query, Req, UseGuards } from "@nestjs/common";
import type { Request } from "express";
import { Roles } from "../../common/decorators/roles.decorator";
import { RolesGuard } from "../../common/guards/roles.guard";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { CreateProductDto, ProductCategoryDto } from "./dto/create-product.dto";
import { ProductsService } from "./products.service";

@Controller()
export class ProductsController {
  constructor(private readonly products: ProductsService) {}

  @Get("products")
  listProducts() {
    return this.products.listProducts();
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles("admin", "staff", "super_admin")
  @Get("admin/dev/product-categories")
  listCategoriesDev() {
    return this.products.listCategories();
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles("admin", "staff", "super_admin")
  @Post("admin/dev/product-categories")
  createCategoryDev(@Body() dto: ProductCategoryDto) {
    return this.products.createCategory(dto);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles("admin", "staff", "super_admin")
  @Patch("admin/dev/product-categories/:id")
  updateCategoryDev(@Param("id") id: string, @Body() dto: ProductCategoryDto) {
    return this.products.updateCategory(id, dto);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles("admin", "staff", "super_admin")
  @Delete("admin/dev/product-categories/:id")
  deleteCategoryDev(@Param("id") id: string) {
    return this.products.deleteCategory(id);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles("admin", "staff", "super_admin")
  @Post("admin/dev/products")
  createProductDev(@Body() dto: CreateProductDto) {
    return this.products.createProduct(dto);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles("admin", "staff", "super_admin")
  @Get("admin/dev/services")
  listServicesDev() {
    return this.products.listServices();
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles("admin", "staff", "super_admin")
  @Post("admin/dev/services/refresh")
  refreshServicesDev() {
    return this.products.refreshAllServiceStatuses();
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles("admin", "staff", "super_admin")
  @Patch("admin/dev/services/:id/status")
  updateServiceStatusDev(@Param("id") id: string, @Body("status") status: string) {
    return this.products.updateServiceStatus(id, status);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles("admin", "staff", "super_admin")
  @Get("admin/dev/virtualmin/templates")
  listVirtualminTemplatesDev() {
    return this.products.listVirtualminTemplates();
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles("admin", "staff", "super_admin")
  @Get("admin/dev/virtualmin/plans/detect")
  detectVirtualminPlansDev() {
    return this.products.detectVirtualminHostingPlans();
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles("admin", "staff", "super_admin")
  @Post("admin/dev/virtualmin/plans/sync")
  syncVirtualminPlansDev(@Body("plans") plans?: Array<{ id: string; limits?: Record<string, string | undefined>; name: string }>) {
    return this.products.syncVirtualminHostingPlans(plans);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles("admin", "staff", "super_admin")
  @Patch("admin/dev/products/:id")
  updateProductDev(@Param("id") id: string, @Body() dto: CreateProductDto) {
    return this.products.updateProduct(id, dto);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles("admin", "staff", "super_admin")
  @Delete("admin/dev/products/:id")
  deleteProductDev(@Param("id") id: string) {
    return this.products.deleteProduct(id);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles("admin", "staff", "super_admin")
  @Post("products")
  createProduct(@Body() dto: CreateProductDto) {
    return this.products.createProduct(dto);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles("admin", "staff", "super_admin")
  @Patch("products/:id")
  updateProduct(@Param("id") id: string, @Body() dto: CreateProductDto) {
    return this.products.updateProduct(id, dto);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles("admin", "staff", "super_admin")
  @Delete("products/:id")
  deleteProduct(@Param("id") id: string) {
    return this.products.deleteProduct(id);
  }

  @UseGuards(JwtAuthGuard)
  @Get("services")
  listServices(@Req() request: Request & { user: { sub: string; roles?: string[] } }, @Query("refresh") refresh?: string) {
    const userId = request.user.sub;
    return refresh === "1" || refresh === "true" ? this.products.listServicesFresh(userId) : this.products.listServices(userId);
  }

  @UseGuards(JwtAuthGuard)
  @Get("services/:id")
  getService(@Param("id") id: string, @Req() request: Request & { user: { sub: string; roles?: string[] } }, @Query("refresh") refresh?: string) {
    return this.products.getService(id, request.user, { refresh: refresh === "1" || refresh === "true" });
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
