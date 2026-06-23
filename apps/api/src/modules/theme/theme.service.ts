import { BadRequestException, ConflictException, Injectable, NotFoundException } from "@nestjs/common";
import { MenuName, Prisma } from "@prisma/client";
import type { MenuItem, Page, Theme } from "@prisma/client";
import { CreateMenuItemDto, CreatePageDto, UpdateFooterDto, UpdateMenuItemDto, UpdatePageDto } from "./dto/theme.dto";
import { ThemeRepository } from "./theme.repository";

type LocaleMap = Record<string, string>;
const asMap = (value: unknown): LocaleMap => (value && typeof value === "object" ? (value as LocaleMap) : {});

type ShapedItem = {
  id: string;
  label: LocaleMap;
  newTab: boolean;
  externalUrl: string | null;
  pageKey: string | null;
  slug: LocaleMap | null;
  children: ShapedItem[];
};

@Injectable()
export class ThemeService {
  constructor(private readonly repo: ThemeRepository) {}

  private async activeOrSeed(): Promise<Theme> {
    await this.repo.ensureBlueSeeded();
    const theme = await this.repo.activeTheme();
    if (!theme) {
      throw new NotFoundException("No active theme configured");
    }
    return theme;
  }

  /** Public, data-driven view consumed by the storefront header/footer/router (used by the flip). */
  async storefrontTheme() {
    const theme = await this.activeOrSeed();
    const [pages, items, languages] = await Promise.all([
      this.repo.pagesForTheme(theme.id),
      this.repo.menuItemsForTheme(theme.id),
      this.repo.configuredLocales()
    ]);
    const pageById = new Map(pages.map((page) => [page.id, page]));

    const shapeItem = (item: MenuItem): ShapedItem => {
      const page = item.pageId ? pageById.get(item.pageId) : undefined;
      return {
        id: item.id,
        label: asMap(item.label),
        newTab: item.newTab,
        externalUrl: item.externalUrl,
        pageKey: page?.key ?? null,
        slug: page ? asMap(page.slug) : null,
        children: items
          .filter((child) => child.parentId === item.id)
          .sort((a, b) => a.order - b.order)
          .map(shapeItem)
      };
    };
    const topLevel = (menu: "MAIN" | "LEGAL") =>
      items.filter((item) => item.menu === menu && !item.parentId).sort((a, b) => a.order - b.order).map(shapeItem);

    return {
      theme: { key: theme.key, name: theme.name },
      languages,
      menus: { main: topLevel("MAIN"), legal: topLevel("LEGAL") },
      pages: pages.filter((page) => page.published).map(toPublicPage),
      footer: theme.footer ?? null
    };
  }

  /** Full, editable view for the Admin > Theme tabs. */
  async adminTheme() {
    const theme = await this.activeOrSeed();
    const [pages, items, locales, themes] = await Promise.all([
      this.repo.pagesForTheme(theme.id),
      this.repo.menuItemsForTheme(theme.id),
      this.repo.configuredLocales(),
      this.repo.listThemes()
    ]);
    return {
      theme: { id: theme.id, key: theme.key, name: theme.name, thumbnail: theme.thumbnail, active: theme.active, footer: theme.footer ?? null },
      themes: themes.map((entry) => ({ id: entry.id, key: entry.key, name: entry.name, thumbnail: entry.thumbnail, active: entry.active })),
      locales,
      canTranslate: locales.length > 1, // drives the per-field translate button (hidden for single-language stores)
      pages: pages.map(toAdminPage),
      menuItems: items.map((item) => ({
        id: item.id,
        menu: item.menu,
        parentId: item.parentId,
        pageId: item.pageId,
        externalUrl: item.externalUrl,
        label: asMap(item.label),
        newTab: item.newTab,
        order: item.order
      }))
    };
  }

  async activateTheme(key: string) {
    const theme = await this.repo.themeByKey(key);
    if (!theme) {
      throw new NotFoundException(`Theme "${key}" not found`);
    }
    await this.repo.setActiveTheme(theme.id);
    return { ok: true };
  }

