import { Body, Controller, Get, Param, Patch, Post, Req, UseGuards } from "@nestjs/common";
import type { Request } from "express";
import { Roles } from "../../common/decorators/roles.decorator";
import { RolesGuard } from "../../common/guards/roles.guard";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { CustomizerService } from "./customizer.service";
import { PublishDto, SaveDraftDto, TranslateDto } from "./dto/customizer.dto";

type AuthedRequest = Request & { user: { sub: string } };

// Admin: the Customizer builder reads/saves/publishes layout docs for global pages.
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles("admin", "super_admin")
@Controller("admin/dev/customizer")
export class CustomizerAdminController {
  constructor(private readonly svc: CustomizerService) {}

  // Static route first so it never gets shadowed by ":pageId".
  @Post("translate")
  translate(@Body() dto: TranslateDto) {
    return this.svc.translate(dto.texts, dto.target, dto.source);
  }

  @Get(":pageId")
  get(@Param("pageId") pageId: string) {
    return this.svc.getPage(pageId);
  }

  @Patch(":pageId/draft")
  saveDraft(@Param("pageId") pageId: string, @Body() dto: SaveDraftDto) {
    return this.svc.saveDraft(pageId, dto.layout);
  }

  @Post(":pageId/publish")
  publish(@Req() req: AuthedRequest, @Param("pageId") pageId: string, @Body() dto: PublishDto) {
    return this.svc.publish(pageId, dto.layout, dto.label, req.user.sub);
  }

  @Get(":pageId/versions")
  versions(@Param("pageId") pageId: string) {
    return this.svc.listVersions(pageId);
  }

  @Post(":pageId/revert/:version")
  revert(@Req() req: AuthedRequest, @Param("pageId") pageId: string, @Param("version") version: string) {
    return this.svc.revert(pageId, Number(version), req.user.sub);
  }
}

// Public: the live storefront reads a custom page's published layout (Phase 3e wires it into routes).
@Controller("storefront")
export class CustomizerStorefrontController {
  constructor(private readonly svc: CustomizerService) {}

  @Get("page/:key")
  page(@Param("key") key: string) {
    return this.svc.storefrontPage(key);
  }
}
