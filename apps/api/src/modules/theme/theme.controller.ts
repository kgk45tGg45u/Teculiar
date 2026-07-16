import { Body, Controller, Delete, Get, Param, Patch, Post, UseGuards } from "@nestjs/common";
import { Roles } from "../../common/decorators/roles.decorator";
import { RolesGuard } from "../../common/guards/roles.guard";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { CreateMenuItemDto, CreatePageDto, UpdateFooterDto, UpdateMenuItemDto, UpdatePageDto } from "./dto/theme.dto";
import { ThemeService } from "./theme.service";

// Public: the data-driven theme (menus/pages/footer) the storefront renders from.
@Controller("storefront")
export class ThemeStorefrontController {
  constructor(private readonly theme: ThemeService) {}

  @Get("theme")
  active() {
    return this.theme.storefrontTheme();
  }
}

// Admin: full editable theme for the Admin > Theme tabs. "agent" (read-only test credential)
// gets the class-level GET; every mutating route below carries an explicit admin/super_admin
// override that excludes it.
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles("admin", "staff", "super_admin", "support_agent", "sales_agent", "agent")
@Controller("admin/dev/theme")
export class ThemeAdminController {
  constructor(private readonly theme: ThemeService) {}

  @Get()
  get() {
    return this.theme.adminTheme();
  }

  @Roles("admin", "super_admin")
  @Post("pages")
  createPage(@Body() dto: CreatePageDto) {
    return this.theme.createPage(dto);
  }

  @Roles("admin", "super_admin")
  @Patch("pages/:id")
  updatePage(@Param("id") id: string, @Body() dto: UpdatePageDto) {
    return this.theme.updatePage(id, dto);
  }

  @Roles("admin", "super_admin")
  @Delete("pages/:id")
  deletePage(@Param("id") id: string) {
    return this.theme.deletePage(id);
  }

  @Roles("admin", "super_admin")
  @Post("menu-items")
  createMenuItem(@Body() dto: CreateMenuItemDto) {
    return this.theme.createMenuItem(dto);
  }

  @Roles("admin", "super_admin")
  @Patch("menu-items/:id")
  updateMenuItem(@Param("id") id: string, @Body() dto: UpdateMenuItemDto) {
    return this.theme.updateMenuItem(id, dto);
  }

  @Roles("admin", "super_admin")
  @Delete("menu-items/:id")
  deleteMenuItem(@Param("id") id: string) {
    return this.theme.deleteMenuItem(id);
  }

  @Roles("admin", "super_admin")
  @Patch("footer")
  updateFooter(@Body() dto: UpdateFooterDto) {
    return this.theme.updateFooter(dto);
  }

  @Roles("admin", "super_admin")
  @Post(":key/activate")
  activate(@Param("key") key: string) {
    return this.theme.activateTheme(key);
  }
}
