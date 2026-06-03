import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { KnowledgebaseArticle } from "@prisma/client";
import { UpsertArticleDto } from "./dto/upsert-article.dto";
import { KnowledgebaseRepository } from "./knowledgebase.repository";

@Injectable()
export class KnowledgebaseService {
  constructor(private readonly knowledgebase: KnowledgebaseRepository) {}

  listPublic() {
    return this.knowledgebase.listPublic();
  }

  listAdmin() {
    return this.knowledgebase.listAdmin();
  }

  async getPublic(slug: string) {
    const article = await this.knowledgebase.findPublicBySlug(slug);
    if (!article) {
      throw new NotFoundException("Knowledgebase article not found");
    }
    return article;
  }

  async suggestArticles(query = "") {
    const terms = tokenize(query);
    if (terms.length === 0) {
      return [];
    }

    const articles = await this.knowledgebase.listPublic();
    return articles
      .map((article) => ({ article, score: scoreArticle(article, terms) }))
      .filter((item) => item.score > 0)
      .sort((a, b) => b.score - a.score || b.article.updatedAt.getTime() - a.article.updatedAt.getTime())
      .slice(0, 5)
      .map(({ article }) => ({
        id: article.id,
        slug: article.slug,
        title: article.title,
        excerpt: article.excerpt ?? preview(article.body),
        updatedAt: article.updatedAt
      }));
  }

  createArticle(dto: UpsertArticleDto, authorId?: string) {
    return this.knowledgebase.create(normalizeInput(dto, authorId));
  }

  async updateArticle(id: string, dto: UpsertArticleDto) {
    await this.requireArticle(id);
    return this.knowledgebase.update(id, normalizeInput(dto));
  }

  async deleteArticle(id: string) {
    await this.requireArticle(id);
    return this.knowledgebase.delete(id);
  }

  private async requireArticle(id: string) {
    const article = await this.knowledgebase.findById(id);
    if (!article) {
      throw new NotFoundException("Knowledgebase article not found");
    }
    return article;
  }
}

function normalizeInput(dto: UpsertArticleDto, authorId?: string) {
  if (!dto.title?.trim()) {
    throw new BadRequestException("Title is required.");
  }
  if (!dto.body?.trim()) {
    throw new BadRequestException("Content is required.");
  }
  return {
    authorId,
    body: dto.body.trim(),
    excerpt: dto.excerpt?.trim() || preview(dto.body),
    images: dto.images ?? [],
    keywords: (dto.keywords ?? []).map((keyword) => keyword.trim().toLowerCase()).filter(Boolean),
    published: dto.published ?? true,
    seoDescription: dto.seoDescription?.trim() || dto.excerpt?.trim() || preview(dto.body),
    seoTitle: dto.seoTitle?.trim() || dto.title.trim(),
    slug: slugify(dto.slug || dto.title),
    title: dto.title.trim()
  };
}

function scoreArticle(article: KnowledgebaseArticle, terms: string[]) {
  const title = article.title.toLowerCase();
  const body = stripHtml(article.body).toLowerCase();
  const keywords = stringArray(article.keywords).map((keyword) => keyword.toLowerCase());
  return terms.reduce((score, term) => {
    if (title.includes(term)) score += 6;
    if (keywords.some((keyword) => keyword.includes(term))) score += 5;
    if ((article.excerpt ?? "").toLowerCase().includes(term)) score += 3;
    if (body.includes(term)) score += 1;
    return score;
  }, 0);
}

function tokenize(value: string) {
  const stop = new Set(["and", "the", "for", "with", "that", "this", "you", "your", "und", "oder", "der", "die", "das", "ein", "eine", "ich", "wir"]);
  return stripHtml(value)
    .toLowerCase()
    .split(/[^a-z0-9äöüß]+/i)
    .map((term) => term.trim())
    .filter((term) => term.length > 2 && !stop.has(term))
    .slice(0, 16);
}

function preview(value: string) {
  return stripHtml(value).replace(/\s+/g, " ").trim().slice(0, 180);
}

function stripHtml(value: string) {
  return value.replace(/<[^>]*>/g, " ");
}

function stringArray(value: unknown) {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string" && item.trim().length > 0).map((item) => item.trim()) : [];
}

function slugify(value: string) {
  const slug = value
    .trim()
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return slug || `article-${Date.now()}`;
}
