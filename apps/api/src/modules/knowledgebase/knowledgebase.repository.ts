import { Injectable } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";

@Injectable()
export class KnowledgebaseRepository {
  constructor(private readonly prisma: PrismaService) {}

  listPublic() {
    return this.prisma.knowledgebaseArticle.findMany({
      where: { published: true },
      orderBy: { updatedAt: "desc" }
    });
  }

  listAdmin() {
    return this.prisma.knowledgebaseArticle.findMany({
      orderBy: { updatedAt: "desc" }
    });
  }

  findPublicBySlug(slug: string) {
    return this.prisma.knowledgebaseArticle.findFirst({
      where: { published: true, slug }
    });
  }

  findById(id: string) {
    return this.prisma.knowledgebaseArticle.findUnique({ where: { id } });
  }

  create(data: Prisma.KnowledgebaseArticleUncheckedCreateInput) {
    return this.prisma.knowledgebaseArticle.create({ data });
  }

  update(id: string, data: Prisma.KnowledgebaseArticleUncheckedUpdateInput) {
    return this.prisma.knowledgebaseArticle.update({ where: { id }, data });
  }

  delete(id: string) {
    return this.prisma.knowledgebaseArticle.delete({ where: { id } });
  }
}
