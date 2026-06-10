import { Injectable, Logger } from "@nestjs/common";
import { CmsRepository } from "./cms.repository";

export type AiBlogSettings = {
  deepseekApiKey?: string;
  aiBlogEnabled?: boolean;
  aiBlogArticlesPerDay?: number;
  aiBlogIntervalHours?: number;
  aiBlogWordCount?: number;
  aiBlogLanguage?: string;
  aiBlogTopicsPool?: string;
  aiBlogTitlePrompt?: string;
  aiBlogContentPrompt?: string;
  aiBlogExcerptPrompt?: string;
  aiBlogTagsPrompt?: string;
  aiBlogKeywordsPrompt?: string;
};

type DeepseekMessage = { role: "system" | "user" | "assistant"; content: string };

type ArticleJson = {
  title: string;
  slug: string;
  excerpt: string;
  body: string;
  tags: string[];
  seoTitle: string;
  seoDescription: string;
};

@Injectable()
export class AiBlogService {
  private readonly logger = new Logger(AiBlogService.name);

  constructor(private readonly cms: CmsRepository) {}

  async generateArticle(settings: AiBlogSettings, authorId: string) {
    const apiKey = settings.deepseekApiKey?.trim();
    if (!apiKey) {
      throw new Error("Deepseek API key is not configured.");
    }

    const topicsRaw = (settings.aiBlogTopicsPool ?? "").trim();
    if (!topicsRaw) {
      throw new Error("Topics pool is empty — add at least one topic in AI Content settings.");
    }

    const topics = topicsRaw.split("\n").map((t) => t.trim()).filter(Boolean);
    if (!topics.length) {
      throw new Error("Topics pool has no valid topics after trimming.");
    }
    const topic = topics[Math.floor(Math.random() * topics.length)];

    const rawLang = settings.aiBlogLanguage || "de";
    const language = rawLang === "random" ? (Math.random() < 0.5 ? "de" : "en") : rawLang;
    const wordCount = settings.aiBlogWordCount || 800;

    // Fetch existing titles to avoid duplicates
    const existingPosts = await this.cms.listAdminPosts();
    const existingTitles = existingPosts.slice(0, 30).map((p) => p.title).join("\n- ");

    // Step 1: Find a fresh angle (plain text response)
    const lang = language === "de" ? "German" : "English";
    this.logger.log(`AI blog: generating article for topic="${topic}" in ${lang}`);

    const angleSuggestion = await this.callDeepseek(apiKey, [
      {
        role: "system",
        content: `You are a content strategist for a web hosting company blog. Respond only in ${lang}.`
      },
      {
        role: "user",
        content: [
          `Topic area: "${topic}"`,
          existingTitles ? `\nExisting article titles (avoid overlap):\n- ${existingTitles}` : "",
          `\nSuggest ONE specific, SEO-friendly article angle that has not been covered yet.`,
          `Reply with ONLY the article angle as a single sentence — no explanation, no punctuation except within the sentence.`
        ].join("")
      }
    ], "text");

    const angle = angleSuggestion.trim();
    this.logger.log(`AI blog: angle="${angle}"`);

    // Step 2: Write the full article (JSON mode for reliable parsing)
    const systemPrompt = buildSystemPrompt(settings, language, wordCount);
    const articlePromptMessages: DeepseekMessage[] = [
      { role: "system", content: systemPrompt },
      {
        role: "user",
        content: [
          `Write a complete blog article about: "${angle}"`,
          ``,
          `Return a JSON object with these exact keys:`,
          `- title: engaging article title`,
          `- slug: URL-friendly slug (lowercase, hyphens, max 80 chars)`,
          `- excerpt: 150-200 character summary`,
          `- body: full HTML article content using <h2>, <h3>, <p>, <ul>, <li>, <strong> tags`,
          `- tags: array of 3-5 lowercase tag strings`,
          `- seoTitle: SEO-optimized title (max 65 chars)`,
          `- seoDescription: meta description (150-160 chars)`
        ].join("\n")
      }
    ];

    let article: ArticleJson | null = null;
    for (let attempt = 1; attempt <= 3; attempt++) {
      const articleRaw = await this.callDeepseek(apiKey, articlePromptMessages, "json_object");
      article = parseArticleJson(articleRaw);
      if (article) break;
      this.logger.warn(`AI blog: invalid JSON on attempt ${attempt} for angle="${angle}". Raw: ${articleRaw.slice(0, 200)}`);
    }
    if (!article) {
      throw new Error(`Deepseek returned invalid JSON for article about: ${angle}`);
    }

    this.logger.log(`AI blog: article title="${article.title}"`);

    // Resolve or create tags in DB for the article's locale
    const tagIds = await this.resolveTagIds(article.tags, language);

    // Pick a random category for this locale if any exist
    const categories = await this.cms.listBlogCategories(language);
    const categoryIds: string[] = [];
    const randomCategory = categories.length ? categories[Math.floor(Math.random() * categories.length)] : undefined;
    if (randomCategory) {
      categoryIds.push(randomCategory.id);
    }

    const created = await this.cms.createContent(
      {
        categoryIds,
        content: {
          body: article.body,
          featureImage: "",
          images: [],
          postType: "ai_generated",
          published: true,
          tags: article.tags
        },
        excerpt: article.excerpt,
        locale: language,
        seoDescription: article.seoDescription,
        seoTitle: article.seoTitle || article.title,
        slug: article.slug || slugify(article.title),
        tagIds,
        title: article.title,
        type: "POST"
      },
      authorId
    );

    if (!created) {
      throw new Error("Failed to save AI-generated blog post to database.");
    }

    this.logger.log(`AI blog: saved post id="${created.id}" locale="${language}"`);

    // Step 3: Translate
    const targetLocale = language === "de" ? "en" : "de";
    await this.translateAndSave(apiKey, created.id, article, targetLocale, lang, authorId);

    return created;
  }

