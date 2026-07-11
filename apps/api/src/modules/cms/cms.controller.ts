import { Body, Controller, Delete, Get, Headers, Param, Patch, Post, Query, Req, UploadedFile, UseGuards, UseInterceptors } from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import type { Request } from "express";
import { Roles } from "../../common/decorators/roles.decorator";
import { RolesGuard } from "../../common/guards/roles.guard";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { CmsService } from "./cms.service";
import { AutoTranslateDto } from "./dto/auto-translate.dto";
import { CreateAnnouncementDto } from "./dto/create-announcement.dto";
import { CreateContentDto } from "./dto/create-content.dto";
import { UpdateAnnouncementDto } from "./dto/update-announcement.dto";

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
  listPosts(@Query("locale") locale = "de", @Query("tag") tag?: string) {
    return this.cms.listPosts(locale, { tag });
  }

  @Get("posts/:locale/:slug")
  getPost(@Param("locale") locale: string, @Param("slug") slug: string) {
    return this.cms.findPost(locale, slug);
  }

  @Get("post-tags")
  listPostTags(@Query("locale") locale = "de", @Query("limit") limit?: string) {
    const parsed = Number.parseInt(limit ?? "", 10);
    return this.cms.listPostTags(locale, Number.isFinite(parsed) && parsed > 0 ? Math.min(parsed, 50) : undefined);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles("admin", "staff", "editor", "super_admin", "support_agent")
  @Get("admin/dev/posts")
  listAdminPosts() {
    return this.cms.listAdminPosts();
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles("admin", "staff", "editor", "super_admin", "support_agent")
  @Get("admin/dev/announcements")
  listAdminAnnouncements() {
    return this.cms.listAdminAnnouncements();
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles("admin", "staff", "editor", "super_admin", "support_agent")
  @Post("admin/dev/announcements")
  createAnnouncement(@Req() request: Request & { user: { sub: string } }, @Body() dto: CreateAnnouncementDto) {
    return this.cms.createAnnouncement(dto, request.user.sub);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles("admin", "staff", "editor", "super_admin", "support_agent")
  @Patch("admin/dev/announcements/:id")
  updateAnnouncement(@Param("id") id: string, @Body() dto: UpdateAnnouncementDto) {
    return this.cms.updateAnnouncement(id, dto);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles("admin", "staff", "editor", "super_admin", "support_agent")
  @Delete("admin/dev/announcements/:id")
  deleteAnnouncement(@Param("id") id: string) {
    return this.cms.deleteAnnouncement(id);
  }

  @UseGuards(JwtAuthGuard)
  @Get("announcements")
  listAnnouncements(@Req() request: Request & { user: { sub: string } }, @Query("locale") locale = "de") {
    return this.cms.listClientAnnouncements(request.user.sub, locale);
  }

  @UseGuards(JwtAuthGuard)
  @Post("announcements/:id/read")
  markAnnouncementRead(@Req() request: Request & { user: { sub: string } }, @Param("id") id: string) {
    return this.cms.markAnnouncementRead(id, request.user.sub);
  }

  @UseGuards(JwtAuthGuard)
  @Post("announcements/:id/hide")
  hideAnnouncement(@Req() request: Request & { user: { sub: string } }, @Param("id") id: string) {
    return this.cms.hideAnnouncement(id, request.user.sub);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles("admin", "staff", "editor", "super_admin", "support_agent")
  @Post("admin/dev/blog-assets")
  @UseInterceptors(FileInterceptor("image"))
  uploadBlogAsset(@UploadedFile() file?: { buffer: Buffer; mimetype: string; originalname?: string; size: number }) {
    return this.cms.uploadBlogAsset(file);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles("admin", "super_admin", "support_agent")
  @Post("admin/dev/ai-blog/generate")
  generateAiBlogPost(@Req() request: Request & { user: { sub: string } }) {
    return this.cms.triggerAiBlogPost(request.user.sub);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles("admin", "staff", "editor", "super_admin", "support_agent")
  @Post("pages")
  createContent(@Req() request: Request & { user: { sub: string } }, @Body() dto: CreateContentDto) {
    return this.cms.createContent(dto, request.user.sub);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles("admin", "staff", "editor", "super_admin", "support_agent")
  @Post("posts")
  createPost(@Req() request: Request & { user: { sub: string } }, @Body() dto: CreateContentDto) {
    return this.cms.createContent({ ...dto, type: "POST" }, request.user.sub);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles("admin", "staff", "editor", "super_admin", "support_agent")
  @Patch("pages/:id")
  updateContent(@Param("id") id: string, @Body() dto: Partial<CreateContentDto>) {
    return this.cms.updateContent(id, dto);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles("admin", "staff", "editor", "super_admin", "support_agent")
  @Delete("pages/:id")
  deleteContent(@Param("id") id: string) {
    return this.cms.deleteContent(id);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles("admin", "staff", "editor", "super_admin", "support_agent")
  @Post("translations/auto")
  autoTranslate(@Body() dto: AutoTranslateDto) {
    return this.cms.autoTranslate(dto);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles("admin", "staff", "editor", "super_admin", "support_agent")
  @Patch("translations/:id/manual-override")
  manualOverride(@Param("id") id: string, @Body() body: { title: string; content: Record<string, unknown> }) {
    return this.cms.manualOverride(id, body);
  }

  // --- Blog Categories ---

  @Get("blog-categories")
  listBlogCategories(@Query("locale") locale = "de") {
    return this.cms.listBlogCategories(locale);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles("admin", "staff", "editor", "super_admin", "support_agent")
  @Post("admin/dev/blog-categories")
  createBlogCategory(@Body() body: { name: string; locale?: string }) {
    return this.cms.createBlogCategory(body.name, body.locale || "de");
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles("admin", "staff", "editor", "super_admin", "support_agent")
  @Patch("admin/dev/blog-categories/:id")
  updateBlogCategory(@Param("id") id: string, @Body() body: { name: string }) {
    return this.cms.updateBlogCategory(id, body.name);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles("admin", "staff", "editor", "super_admin", "support_agent")
  @Delete("admin/dev/blog-categories/:id")
  deleteBlogCategory(@Param("id") id: string) {
    return this.cms.deleteBlogCategory(id);
  }

  // --- Blog Tags ---

  @Get("blog-tags")
  listBlogTags(@Query("locale") locale = "de") {
    return this.cms.listBlogTags(locale);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles("admin", "staff", "editor", "super_admin", "support_agent")
  @Post("admin/dev/blog-tags")
  createBlogTag(@Body() body: { name: string; locale?: string }) {
    return this.cms.createBlogTag(body.name, body.locale || "de");
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles("admin", "staff", "editor", "super_admin", "support_agent")
  @Patch("admin/dev/blog-tags/:id")
  updateBlogTag(@Param("id") id: string, @Body() body: { name: string }) {
    return this.cms.updateBlogTag(id, body.name);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles("admin", "staff", "editor", "super_admin", "support_agent")
  @Delete("admin/dev/blog-tags/:id")
  deleteBlogTag(@Param("id") id: string) {
    return this.cms.deleteBlogTag(id);
  }
}
