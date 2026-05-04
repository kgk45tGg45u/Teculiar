import { Injectable, NotFoundException } from "@nestjs/common";
import { AutoTranslateDto } from "./dto/auto-translate.dto";
import { CreateContentDto } from "./dto/create-content.dto";
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

  listPosts(locale: string) {
    return this.cms.listPosts(locale);
  }

  createContent(dto: CreateContentDto, authorId: string) {
    return this.cms.createContent(dto, authorId);
  }

  updateContent(id: string, dto: Partial<CreateContentDto>) {
    return this.cms.updateContent(id, dto);
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
}