  private async translateAndSave(
    apiKey: string,
    sourceContentId: string,
    article: ArticleJson,
    targetLocale: string,
    sourceLang: string,
    authorId: string
  ) {
    const targetLang = targetLocale === "de" ? "German" : "English";
    this.logger.log(`AI blog: translating post ${sourceContentId} to ${targetLang}`);

    const translationRaw = await this.callDeepseek(apiKey, [
      {
        role: "system",
        content: `You are a professional translator. Translate the provided blog article JSON from ${sourceLang} to ${targetLang}. Keep all HTML tags intact. Return JSON with the same keys as the input.`
      },
      {
        role: "user",
        content: JSON.stringify({
          title: article.title,
          slug: article.slug,
          excerpt: article.excerpt,
          body: article.body,
          tags: article.tags,
          seoTitle: article.seoTitle,
          seoDescription: article.seoDescription
        })
      }
    ], "json_object").catch((err) => {
      this.logger.warn(`AI blog: translation failed — ${String(err)}`);
      return null;
    });

    if (!translationRaw) return;
    const translated = parseArticleJson(translationRaw);
    if (!translated) {
      this.logger.warn(`AI blog: translation JSON parse failed`);
      return;
    }

    // Resolve tags and pick category for the target locale
    const targetTagIds = await this.resolveTagIds(translated.tags, targetLocale);
    const targetCategories = await this.cms.listBlogCategories(targetLocale);
    const targetCategory = targetCategories.length
      ? targetCategories[Math.floor(Math.random() * targetCategories.length)]
      : undefined;

    const translatedSlug = translated.slug?.trim() || (article.slug || slugify(translated.title));

    await this.cms.createContent(
      {
        categoryIds: targetCategory ? [targetCategory.id] : [],
        content: {
          body: translated.body,
          featureImage: "",
          images: [],
          postType: "ai_generated",
          published: true,
          tags: translated.tags
        },
        excerpt: translated.excerpt || "",
        locale: targetLocale,
        seoDescription: translated.seoDescription || "",
        seoTitle: translated.seoTitle || translated.title,
        slug: translatedSlug,
        tagIds: targetTagIds,
        title: translated.title,
        type: "POST"
      },
      authorId
    );

    this.logger.log(`AI blog: translation saved for post ${sourceContentId}`);
  }

  private async resolveTagIds(tagNames: string[], locale: string) {
    const ids: string[] = [];
    for (const name of tagNames.slice(0, 5)) {
      const trimmed = name.trim().toLowerCase();
      if (!trimmed) continue;
      try {
        const tag = await this.cms.findOrCreateTag(trimmed, locale);
        if (tag) ids.push(tag.id);
      } catch {
        this.logger.warn(`AI blog: could not resolve tag "${trimmed}" (locale=${locale})`);
      }
    }
    return ids;
  }

  async callDeepseek(apiKey: string, messages: DeepseekMessage[], responseFormat: "text" | "json_object" = "text") {
    const response = await fetch("https://api.deepseek.com/chat/completions", {
      body: JSON.stringify({
        messages,
        model: "deepseek-chat",
        response_format: { type: responseFormat },
        temperature: 0.7,
        max_tokens: 4096
      }),
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/json"
      },
      method: "POST"
    });

    if (!response.ok) {
      const text = await response.text().catch(() => "");
      throw new Error(`Deepseek API error ${response.status}: ${text.slice(0, 300)}`);
    }

