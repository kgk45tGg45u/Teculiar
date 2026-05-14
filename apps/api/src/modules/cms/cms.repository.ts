import { Injectable } from "@nestjs/common";
import { ContentType, Locale, Prisma, TranslationStatus } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { CreateAnnouncementDto } from "./dto/create-announcement.dto";
import { CreateContentDto } from "./dto/create-content.dto";
import { UpdateAnnouncementDto } from "./dto/update-announcement.dto";

type BlogFilters = {
  tag?: string;
};

@Injectable()
export class CmsRepository {
  constructor(private readonly prisma: PrismaService) {}

  findBySlug(locale: string, slug: string) {
    return this.prisma.content.findFirst({
      where: { slug, locale: locale as Locale, publishedAt: { not: null } },
      include: { translations: true }
    });
  }

  async findPublishedPost(locale: string, slug: string) {
    const post = await this.prisma.content.findFirst({
      where: {
        NOT: { slug: { startsWith: "announcement-" } },
        locale: localeFrom(locale),
        publishedAt: { lte: new Date() },
        slug,
        type: "POST"
      }
    });
    return post ? normalizeBlogPost(post) : null;
  }

  async listPosts(locale: string, filters: BlogFilters = {}) {
    const rows = await this.prisma.content.findMany({
      where: {
        NOT: { slug: { startsWith: "announcement-" } },
        type: "POST",
        locale: localeFrom(locale),
        publishedAt: { lte: new Date() }
      },
      orderBy: { publishedAt: "desc" }
    });

    const posts = rows.map(normalizeBlogPost);
    const tag = filters.tag?.trim().toLowerCase();
    return tag ? posts.filter((post) => post.tags.some((item) => item.toLowerCase() === tag)) : posts;
  }

  async listPostTags(locale: string) {
    const posts = await this.listPosts(locale);
    return Array.from(new Set(posts.flatMap((post) => post.tags))).sort((a, b) => a.localeCompare(b));
  }

  async listAdminPosts() {
    const rows = await this.prisma.content.findMany({
      where: {
        NOT: { slug: { startsWith: "announcement-" } },
        type: "POST"
      },
      orderBy: { updatedAt: "desc" }
    });
    return rows.map(normalizeBlogPost);
  }

  listAdminAnnouncements() {
    return this.prisma.announcement.findMany({
      orderBy: { publishedAt: "desc" },
      take: 100
    });
  }

  createContent(dto: CreateContentDto, authorId: string) {
    return this.prisma.content.create({
      data: {
        ...dto,
        type: dto.type as ContentType,
        locale: localeFrom(dto.locale),
        content: dto.content as Prisma.InputJsonValue,
        authorId,
        publishedAt: (dto.content as { published?: boolean }).published || dto.type === "LEGAL" ? new Date() : null
      }
    });
  }

  createAnnouncement(dto: CreateAnnouncementDto, authorId: string) {
    return this.prisma.announcement.create({
      data: {
        authorId,
        body: dto.body,
        excerpt: dto.excerpt,
        locale: localeFrom(dto.locale),
        publishedAt: dto.publishedAt ? new Date(dto.publishedAt) : new Date(),
        title: dto.title
      }
    });
  }

  updateAnnouncement(id: string, dto: UpdateAnnouncementDto) {
    return this.prisma.announcement.update({
      where: { id },
      data: {
        body: dto.body,
        excerpt: dto.excerpt,
        locale: dto.locale ? localeFrom(dto.locale) : undefined,
        publishedAt: dto.publishedAt ? new Date(dto.publishedAt) : undefined,
        title: dto.title
      }
    });
  }

  deleteAnnouncement(id: string) {
    return this.prisma.announcement.delete({ where: { id } });
  }

  async listClientAnnouncements(userId: string, locale: string) {
    const rows = await this.prisma.announcement.findMany({
      where: {
        locale: localeFrom(locale),
        publishedAt: { lte: new Date() },
        reads: { none: { hiddenAt: { not: null }, userId } }
      },
      include: { reads: { where: { userId }, take: 1 } },
      orderBy: { publishedAt: "desc" },
      take: 10
    });

    return rows.map((row) => {
      const read = row.reads[0];
      const { reads: _reads, ...announcement } = row;
      return {
        ...announcement,
        hiddenAt: read?.hiddenAt ?? null,
        isRead: Boolean(read?.readAt),
        readAt: read?.readAt ?? null
      };
    });
  }

  markAnnouncementRead(announcementId: string, userId: string) {
    return this.prisma.announcementRead.upsert({
      where: { announcementId_userId: { announcementId, userId } },
      create: { announcementId, userId },
      update: { readAt: new Date() }
    });
  }

  hideAnnouncement(announcementId: string, userId: string) {
    const now = new Date();
    return this.prisma.announcementRead.upsert({
      where: { announcementId_userId: { announcementId, userId } },
      create: { announcementId, hiddenAt: now, readAt: now, userId },
      update: { hiddenAt: now, readAt: now }
    });
  }

  async updateContent(id: string, dto: Partial<CreateContentDto>) {
    const current = await this.prisma.content.findUnique({ where: { id }, select: { publishedAt: true } });
    const content = dto.content as { published?: boolean } | undefined;
    const changesPublishedState = content && Object.prototype.hasOwnProperty.call(content, "published");

    return this.prisma.content.update({
      where: { id },
      data: {
        ...dto,
        type: dto.type ? (dto.type as ContentType) : undefined,
        locale: dto.locale ? localeFrom(dto.locale) : undefined,
        content: dto.content ? (dto.content as Prisma.InputJsonValue) : undefined,
        publishedAt: changesPublishedState ? (content?.published ? current?.publishedAt ?? new Date() : null) : undefined
      }
    });
  }

  deleteContent(id: string) {
    return this.prisma.content.delete({ where: { id } });
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

function localeFrom(value?: string) {
  return value === "en" ? Locale.en : Locale.de;
}

function normalizeBlogPost<T extends { content: Prisma.JsonValue }>(post: T) {
  const content = isRecord(post.content) ? post.content : {};
  const tags = stringArray(content.tags);
  const fallbackTags = tags.length ? tags : stringArray(content.keywords);
  const featureImage = stringValue(content.featureImage) ?? stringArray(content.images)[0] ?? null;
  return {
    ...post,
    category: stringValue(content.category),
    featureImage,
    tags: fallbackTags
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function stringValue(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function stringArray(value: unknown) {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string" && item.trim().length > 0).map((item) => item.trim()) : [];
}
