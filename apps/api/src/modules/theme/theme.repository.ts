import { Injectable } from "@nestjs/common";
import { MenuName, Prisma } from "@prisma/client";
import { getTenantContext } from "../../tenancy/tenant-context";
import { PrismaService } from "../prisma/prisma.service";
import { CONTENT_PAGE_DEFS, FOOTER_KEYS, LEGAL_MENU, MAIN_MENU, type LocaleMap, type MenuDef, localeMap } from "./theme-seed";
import { PAGE_MIRRORS } from "./page-mirrors";

// Global storefront-content (Phase 3a decoupling): the footer JSON lives in this SystemSetting,
// no longer on the Theme row. Mirrors how email/i18n/tax config already live in DB settings.
const FOOTER_SETTING_KEY = "storefront.footer";

@Injectable()
export class ThemeRepository {
  constructor(private readonly prisma: PrismaService) {}

  // Keyed per tenant (Phase 3.3): a process-level boolean meant only the FIRST tenant's lazy path
  // ever seeded Customizer mirror drafts in multi-tenant mode. "default" covers single-tenant mode.
  private readonly mirrorsSeeded = new Set<string>();

  /** Languages configured in Admin > Settings (main + others), deduped. Falls back to ["de"]. */
  async configuredLocales(): Promise<string[]> {
    const setting = await this.prisma.systemSetting.findUnique({ where: { key: "i18n.languages" } });
    const value = (setting?.value ?? {}) as { main?: string; others?: string[] };
    const main = value.main || "de";
    const others = Array.isArray(value.others) ? value.others : [];
    return [...new Set([main, ...others])].filter(Boolean);
  }

  // ── Theme (styling) ───────────────────────────────────────────────────────────
  activeTheme() {
    return this.prisma.theme.findFirst({ where: { active: true } });
  }

  themeByKey(key: string) {
    return this.prisma.theme.findUnique({ where: { key } });
  }

  listThemes() {
    return this.prisma.theme.findMany({ orderBy: { createdAt: "asc" } });
  }

  async setActiveTheme(id: string) {
    await this.prisma.$transaction([
      this.prisma.theme.updateMany({ data: { active: false } }),
      this.prisma.theme.update({ where: { id }, data: { active: true } })
    ]);
  }

  // ── Global content (theme-independent) ──────────────────────────────────────────
  pages() {
    return this.prisma.page.findMany({ orderBy: { order: "asc" } });
  }

  menuItems() {
    return this.prisma.menuItem.findMany({ orderBy: { order: "asc" } });
  }

  async footer(): Promise<Record<string, unknown> | null> {
    const setting = await this.prisma.systemSetting.findUnique({ where: { key: FOOTER_SETTING_KEY } });
    return (setting?.value as Record<string, unknown>) ?? null;
  }

  updateFooter(footer: Prisma.InputJsonValue) {
    return this.prisma.systemSetting.upsert({
      where: { key: FOOTER_SETTING_KEY },
      create: { key: FOOTER_SETTING_KEY, value: footer },
      update: { value: footer }
    });
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

  // ── Idempotent parity seed ──────────────────────────────────────────────────
  // Two independent, idempotent seeds: the GLOBAL content (pages/menus/footer setting), and the
  // styling (the single active "blue" theme). Either is skipped if already present, so re-runs and
  // later admin edits are never clobbered.
  async ensureSeeded(): Promise<void> {
    await this.ensureContentSeeded();
    await this.ensureStylingSeeded();
    await this.ensureMirrorDrafts();
  }

  // Seeds a Customizer "mirror" DRAFT for each page that has none yet, so the admin opens the builder
  // and sees the page's content as editable blocks. Drafts only — never auto-published, so the live
  // site is untouched until the admin reviews + publishes a page. Idempotent: skips any page that
  // already has a draft (even an empty one the admin saved), and runs its loop once per tenant per process.
  async ensureMirrorDrafts(): Promise<void> {
    const tenantKey = getTenantContext()?.tenant?.id ?? "default";
    if (this.mirrorsSeeded.has(tenantKey)) {
      return;
    }
    this.mirrorsSeeded.add(tenantKey);
    for (const [key, layout] of Object.entries(PAGE_MIRRORS)) {
      const page = await this.prisma.page.findUnique({ where: { key }, select: { id: true, draftLayout: true } });
      if (page && page.draftLayout == null) {
        await this.prisma.page.update({
          where: { id: page.id },
          data: { draftLayout: layout as unknown as Prisma.InputJsonValue, draftUpdatedAt: new Date() }
        });
      }
    }
  }

  // Seeds the global pages/menus/footer to mirror today's storefront — only when no pages exist yet.
  async ensureContentSeeded(): Promise<void> {
    if (await this.prisma.page.findFirst({ select: { id: true } })) {
      return;
    }
    const locales = await this.configuredLocales();
    await this.prisma.$transaction(async (tx) => {
      if (await tx.page.findFirst({ select: { id: true } })) {
        return; // lost a create race — another request seeded it first
      }

      const footer: Record<string, LocaleMap | string> = { contactEmail: "sales@dezhost.com", ctaHref: "/kontakt" };
      for (const key of FOOTER_KEYS) {
        footer[key] = localeMap(locales, `storefront.footer.${key}`);
      }
      await tx.systemSetting.upsert({
        where: { key: FOOTER_SETTING_KEY },
        create: { key: FOOTER_SETTING_KEY, value: footer as Prisma.InputJsonValue },
        update: {} // keep an existing (migrated) footer untouched
      });

      const pageIdByKey: Record<string, string> = {};
      for (const def of CONTENT_PAGE_DEFS) {
        const name = def.nameLiteral ?? localeMap(locales, def.nameKey ?? "");
        const slug = Object.fromEntries(locales.map((loc) => [loc, def.slug])); // parity: one path per locale today
        const page = await tx.page.create({
          data: { key: def.key, component: def.component, name, slug, order: def.order }
        });
        pageIdByKey[def.key] = page.id;
      }

      await this.seedMenu(tx, MenuName.MAIN, MAIN_MENU, pageIdByKey, locales, null);
      await this.seedMenu(tx, MenuName.LEGAL, LEGAL_MENU, pageIdByKey, locales, null);
    });
  }

  // Seeds the single active "blue" styling record — only when it doesn't exist yet.
  async ensureStylingSeeded(): Promise<void> {
    if (await this.themeByKey("blue")) {
      return;
    }
    await this.prisma.theme.upsert({
      where: { key: "blue" },
      create: { key: "blue", name: "Blue", active: true },
      update: {}
    });
  }

  private async seedMenu(
    tx: Prisma.TransactionClient,
    menu: MenuName,
    defs: MenuDef[],
    pageIdByKey: Record<string, string>,
    locales: string[],
    parentId: string | null
  ): Promise<void> {
    for (const def of defs) {
      const item = await tx.menuItem.create({
        data: {
          menu,
          parentId,
          order: def.order,
          newTab: false,
          pageId: def.pageKey ? (pageIdByKey[def.pageKey] ?? null) : null,
          label: localeMap(locales, def.labelKey)
        }
      });
      if (def.children?.length) {
        await this.seedMenu(tx, menu, def.children, pageIdByKey, locales, item.id);
      }
    }
  }
}