    const data = await response.json() as { choices?: Array<{ message?: { content?: string } }>; error?: { message?: string } };

    if (data.error?.message) {
      throw new Error(`Deepseek API error: ${data.error.message}`);
    }

    const content = data.choices?.[0]?.message?.content;
    if (!content) {
      throw new Error("Deepseek returned empty content.");
    }
    return content;
  }
}

function buildSitePages(locale: string): string {
  const base = `/${locale}`;
  const pages = locale === "de"
    ? [
        ["Web Hosting Pakete", `${base}/webhosting`],
        ["VPS Server", `${base}/vps`],
        ["Virtual Server", `${base}/virtual-servers`],
        ["Managed Hosting", `${base}/hosting`],
        ["Domain Registrierung", `${base}/domains`],
        ["Domain Preisliste", `${base}/domains/pricing`],
        ["Preisübersicht", `${base}/pricing`],
        ["Webdesign Service", `${base}/webdesign`],
        ["IT Lösungen", `${base}/it-losungen`],
        ["Blog", `${base}/blog`],
        ["Kontakt", `${base}/kontakt`],
        ["Über uns", `${base}/uber-uns`],
      ]
    : [
        ["Web Hosting Packages", `${base}/webhosting`],
        ["VPS Servers", `${base}/vps`],
        ["Virtual Servers", `${base}/virtual-servers`],
        ["Managed Hosting", `${base}/hosting`],
        ["Domain Registration", `${base}/domains`],
        ["Domain Pricing", `${base}/domains/pricing`],
        ["Pricing", `${base}/pricing`],
        ["Web Design", `${base}/webdesign`],
        ["Blog", `${base}/blog`],
        ["Contact", `${base}/contact`],
        ["About Us", `${base}/about`],
      ];
  return pages.map(([title, url]) => `- [${title}](${url})`).join("\n");
}

function buildSystemPrompt(settings: AiBlogSettings, language: string, wordCount: number) {
  const lang = language === "de" ? "German" : "English";
  return [
    `You are an expert blog writer for a professional web hosting company. Write ALL content in ${lang}. Always respond with valid JSON.`,
    `Target article length: approximately ${wordCount} words.`,
    `Write body content as HTML (use <h2>, <h3>, <p>, <ul>, <li>, <strong> tags appropriately).`,
    settings.aiBlogTitlePrompt
      ? `Title guidance: ${settings.aiBlogTitlePrompt}`
      : "Titles should be clear, specific, and SEO-optimized.",
    settings.aiBlogContentPrompt
      ? `Content guidance: ${settings.aiBlogContentPrompt}`
      : "Content should be practical, well-structured, and valuable for web hosting customers.",
    settings.aiBlogExcerptPrompt
      ? `Excerpt guidance: ${settings.aiBlogExcerptPrompt}`
      : "Excerpt should be 150-200 characters, engaging and informative.",
    settings.aiBlogTagsPrompt
      ? `Tags guidance: ${settings.aiBlogTagsPrompt}`
      : "Provide 3-5 relevant lowercase tags.",
    settings.aiBlogKeywordsPrompt
      ? `Keywords/SEO guidance: ${settings.aiBlogKeywordsPrompt}`
      : "Optimize for search engines with natural keyword usage.",
    `IMPORTANT: When linking to pages on this website, ONLY use these exact URLs (never invent URLs):\n${buildSitePages(language)}`
  ].join("\n");
}

function parseArticleJson(raw: string): ArticleJson | null {
  try {
    // Try direct parse first (json_object mode returns clean JSON)
    let parsed: Record<string, unknown>;
    try {
      parsed = JSON.parse(raw) as Record<string, unknown>;
    } catch {
      // Fallback: extract JSON from markdown code fences or prose
      const match = raw.match(/```(?:json)?\s*([\s\S]*?)```/) ?? raw.match(/(\{[\s\S]*\})/);
      if (!match) return null;
      parsed = JSON.parse(match[1] ?? match[0]) as Record<string, unknown>;
    }

    if (typeof parsed.title !== "string" || !parsed.title) return null;
    if (typeof parsed.body !== "string" || !parsed.body) return null;

    return {
      body: String(parsed.body),
      excerpt: String(parsed.excerpt ?? ""),
      seoDescription: String(parsed.seoDescription ?? parsed.seo_description ?? ""),
      seoTitle: String(parsed.seoTitle ?? parsed.seo_title ?? parsed.title),
      slug: String(parsed.slug ?? ""),
      tags: Array.isArray(parsed.tags) ? parsed.tags.map(String).filter(Boolean) : [],
      title: String(parsed.title)
    };
  } catch {
    return null;
  }
}

function slugify(text: string) {
  return text
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, "")
    .replace(/[\s_-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}
