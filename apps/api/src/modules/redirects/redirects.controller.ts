import { Body, Controller, Delete, Get, Param, Patch, Post, UseGuards } from "@nestjs/common";
import { Roles } from "../../common/decorators/roles.decorator";
import { RolesGuard } from "../../common/guards/roles.guard";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { CreateRedirectDto, UpdateRedirectDto } from "./dto/redirects.dto";
import { RedirectsService } from "./redirects.service";

// Public: the enabled redirects the storefront middleware consults.
@Controller("storefront")
export class RedirectsStorefrontController {
  constructor(private readonly redirects: RedirectsService) {}

  @Get("redirects")
  active() {
    return this.redirects.storefrontRedirects();
  }
}

// Admin: full CRUD for the Admin > Theme > Redirects tab.
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles("admin", "staff", "super_admin", "support_agent", "sales_agent", "agent")
@Controller("admin/dev/redirects")
export class RedirectsAdminController {
  constructor(private readonly redirects: RedirectsService) {}

  @Get()
  list() {
    return this.redirects.list();
  }

  @Roles("admin", "super_admin")
  @Post()
  create(@Body() dto: CreateRedirectDto) {
    return this.redirects.create(dto);
  }

  @Roles("admin", "super_admin")
  @Patch(":id")
  update(@Param("id") id: string, @Body() dto: UpdateRedirectDto) {
    return this.redirects.update(id, dto);
  }

  @Roles("admin", "super_admin")
  @Delete(":id")
  delete(@Param("id") id: string) {
    return this.redirects.delete(id);
  }
}
