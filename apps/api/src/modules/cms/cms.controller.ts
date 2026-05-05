import { Body, Controller, Get, Headers, Param, Patch, Post, Query, Req, UseGuards } from "@nestjs/common";
import type { Request } from "express";
import { Roles } from "../../common/decorators/roles.decorator";
import { RolesGuard } from "../../common/guards/roles.guard";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { CmsService } from "./cms.service";
import { AutoTranslateDto } from "./dto/auto-translate.dto";
import { CreateContentDto } from "./dto/create-content.dto";

@Controller("cms")
export class CmsController {
  constructor(private readonly cms: CmsService) {}

  @Get("pages/:locale/:slug")
  getPage(
    @Param("locale") locale: string,
    @Param("slug") slug: string,
    @Headers("x-country-code") countryCode?: string
  ) {
    return this.cms.findPage(locale, slug, countryCode);
  }

  @Get("posts")
  listPosts(@Query("locale") locale = "de") {
    return this.cms.listPosts(locale);
  }

  @Get("announcements")
  listAnnouncements(@Query("locale") locale = "de") {
    return this.cms.listAnnouncements(locale);
  }

  // Temporary dev endpoint until admin auth UI is wired.
  @Post("admin/dev/announcements")
  createAnnouncement(@Body() dto: CreateContentDto) {
    return this.cms.createAnnouncement({ ...dto, type: "POST" });
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles("admin", "staff", "editor")
  @Post("pages")
  createContent(@Req() request: Request & { user: { sub: string } }, @Body() dto: CreateContentDto) {
    return this.cms.createContent(dto, request.user.sub);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles("admin", "staff", "editor")
  @Post("posts")
  createPost(@Req() request: Request & { user: { sub: string } }, @Body() dto: CreateContentDto) {
    return this.cms.createContent({ ...dto, type: "POST" }, request.user.sub);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles("admin", "staff", "editor")
  @Patch("pages/:id")
  updateContent(@Param("id") id: string, @Body() dto: Partial<CreateContentDto>) {
    return this.cms.updateContent(id, dto);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles("admin", "staff", "editor")
  @Post("translations/auto")
  autoTranslate(@Body() dto: AutoTranslateDto) {
    return this.cms.autoTranslate(dto);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles("admin", "staff", "editor")
  @Patch("translations/:id/manual-override")
  manualOverride(@Param("id") id: string, @Body() body: { title: string; content: Record<string, unknown> }) {
    return this.cms.manualOverride(id, body);
  }
}
