import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
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
    private readonly translations: TranslationService
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