  // ── Pages ────────────────────────────────────────────────────────────────────
  async createPage(dto: CreatePageDto) {
    const theme = await this.activeOrSeed();
    const name = sanitizeMap(dto.name);
    const slug = sanitizeMap(dto.slug, true);
    const pages = await this.repo.pagesForTheme(theme.id);
    const key = dto.key?.trim() || deriveKey(name, slug);
    if (!key) {
      throw new BadRequestException("A page name or key is required.");
    }
    if (pages.some((page) => page.key === key)) {
      throw new ConflictException(`A page with key "${key}" already exists.`);
    }
    this.assertSlugFree(pages, slug, null);
    return this.repo.createPage({
      themeId: theme.id,
      key,
      component: "custom", // admin-created pages render via the Customizer (Phase 3); metadata only for now
      name: name as Prisma.InputJsonValue,
      slug: slug as Prisma.InputJsonValue,
      seoTitle: dto.seoTitle ? (sanitizeMap(dto.seoTitle) as Prisma.InputJsonValue) : undefined,
      seoDescription: dto.seoDescription ? (sanitizeMap(dto.seoDescription) as Prisma.InputJsonValue) : undefined,
      published: dto.published ?? true,
      isSystem: false,
      order: dto.order ?? pages.length
    });
  }

  async updatePage(id: string, dto: UpdatePageDto) {
    const theme = await this.activeOrSeed();
    const page = await this.repo.pageById(id);
    if (!page || page.themeId !== theme.id) {
      throw new NotFoundException("Page not found");
    }
    const data: Prisma.PageUncheckedUpdateInput = {};
    if (dto.name) {
      data.name = sanitizeMap(dto.name) as Prisma.InputJsonValue;
    }
    if (dto.slug) {
      const slug = sanitizeMap(dto.slug, true);
      this.assertSlugFree(await this.repo.pagesForTheme(theme.id), slug, id);
      data.slug = slug as Prisma.InputJsonValue;
    }
    if (dto.seoTitle) {
      data.seoTitle = sanitizeMap(dto.seoTitle) as Prisma.InputJsonValue;
    }
    if (dto.seoDescription) {
      data.seoDescription = sanitizeMap(dto.seoDescription) as Prisma.InputJsonValue;
    }
    if (dto.published !== undefined) {
      data.published = dto.published;
    }
    if (dto.order !== undefined) {
      data.order = dto.order;
    }
    return this.repo.updatePage(id, data);
  }

  async deletePage(id: string) {
    const theme = await this.activeOrSeed();
    const page = await this.repo.pageById(id);
    if (!page || page.themeId !== theme.id) {
      throw new NotFoundException("Page not found");
    }
    if (page.isSystem) {
      throw new ConflictException("Built-in pages can't be deleted — unpublish them instead.");
    }
    await this.repo.deletePage(id);
    return { ok: true };
  }

  // ── Menu items ─────────────────────────────────────────────────────────────────
  async createMenuItem(dto: CreateMenuItemDto) {
    const theme = await this.activeOrSeed();
    const menu = dto.menu as MenuName;
    const parentId = dto.parentId ?? null;
    await this.validateMenuRefs(theme.id, menu, parentId, dto.pageId ?? null, null);
    const siblings = (await this.repo.menuItemsForTheme(theme.id)).filter(
      (item) => item.menu === menu && (item.parentId ?? null) === parentId
    );
    return this.repo.createMenuItem({
      themeId: theme.id,
      menu,
      label: sanitizeMap(dto.label) as Prisma.InputJsonValue,
      parentId,
      pageId: dto.pageId ?? null,
      externalUrl: dto.externalUrl?.trim() || null,
      newTab: dto.newTab ?? false,
      order: dto.order ?? siblings.length
    });
  }

