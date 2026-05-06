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

  // Temporary dev endpoint until admin auth UI is wired.
  @Post("admin/dev/products")
  createProductDev(@Body() dto: CreateProductDto) {
    return this.products.createProduct(dto);
  }

  // Temporary dev endpoint until admin auth UI is wired.
  @Get("admin/dev/services")
  listServicesDev() {
    return this.products.listServices();
  }

  // Temporary dev endpoint until admin auth UI is wired.
  @Get("admin/dev/virtualmin/templates")
  listVirtualminTemplatesDev() {
    return this.products.listVirtualminTemplates();
  }

  // Temporary dev endpoint until admin auth UI is wired.
  @Patch("admin/dev/products/:id")
  updateProductDev(@Param("id") id: string, @Body() dto: CreateProductDto) {
    return this.products.updateProduct(id, dto);
  }

  // Temporary dev endpoint until admin auth UI is wired.
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
    return this.products.listServices(canSeeAll ? undefined : request.user.sub);
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
  @Post("services/:id/cancel")
  cancelService(@Param("id") id: string) {
    return this.products.cancelService(id);
  }
}
