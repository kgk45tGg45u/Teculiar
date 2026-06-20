import { Injectable } from "@nestjs/common";
import { ContentType, Locale, Prisma, TranslationStatus } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { CreateAnnouncementDto } from "./dto/create-announcement.dto";
import { CreateContentDto } from "./dto/create-content.dto";
import { UpdateAnnouncementDto } from "./dto/update-announcement.dto";

type BlogFilters = {
  tag?: string;
};

const POST_RELATIONS = {
  blogCategories: { include: { category: true } },
  blogTags: { include: { tag: true } }
};

@Injectable()
export class CmsRepository {
  constructor(private readonly prisma: PrismaService) {}

  findBySlug(locale: string, slug: string) {
    return this.prisma.content.findFirst({
      where: { slug, locale, publishedAt: { not: null } },
      include: { translations: true, ...POST_RELATIONS }
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
      },
      include: POST_RELATIONS
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
      include: POST_RELATIONS,
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
      include: POST_RELATIONS,
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

  async createContent(dto: CreateContentDto, authorId: string) {
    const isPublished = (dto.content as { published?: boolean }).published || dto.type === "LEGAL";
    const post = await this.prisma.content.create({
      data: {
        type: dto.type as ContentType,
        slug: dto.slug,
        locale: localeFrom(dto.locale),
        title: dto.title,
        excerpt: dto.excerpt,
        content: dto.content as Prisma.InputJsonValue,
        seoTitle: dto.seoTitle,
        seoDescription: dto.seoDescription,
        authorId,
        publishedAt: isPublished ? new Date() : null
      }
    });

    if (dto.categoryIds?.length) {
      await this.prisma.contentCategory.createMany({
        data: dto.categoryIds.map((categoryId) => ({ contentId: post.id, categoryId })),
        skipDuplicates: true
      });
    }
    if (dto.tagIds?.length) {
      await this.prisma.contentTag.createMany({
        data: dto.tagIds.map((tagId) => ({ contentId: post.id, tagId })),
        skipDuplicates: true
      });
    }

    return this.prisma.content.findUnique({ where: { id: post.id }, include: POST_RELATIONS });
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

    await this.prisma.content.update({
      where: { id },
      data: {
        type: dto.type ? (dto.type as ContentType) : undefined,
        slug: dto.slug,
        locale: dto.locale ? localeFrom(dto.locale) : undefined,
        title: dto.title,
        excerpt: dto.excerpt,
        content: dto.content ? (dto.content as Prisma.InputJsonValue) : undefined,
        seoTitle: dto.seoTitle,
        seoDescription: dto.seoDescription,
        publishedAt: changesPublishedState ? (content?.published ? current?.publishedAt ?? new Date() : null) : undefined
      }
    });

    if (dto.categoryIds !== undefined) {
      await this.prisma.contentCategory.deleteMany({ where: { contentId: id } });
      if (dto.categoryIds.length) {
        await this.prisma.contentCategory.createMany({
          data: dto.categoryIds.map((categoryId) => ({ contentId: id, categoryId })),
          skipDuplicates: true
        });
      }
    }
    if (dto.tagIds !== undefined) {
      await this.prisma.contentTag.deleteMany({ where: { contentId: id } });
      if (dto.tagIds.length) {
        await this.prisma.contentTag.createMany({
          data: dto.tagIds.map((tagId) => ({ contentId: id, tagId })),
          skipDuplicates: true
        });
      }
    }

    return this.prisma.content.findUnique({ where: { id }, include: POST_RELATIONS });
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

  // --- BlogCategory CRUD ---

  listBlogCategories(locale: string) {
    return this.prisma.blogCategory.findMany({ where: { locale }, orderBy: { name: "asc" } });
  }

  createBlogCategory(name: string, locale: string) {
    const slug = slugify(name);
    return this.prisma.blogCategory.create({ data: { name, slug, locale } });
  }

  updateBlogCategory(id: string, name: string) {
    const slug = slugify(name);
    return this.prisma.blogCategory.update({ where: { id }, data: { name, slug } });
  }

  deleteBlogCategory(id: string) {
    return this.prisma.blogCategory.delete({ where: { id } });
  }

  // --- BlogTag CRUD ---

  listBlogTags(locale: string) {
    return this.prisma.blogTag.findMany({ where: { locale }, orderBy: { name: "asc" } });
  }

  createBlogTag(name: string, locale: string) {
    const slug = slugify(name);
    return this.prisma.blogTag.create({ data: { name, slug, locale } });
  }

  updateBlogTag(id: string, name: string) {
    const slug = slugify(name);
    return this.prisma.blogTag.update({ where: { id }, data: { name, slug } });
  }

  deleteBlogTag(id: string) {
    return this.prisma.blogTag.delete({ where: { id } });
  }

  async findOrCreateTag(name: string, locale: string) {
    const slug = slugify(name);
    return this.prisma.blogTag.upsert({
      where: { slug_locale: { slug, locale } },
      create: { name, slug, locale },
      update: {}
    });
  }

  async findOrCreateCategory(name: string, locale: string) {
    const slug = slugify(name);
    return this.prisma.blogCategory.upsert({
      where: { slug_locale: { slug, locale } },
      create: { name, slug, locale },
      update: {}
    });
  }

  findFirstAdminId() {
    return this.prisma.userRole.findFirst({
      where: { role: { slug: { in: ["admin", "super_admin"] } } },
      select: { userId: true },
      orderBy: { user: { createdAt: "asc" } }
    }).then((row) => row?.userId ?? null);
  }

  countAiPostsToday() {
    const start = new Date();
    start.setHours(0, 0, 0, 0);
    const end = new Date();
    end.setHours(23, 59, 59, 999);
    return this.prisma.content.count({
      where: {
        type: "POST",
        createdAt: { gte: start, lte: end },
        // MySQL JSON filters require a string path ("$.postType"); the array form
        // (["postType"]) is PostgreSQL-only and throws "Expected String, provided (String)".
        content: { path: "$.postType", equals: "ai_generated" }
      }
    });
  }
}

function localeFrom(value?: string) {
  return value === "en" ? Locale.en : Locale.de;
}

function slugify(text: string) {
  return text
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, "")
    .replace(/[\s_-]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

type PostWithRelations = Prisma.ContentGetPayload<{
  include: {
    blogCategories: { include: { category: true } };
    blogTags: { include: { tag: true } };
  };
}>;

function normalizeBlogPost(post: PostWithRelations) {
  const content = isRecord(post.content) ? post.content : {};

  const dbCategories = post.blogCategories?.map((bc) => bc.category.name) ?? [];
  const dbTags = post.blogTags?.map((bt) => bt.tag.name) ?? [];

  const categories = dbCategories.length ? dbCategories : (stringValue(content.category) ? [stringValue(content.category)!] : []);
  const tags = dbTags.length ? dbTags : stringArray(content.tags).length ? stringArray(content.tags) : stringArray(content.keywords);

  const categoryIds = post.blogCategories?.map((bc) => bc.categoryId) ?? [];
  const tagIds = post.blogTags?.map((bt) => bt.tagId) ?? [];

  const featureImage = stringValue(content.featureImage) ?? stringArray(content.images)[0] ?? null;
  return {
    ...post,
    category: categories[0] ?? null,
    categories,
    categoryIds,
    featureImage,
    tagIds,
    tags
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
