import { Injectable } from "@nestjs/common";

@Injectable()
export class TranslationService {
  async translate(input: {
    title: string;
    content: Record<string, unknown>;
    seoTitle?: string | null;
    seoDescription?: string | null;
    targetLocale: string;
  }) {
    return {
      title: `[${input.targetLocale}] ${input.title}`,
      content: {
        ...input.content,
        translatedBy: "ai-placeholder",
        targetLocale: input.targetLocale
      },
      seoTitle: input.seoTitle ? `[${input.targetLocale}] ${input.seoTitle}` : undefined,
      seoDescription: input.seoDescription ?? undefined
    };
  }

  localeFromIp(countryCode?: string) {
    return countryCode?.toUpperCase() === "DE" ? "de" : "en";
  }
}
