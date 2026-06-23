import { Injectable } from "@nestjs/common";
import { MenuName, Prisma } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { BLUE_FOOTER_KEYS, BLUE_LEGAL_MENU, BLUE_MAIN_MENU, BLUE_PAGE_DEFS, type LocaleMap, type MenuDef, localeMap } from "./theme-seed";

@Injectable()
export class ThemeRepository {
  constructor(private readonly prisma: PrismaService) {}

  /** Languages configured in Admin > Settings (main + others), deduped. Falls back to ["de"]. */
  async configuredLocales(): Promise<string[]> {
    const setting = await this.prisma.systemSetting.findUnique({ where: { key: "i18n.languages" } });
    const value = (setting?.value ?? {}) as { main?: string; others?: string[] };
    const main = value.main || "de";
    const others = Array.isArray(value.others) ? value.others : [];
    return [...new Set([main, ...others])].filter(Boolean);
  }

  activeTheme() {
    return this.prisma.theme.findFirst({ where: { active: true } });
  }

  themeByKey(key: string) {
    return this.prisma.theme.findUnique({ where: { key } });
  }

  listThemes() {
    return this.prisma.theme.findMany({ orderBy: { createdAt: "asc" } });
  }

  pagesForTheme(themeId: string) {
    return this.prisma.page.findMany({ where: { themeId }, orderBy: { order: "asc" } });
  }

  menuItemsForTheme(themeId: string) {
    return this.prisma.menuItem.findMany({ where: { themeId }, orderBy: { order: "asc" } });
  }

  // ── Page CRUD ───────────────────────────────────────────────────────────────
  pageById(id: string) {
    return this.prisma.page.findUnique({ where: { id } });
  }

  createPage(data: Prisma.PageUncheckedCreateInput) {
    return this.prisma.page.create({ data });
  }

  updatePage(id: string, data: Prisma.PageUncheckedUpdateInput) {
    return this.prisma.page.update({ where: { id }, data });
  }

  deletePage(id: string) {
    return this.prisma.page.delete({ where: { id } });
  }

  // ── MenuItem CRUD ─────────────────────────────────────────────────────────────
  menuItemById(id: string) {
    return this.prisma.menuItem.findUnique({ where: { id } });
  }

  createMenuItem(data: Prisma.MenuItemUncheckedCreateInput) {
    return this.prisma.menuItem.create({ data });
  }

  updateMenuItem(id: string, data: Prisma.MenuItemUncheckedUpdateInput) {
    return this.prisma.menuItem.update({ where: { id }, data });
  }

  deleteMenuItem(id: string) {
    return this.prisma.menuItem.delete({ where: { id } });
  }

  updateFooter(themeId: string, footer: Prisma.InputJsonValue) {
    return this.prisma.theme.update({ where: { id: themeId }, data: { footer } });
  }

  async setActiveTheme(id: string) {
    await this.prisma.$transaction([
      this.prisma.theme.updateMany({ data: { active: false } }),
      this.prisma.theme.update({ where: { id }, data: { active: true } })
    ]);
  }

  // ── Idempotent parity seed ──────────────────────────────────────────────────
  // Creates the "Blue" theme + its pages/menus/footer to mirror today's storefront, but only
  // if it doesn't exist yet — so re-runs and later admin edits are never clobbered.
  async ensureBlueSeeded(): Promise<void> {
    if (await this.themeByKey("blue")) {
      return;
    }
    const locales = await this.configuredLocales();
    await this.prisma.$transaction(async (tx) => {
      if (await tx.theme.findUnique({ where: { key: "blue" } })) {
        return; // lost a create race — another request seeded it first
      }

      const footer: Record<string, LocaleMap | string> = { contactEmail: "sales@dezhost.com", ctaHref: "/kontakt" };
      for (const key of BLUE_FOOTER_KEYS) {
        footer[key] = localeMap(locales, `storefront.footer.${key}`);
      }
      const theme = await tx.theme.create({
        data: { key: "blue", name: "Blue", active: true, footer: footer as Prisma.InputJsonValue }
      });

      const pageIdByKey: Record<string, string> = {};
      for (const def of BLUE_PAGE_DEFS) {
        const name = def.nameLiteral ?? localeMap(locales, def.nameKey ?? "");
        const slug = Object.fromEntries(locales.map((loc) => [loc, def.slug])); // parity: one path per locale today
        const page = await tx.page.create({
          data: { themeId: theme.id, key: def.key, component: def.component, name, slug, order: def.order }
        });
        pageIdByKey[def.key] = page.id;
      }

      await this.seedMenu(tx, theme.id, MenuName.MAIN, BLUE_MAIN_MENU, pageIdByKey, locales, null);
      await this.seedMenu(tx, theme.id, MenuName.LEGAL, BLUE_LEGAL_MENU, pageIdByKey, locales, null);
    });
  }

  private async seedMenu(
    tx: Prisma.TransactionClient,
    themeId: string,
    menu: MenuName,
    defs: MenuDef[],
    pageIdByKey: Record<string, string>,
    locales: string[],
    parentId: string | null
  ): Promise<void> {
    for (const def of defs) {
      const item = await tx.menuItem.create({
        data: {
          themeId,
          menu,
          parentId,
          order: def.order,
          newTab: false,
          pageId: def.pageKey ? (pageIdByKey[def.pageKey] ?? null) : null,
          label: localeMap(locales, def.labelKey)
        }
      });
      if (def.children?.length) {
        await this.seedMenu(tx, themeId, menu, def.children, pageIdByKey, locales, item.id);
      }
    }
  }
}
