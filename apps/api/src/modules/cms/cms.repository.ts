import { Injectable } from "@nestjs/common";
import { ContentType, Locale, Prisma, TranslationStatus } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { CreateContentDto } from "./dto/create-content.dto";

@Injectable()
export class CmsRepository {
  constructor(private readonly prisma: PrismaService) {}

  findBySlug(locale: string, slug: string) {
    return this.prisma.content.findFirst({
      where: { slug, locale: locale as Locale, publishedAt: { not: null } },
      include: { translations: true }
    });
  }

  listPosts(locale: string) {
    return this.prisma.content.findMany({
      where: { type: "POST", locale: locale as Locale, publishedAt: { not: null } },
      orderBy: { publishedAt: "desc" }
    });
  }

  listAnnouncements(locale: string) {
    return this.prisma.content.findMany({
      where: { type: "POST", locale: locale as Locale, slug: { startsWith: "announcement-" }, publishedAt: { not: null } },
      orderBy: { publishedAt: "desc" },
      take: 5
    });
  }

  createContent(dto: CreateContentDto, authorId: string) {
    return this.prisma.content.create({
      data: {
        ...dto,
        type: dto.type as ContentType,
        locale: dto.locale as Locale,
        content: dto.content as Prisma.InputJsonValue,
        authorId,
        publishedAt: (dto.content as { published?: boolean }).published || dto.type === "LEGAL" ? new Date() : null
      }
    });
  }

  async createAnnouncement(dto: CreateContentDto) {
    const author = await this.prisma.user.findFirst({ orderBy: { createdAt: "asc" } });
    if (!author) {
      throw new Error("Create one admin/user before writing announcements");
    }

    return this.prisma.content.create({
      data: {
        ...dto,
        type: "POST",
        locale: dto.locale as Locale,
        slug: dto.slug.startsWith("announcement-") ? dto.slug : `announcement-${dto.slug}`,
        content: dto.content as Prisma.InputJsonValue,
        authorId: author.id,
        publishedAt: new Date()
      }
    });
  }

  updateContent(id: string, dto: Partial<CreateContentDto>) {
    return this.prisma.content.update({
      where: { id },
      data: {
        ...dto,
        type: dto.type ? (dto.type as ContentType) : undefined,
        locale: dto.locale ? (dto.locale as Locale) : undefined,
        content: dto.content ? (dto.content as Prisma.InputJsonValue) : undefined
      }
    });
  }

  findContent(id: string) {
    return this.prisma.content.findUnique({ where: { id } });
  }

  createTranslation(input: {
    sourceContentId: string;
    targetLocale: string;
    title: string;
    content: Record<string, unknown>;
    seoTitle?: string;
    seoDescription?: string;
    status: string;
  }) {
    return this.prisma.translation.create({
      data: {
        ...input,
        targetLocale: input.targetLocale as Locale,
        content: input.content as Prisma.InputJsonValue,
        status: input.status as TranslationStatus
      }
    });
  }

  manualOverride(id: string, input: { title: string; content: Record<string, unknown> }) {
    return this.prisma.translation.update({
      where: { id },
      data: {
        ...input,
        content: input.content as Prisma.InputJsonValue,
        status: "MANUAL_OVERRIDE",
        reviewedAt: new Date()
      }
    });
  }
}