  async updateMenuItem(id: string, dto: UpdateMenuItemDto) {
    const theme = await this.activeOrSeed();
    const item = await this.repo.menuItemById(id);
    if (!item || item.themeId !== theme.id) {
      throw new NotFoundException("Menu item not found");
    }
    const menu = (dto.menu ?? item.menu) as MenuName;
    const parentId = dto.parentId === undefined ? item.parentId : dto.parentId;
    const pageId = dto.pageId === undefined ? item.pageId : dto.pageId;
    await this.validateMenuRefs(theme.id, menu, parentId, pageId, id);
    const data: Prisma.MenuItemUncheckedUpdateInput = {};
    if (dto.menu !== undefined) {
      data.menu = menu;
    }
    if (dto.label) {
      data.label = sanitizeMap(dto.label) as Prisma.InputJsonValue;
    }
    if (dto.parentId !== undefined) {
      data.parentId = dto.parentId;
    }
    if (dto.pageId !== undefined) {
      data.pageId = dto.pageId;
    }
    if (dto.externalUrl !== undefined) {
      data.externalUrl = dto.externalUrl?.trim() || null;
    }
    if (dto.newTab !== undefined) {
      data.newTab = dto.newTab;
    }
    if (dto.order !== undefined) {
      data.order = dto.order;
    }
    return this.repo.updateMenuItem(id, data);
  }

  async deleteMenuItem(id: string) {
    const theme = await this.activeOrSeed();
    const item = await this.repo.menuItemById(id);
    if (!item || item.themeId !== theme.id) {
      throw new NotFoundException("Menu item not found");
    }
    await this.repo.deleteMenuItem(id); // children cascade via FK
    return { ok: true };
  }

  async updateFooter(dto: UpdateFooterDto) {
    const theme = await this.activeOrSeed();
    await this.repo.updateFooter(theme.id, dto.footer as Prisma.InputJsonValue);
    return { ok: true };
  }

  // Same-locale slug clashes make routing ambiguous, so reject them (empty slug = the home page).
  private assertSlugFree(pages: Page[], slug: LocaleMap, excludeId: string | null) {
    for (const page of pages) {
      if (page.id === excludeId) {
        continue;
      }
      const existing = asMap(page.slug);
      for (const [locale, value] of Object.entries(slug)) {
        if (existing[locale] === value) {
          throw new ConflictException(`Slug "${value || "(home)"}" is already used by another page for "${locale}".`);
        }
      }
    }
  }

  private async validateMenuRefs(themeId: string, menu: MenuName, parentId: string | null, pageId: string | null, selfId: string | null) {
    if (parentId) {
      if (parentId === selfId) {
        throw new BadRequestException("A menu item can't be its own parent.");
      }
      const parent = await this.repo.menuItemById(parentId);
      if (!parent || parent.themeId !== themeId) {
        throw new BadRequestException("Parent menu item not found.");
      }
      if (parent.menu !== menu) {
        throw new BadRequestException("Parent must be in the same menu.");
      }
      if (parent.parentId) {
        throw new BadRequestException("Menus support a single level of nesting.");
      }
    }
    if (pageId) {
      const page = await this.repo.pageById(pageId);
      if (!page || page.themeId !== themeId) {
        throw new BadRequestException("Linked page not found.");
      }
    }
  }
}

function sanitizeMap(map: LocaleMap | undefined, allowEmpty = false): LocaleMap {
  const out: LocaleMap = {};
  for (const [locale, value] of Object.entries(map ?? {})) {
    if (typeof value !== "string") {
      continue;
    }
    const trimmed = value.trim();
    if (trimmed || allowEmpty) {
      out[locale] = trimmed;
    }
  }
  return out;
}

function deriveKey(name: LocaleMap, slug: LocaleMap): string {
  const source = Object.values(slug).find(Boolean) || Object.values(name).find(Boolean) || "";
  return slugify(source);
}

function slugify(value: string): string {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
}

function toPublicPage(page: Page) {
  return {
    key: page.key,
    component: page.component,
    name: asMap(page.name),
    slug: asMap(page.slug),
    seoTitle: asMap(page.seoTitle),
    seoDescription: asMap(page.seoDescription)
  };
}

function toAdminPage(page: Page) {
  return {
    id: page.id,
    key: page.key,
    component: page.component,
    name: asMap(page.name),
    slug: asMap(page.slug),
    seoTitle: asMap(page.seoTitle),
    seoDescription: asMap(page.seoDescription),
    published: page.published,
    isSystem: page.isSystem,
    order: page.order
  };
}
