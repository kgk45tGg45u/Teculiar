import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { BillingService } from "../billing/billing.service";
import { AiBlogService, type AiBlogSettings } from "./ai-blog.service";
import { AutoTranslateDto } from "./dto/auto-translate.dto";
import { CreateAnnouncementDto } from "./dto/create-announcement.dto";
import { CreateContentDto } from "./dto/create-content.dto";
import { UpdateAnnouncementDto } from "./dto/update-announcement.dto";
import { CmsRepository } from "./cms.repository";
import { TranslationService } from "./translation.service";

@Injectable()
export class CmsService {
  constructor(
    private readonly cms: CmsRepository,
    private readonly translations: TranslationService,
    private readonly aiBlog: AiBlogService,
    private readonly billing: BillingService
  ) {}

  findPage(locale: string, slug: string, countryCode?: string) {
    return this.cms.findBySlug(locale || this.translations.localeFromIp(countryCode), slug);
  }

  findPost(locale: string, slug: string) {
    return this.cms.findPublishedPost(locale, slug);
  }

  listPosts(locale: string, filters: { tag?: string } = {}) {
    return this.cms.listPosts(locale, filters);
  }

  listPostTags(locale: string) {
    return this.cms.listPostTags(locale);
  }

  listAdminPosts() {
    return this.cms.listAdminPosts();
  }

  listAdminAnnouncements() {
    return this.cms.listAdminAnnouncements();
  }

  listClientAnnouncements(userId: string, locale: string) {
    return this.cms.listClientAnnouncements(userId, locale);
  }

  markAnnouncementRead(announcementId: string, userId: string) {
    return this.cms.markAnnouncementRead(announcementId, userId);
  }

  hideAnnouncement(announcementId: string, userId: string) {
    return this.cms.hideAnnouncement(announcementId, userId);
  }

  createContent(dto: CreateContentDto, authorId: string) {
    return this.cms.createContent(dto, authorId);
  }

  createAnnouncement(dto: CreateAnnouncementDto, authorId: string) {
    return this.cms.createAnnouncement(dto, authorId);
  }

  updateAnnouncement(id: string, dto: UpdateAnnouncementDto) {
    return this.cms.updateAnnouncement(id, dto);
  }

  deleteAnnouncement(id: string) {
    return this.cms.deleteAnnouncement(id);
  }

  updateContent(id: string, dto: Partial<CreateContentDto>) {
    return this.cms.updateContent(id, dto);
  }

  deleteContent(id: string) {
    return this.cms.deleteContent(id);
  }

  async autoTranslate(dto: AutoTranslateDto) {
    const source = await this.cms.findContent(dto.sourceContentId);
    if (!source) {
      throw new NotFoundException("Source content not found");
    }

    const translated = await this.translations.translate({
      title: source.title,
      content: source.content as Record<string, unknown>,
      seoTitle: source.seoTitle,
      seoDescription: source.seoDescription,
      targetLocale: dto.targetLocale
    });

    return this.cms.createTranslation({
      sourceContentId: source.id,
      targetLocale: dto.targetLocale,
      status: "AI_DRAFT",
      ...translated
    });
  }

  manualOverride(id: string, input: { title: string; content: Record<string, unknown> }) {
    return this.cms.manualOverride(id, input);
  }

  async uploadBlogAsset(file?: { buffer: Buffer; mimetype: string; originalname?: string; size: number }) {
    if (!file) {
      throw new BadRequestException("Blog image is required.");
    }
    if (file.size > 5_000_000) {
      throw new BadRequestException("Blog image must be smaller than 5 MB.");
    }
    const extension = extensionFor(file.mimetype);
    if (!extension) {
      throw new BadRequestException("Blog image must be PNG, JPG, or WebP.");
    }

    const dir = await blogUploadsDir();
    const fileName = `${Date.now()}-${randomUUID()}${extension}`;
    await writeFile(join(dir, fileName), file.buffer);
    return { imageUrl: `/uploads/blog/${fileName}` };
  }

  // --- Blog Categories ---

  listBlogCategories(locale: string) {
    return this.cms.listBlogCategories(locale);
  }

  createBlogCategory(name: string, locale: string) {
    return this.cms.createBlogCategory(name, locale);
  }

  updateBlogCategory(id: string, name: string) {
    return this.cms.updateBlogCategory(id, name);
  }

  deleteBlogCategory(id: string) {
    return this.cms.deleteBlogCategory(id);
  }

  // --- Blog Tags ---

  listBlogTags(locale: string) {
    return this.cms.listBlogTags(locale);
  }

  createBlogTag(name: string, locale: string) {
    return this.cms.createBlogTag(name, locale);
  }

  updateBlogTag(id: string, name: string) {
    return this.cms.updateBlogTag(id, name);
  }

  deleteBlogTag(id: string) {
    return this.cms.deleteBlogTag(id);
  }

  // --- AI Blog ---

  async triggerAiBlogPost(adminId: string) {
    const settings = await this.billing.cronSettings();
    try {
      const result = await this.aiBlog.generateArticle(settings, adminId);
      return { id: result?.id, ok: true, title: result?.title };
    } catch (err) {
      // Surface the real error message so the admin sees "API key not configured"
      // instead of the generic 500 "Internal server error".
      throw new BadRequestException(err instanceof Error ? err.message : "Generation failed");
    }
  }

  async generateAiBlogPost(settings: AiBlogSettings, authorId: string) {
    // "Articles per day" is the number of articles, not raw rows. Each article creates a source
    // post plus its translation (both tagged ai_generated), so today's article count is roughly
    // half the row count returned by countAiPostsToday().
    const target = Math.max(1, Math.floor(Number(settings.aiBlogArticlesPerDay) || 3));
    const countArticlesToday = async () => Math.ceil((await this.cms.countAiPostsToday()) / 2);

    let articlesToday = await countArticlesToday();
    if (articlesToday >= target) {
      return { created: 0, reason: `Daily target of ${target} article(s) already reached (${articlesToday} today)`, skipped: true };
    }

    let resolvedAuthorId = authorId;
    if (authorId === "system") {
      const adminId = await this.cms.findFirstAdminId();
      if (!adminId) {
        return { created: 0, reason: "No admin user found to author the AI post.", skipped: true };
      }
      resolvedAuthorId = adminId;
    }

    // Catch up toward the daily target in one run. generateArticle throws on the first failure
    // (e.g. Deepseek error) so the cron logs the reason instead of silently doing nothing.
    const titles: string[] = [];
    while (articlesToday < target) {
      const result = await this.aiBlog.generateArticle(settings, resolvedAuthorId);
      if (result?.title) {
        titles.push(result.title);
      }
      const next = await countArticlesToday();
      if (next <= articlesToday) {
        break; // safety: stop if the count didn't advance, so we never loop forever
      }
      articlesToday = next;
    }

    return { created: titles.length, ok: true, titles };
  }
}

function extensionFor(mimetype: string) {
  return {
    "image/jpeg": ".jpg",
    "image/png": ".png",
    "image/webp": ".webp"
  }[mimetype];
}

async function blogUploadsDir() {
  const dir = process.cwd().endsWith("apps/api")
    ? resolve(process.cwd(), "../web/public/uploads/blog")
    : resolve(process.cwd(), "apps/web/public/uploads/blog");
  await mkdir(dir, { recursive: true });
  return dir;
}
