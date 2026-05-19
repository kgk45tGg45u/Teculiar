import { Body, Controller, Delete, Get, Param, Patch, Post, Query, Req, UseGuards } from "@nestjs/common";
import type { Request } from "express";
import { Roles } from "../../common/decorators/roles.decorator";
import { RolesGuard } from "../../common/guards/roles.guard";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { UpsertArticleDto } from "./dto/upsert-article.dto";
import { KnowledgebaseService } from "./knowledgebase.service";

@Controller("knowledgebase")
export class KnowledgebaseController {
  constructor(private readonly knowledgebase: KnowledgebaseService) {}

  @Get()
  listPublic() {
    return this.knowledgebase.listPublic();
  }

  @Get("suggest")
  suggest(@Query("q") query = "") {
    return this.knowledgebase.suggestArticles(query);
  }

  @Get(":slug")
  getPublic(@Param("slug") slug: string) {
    return this.knowledgebase.getPublic(slug);
  }
}

@UseGuards(JwtAuthGuard, RolesGuard)
@Roles("admin", "staff", "editor")
@Controller("admin/dev/knowledgebase")
export class KnowledgebaseAdminController {
  constructor(private readonly knowledgebase: KnowledgebaseService) {}

  @Get()
  listAdmin() {
    return this.knowledgebase.listAdmin();
  }

  @Post()
  create(@Req() request: Request & { user: { sub: string } }, @Body() dto: UpsertArticleDto) {
    return this.knowledgebase.createArticle(dto, request.user.sub);
  }

  @Patch(":id")
  update(@Param("id") id: string, @Body() dto: UpsertArticleDto) {
    return this.knowledgebase.updateArticle(id, dto);
  }

  @Delete(":id")
  delete(@Param("id") id: string) {
    return this.knowledgebase.deleteArticle(id);
  }
}
