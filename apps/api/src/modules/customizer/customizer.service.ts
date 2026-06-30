import { BadGatewayException, BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { AiBlogService } from "../cms/ai-blog.service";
import { BillingService } from "../billing/billing.service";
import { PrismaService } from "../prisma/prisma.service";

// Customizer storage operations on the GLOBAL Page (content is theme-independent):
//  • Save  → write draftLayout (durable draft the builder reloads).
//  • Publish → promote draft (or a supplied layout) to publishedLayout, bump layoutVersion, snapshot
//              a PageVersion. A non-null publishedLayout is the signal the live route gate renders the
//              doc — `Page.component` is left untouched (it stays the physical route key the storefront
//              slug-routing middleware rewrites to; overwriting it would 404 the page).
//  • Revert → re-publish a past snapshot as a new version (append-only history).
//  • Translate → DeepSeek per-field auto-translate (reuses AiBlogService.callDeepseek + DB key).
@Injectable()
export class CustomizerService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly billing: BillingService,
    private readonly ai: AiBlogService
  ) {}

  async getPage(pageId: string) {
    const page = await this.requirePage(pageId);
    return {
      page: { id: page.id, key: page.key, component: page.component, name: page.name, slug: page.slug },
      draftLayout: page.draftLayout ?? null,
      publishedLayout: page.publishedLayout ?? null,
      draftUpdatedAt: page.draftUpdatedAt,
      layoutVersion: page.layoutVersion
    };
  }

  async saveDraft(pageId: string, layout: Record<string, unknown>) {
    await this.requirePage(pageId);
    assertLayoutShape(layout);
    const page = await this.prisma.page.update({
      where: { id: pageId },
      data: { draftLayout: layout as Prisma.InputJsonValue, draftUpdatedAt: new Date() }
    });
    return { ok: true, draftUpdatedAt: page.draftUpdatedAt };
  }

  async publish(pageId: string, layout: Record<string, unknown> | undefined, label: string | undefined, userId?: string) {
    const page = await this.requirePage(pageId);
    const doc = layout ?? (page.draftLayout as Record<string, unknown> | null);
    if (!doc) {
      throw new BadRequestException("Nothing to publish — save a draft first.");
    }
    assertLayoutShape(doc);
    const version = page.layoutVersion + 1;
    await this.prisma.$transaction([
      this.prisma.page.update({
        where: { id: pageId },
        data: {
          publishedLayout: doc as Prisma.InputJsonValue,
          draftLayout: doc as Prisma.InputJsonValue,
          layoutVersion: version
        }
      }),
      this.prisma.pageVersion.create({
        data: { pageId, version, layout: doc as Prisma.InputJsonValue, label: label ?? null, publishedBy: userId ?? null }
      })
    ]);
    return { ok: true, version };
  }

  async listVersions(pageId: string) {
    await this.requirePage(pageId);
    return this.prisma.pageVersion.findMany({
      where: { pageId },
      orderBy: { version: "desc" },
      select: { version: true, label: true, publishedAt: true, publishedBy: true }
    });
  }

  async revert(pageId: string, version: number, userId?: string) {
    const page = await this.requirePage(pageId);
    if (!Number.isInteger(version)) {
      throw new BadRequestException("Invalid version.");
    }
    const snap = await this.prisma.pageVersion.findUnique({ where: { pageId_version: { pageId, version } } });
    if (!snap) {
      throw new NotFoundException("Version not found");
    }
    const next = page.layoutVersion + 1;
    await this.prisma.$transaction([
      this.prisma.page.update({
        where: { id: pageId },
        data: {
          publishedLayout: snap.layout as Prisma.InputJsonValue,
          draftLayout: snap.layout as Prisma.InputJsonValue,
          layoutVersion: next
        }
      }),
      this.prisma.pageVersion.create({
        data: { pageId, version: next, layout: snap.layout as Prisma.InputJsonValue, label: `Reverted to v${version}`, publishedBy: userId ?? null }
      })
    ]);
    return { ok: true, version: next };
  }

  // Per-field auto-translate. Every field stays editable after auto-fill — this only pre-fills.
  async translate(texts: string[], target: string, source?: string) {
    const clean = texts.map((value) => (typeof value === "string" ? value : ""));
    if (!clean.some((value) => value.trim())) {
      return { items: clean }; // nothing to translate
    }
    const apiKey = (await this.billing.deepseekApiKey()).trim();
    if (!apiKey) {
      throw new BadRequestException("DeepSeek API key is not configured.");
    }
    const sourceLang = source?.trim() || (await this.billing.i18nLanguages()).main;
    if (sourceLang === target) {
      return { items: clean };
    }
    const system =
      `You translate website UI copy for a web-hosting company from ${sourceLang} to ${target}. ` +
      `Translate each string in the input JSON "items" array. Preserve meaning and tone, keep any ` +
      `placeholders (e.g. {name}, %s) and HTML tags intact, and leave empty strings empty. ` +
      `Return ONLY a JSON object {"items": [...]} with exactly the same number of items in the same order.`;
    let raw: string;
    try {
      raw = await this.ai.callDeepseek(
        apiKey,
        [
          { role: "system", content: system },
          { role: "user", content: JSON.stringify({ items: clean }) }
        ],
        "json_object"
      );
    } catch (error) {
      // Upstream (DeepSeek) failure — surface a clean 502 so the builder can toast and keep the
      // field editable, rather than leaking a raw 500.
      throw new BadGatewayException(`Auto-translate failed: ${error instanceof Error ? error.message : "unknown error"}`);
    }
    let items = clean;
    try {
      const parsed = JSON.parse(raw) as { items?: unknown };
      const arr = parsed.items;
      if (Array.isArray(arr)) {
        items = clean.map((fallback, index) => {
          const translated = arr[index];
          return typeof translated === "string" && translated.trim() ? translated : fallback;
        });
      }
    } catch {
      // malformed response → return the originals so the UI degrades gracefully
    }
    return { items };
  }

  /** Storefront read for the live route gate. A non-null `publishedLayout` means the page has an
   *  authored custom layout to render (in place of its built-in renderer); `mainLocale` (the configured
   *  main language) is the renderer's fallback locale. Returns null for missing/unpublished pages. */
  async storefrontPage(key: string) {
    const page = await this.prisma.page.findUnique({ where: { key } });
    if (!page || !page.published) {
      return null;
    }
    const layout = page.publishedLayout ?? null;
    return {
      key: page.key,
      component: page.component,
      publishedLayout: layout,
      mainLocale: layout ? (await this.billing.i18nLanguages()).main : null
    };
  }

  private async requirePage(pageId: string) {
    const page = await this.prisma.page.findUnique({ where: { id: pageId } });
    if (!page) {
      throw new NotFoundException("Page not found");
    }
    return page;
  }
}

// Coarse structural guard for a layout doc (the renderer tolerates unknown node types, but the
// frame { schemaVersion, root[] } must hold so we never persist garbage).
function assertLayoutShape(layout: Record<string, unknown>): void {
  if (typeof layout.schemaVersion !== "number" || !Array.isArray(layout.root)) {
    throw new BadRequestException('Invalid layout document — expected { schemaVersion: number, root: [] }.');
  }
}
