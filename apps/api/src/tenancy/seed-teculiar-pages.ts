import { NestFactory } from "@nestjs/core";
import type { Prisma, PrismaClient } from "@prisma/client";
import { AppModule } from "../app.module";
import { PrismaService } from "../modules/prisma/prisma.service";
import { ConnectionRegistry } from "./connection-registry.service";
import { ControlPlaneService } from "./control-plane.service";

/**
 * One-off CLI (Phase 4.3): author the teculiar.com HOME page — hero, feature grid, steps,
 * pricing table (the Phase 4.2 element), CTA and FAQ, in de+en — as a Customizer layout doc.
 * Writes the doc as the home page's DRAFT for review in the builder; `--publish` also promotes
 * it live (same transaction shape as the Customizer's own publish: publishedLayout + version
 * snapshot). A page that is already custom-published is only overwritten with `--force`.
 *
 *   docker compose exec api node apps/api/dist/tenancy/seed-teculiar-pages.js teculiar
 *   docker compose exec api node apps/api/dist/tenancy/seed-teculiar-pages.js teculiar --publish
 *
 * Run AFTER seed-teculiar-plan.js — the pricing plan's CTA links the plan's order page when the
 * product exists (falls back to /de/kontakt). Node ids are stable slugs so re-runs are idempotent.
 */

// Mirrors LAYOUT_SCHEMA_VERSION in packages/web-core/src/lib/customizer/types.ts.
const SCHEMA_VERSION = 1;

function homeLayout(orderHref: string) {
  const t = (en: string, de: string) => ({ en, de });
  return {
    schemaVersion: SCHEMA_VERSION,
    root: [
      {
        id: "tec-hero",
        type: "hero",
        props: { eyebrowIcon: "Rocket", primaryHref: orderHref, secondaryHref: "/de/kontakt" },
        text: {
          eyebrow: t("The commerce platform for hosters", "Die Commerce-Plattform für Hoster"),
          title: t("Sell hosting under your own brand.", "Verkaufe Hosting unter deiner eigenen Marke."),
          subtitle: t(
            "Teculiar gives you a complete storefront, billing and provisioning platform — your own database, your own domain, ready in minutes.",
            "Teculiar liefert dir Storefront, Abrechnung und Provisionierung aus einer Hand — eigene Datenbank, eigene Domain, startklar in Minuten."
          ),
          primaryCta: t("Get started", "Jetzt starten"),
          secondaryCta: t("Talk to us", "Sprich mit uns")
        }
      },
      {
        id: "tec-features",
        type: "featureGrid",
        props: { columns: { base: 4, md: 2, sm: 1 } },
        text: {
          eyebrow: t("Everything included", "Alles inklusive"),
          title: t("One platform, the whole business.", "Eine Plattform, das ganze Geschäft."),
          subtitle: t(
            "Storefront, orders, invoices, domains and provisioning — no glue code, no plugins.",
            "Storefront, Bestellungen, Rechnungen, Domains und Provisionierung — ohne Bastellösungen und Plugins."
          )
        },
        children: [
          {
            id: "tec-feature-storefront",
            type: "featureCard",
            props: { icon: "Store" },
            text: {
              title: t("Storefront & page builder", "Storefront & Page-Builder"),
              body: t(
                "A fast multilingual storefront with the Blue theme and a visual builder — edit every page yourself.",
                "Ein schneller mehrsprachiger Storefront mit Blue-Theme und visuellem Builder — jede Seite selbst bearbeiten."
              )
            }
          },
          {
            id: "tec-feature-billing",
            type: "featureCard",
            props: { icon: "ReceiptText" },
            text: {
              title: t("Billing built in", "Abrechnung integriert"),
              body: t(
                "Orders, recurring invoices, VAT and payment gateways out of the box.",
                "Bestellungen, wiederkehrende Rechnungen, USt. und Zahlungsanbieter direkt an Bord."
              )
            }
          },
          {
            id: "tec-feature-provisioning",
            type: "featureCard",
            props: { icon: "ServerCog" },
            text: {
              title: t("Automatic provisioning", "Automatische Provisionierung"),
              body: t(
                "Hosting panels and domain registrars connect as modules — services activate on payment.",
                "Hosting-Panels und Domain-Registrare als Module — Dienste aktivieren sich mit der Zahlung."
              )
            }
          },
          {
            id: "tec-feature-whitelabel",
            type: "featureCard",
            props: { icon: "Globe" },
            text: {
              title: t("White-label domains", "White-Label-Domains"),
              body: t(
                "Run everything on your own domain — storefront, admin and client areas, clean URLs.",
                "Alles auf deiner eigenen Domain — Storefront, Admin- und Kundenbereich mit sauberen URLs."
              )
            }
          }
        ]
      },
      {
        id: "tec-steps",
        type: "steps",
        props: { ctaHref: orderHref },
        text: {
          eyebrow: t("How it works", "So funktioniert’s"),
          title: t("Live in three steps.", "In drei Schritten live."),
          ctaLabel: t("Start now", "Jetzt loslegen")
        },
        children: [
          {
            id: "tec-step-1",
            type: "step",
            props: { num: "1" },
            text: {
              title: t("Order your plan", "Tarif bestellen"),
              body: t("Choose the Teculiar plan and check out in minutes.", "Teculiar-Tarif wählen und in Minuten bestellen.")
            }
          },
          {
            id: "tec-step-2",
            type: "step",
            props: { num: "2" },
            text: {
              title: t("We provision your platform", "Wir provisionieren deine Plattform"),
              body: t(
                "Your own storefront, dashboards and database are created automatically — credentials arrive by email.",
                "Storefront, Dashboards und eigene Datenbank entstehen automatisch — die Zugangsdaten kommen per E-Mail."
              )
            }
          },
          {
            id: "tec-step-3",
            type: "step",
            props: { num: "3" },
            text: {
              title: t("Start selling", "Verkaufen"),
              body: t(
                "Add your products, connect your domain and go live under your brand.",
                "Produkte anlegen, Domain verbinden und unter deiner Marke live gehen."
              )
            }
          }
        ]
      },
      {
        id: "tec-pricing",
        type: "pricingTable",
        props: { columns: { base: 1, md: 1, sm: 1 } },
        text: {
          eyebrow: t("Pricing", "Preise"),
          title: t("One plan, everything included.", "Ein Tarif, alles inklusive."),
          subtitle: t("Transparent monthly pricing. Cancel anytime.", "Transparente monatliche Preise. Jederzeit kündbar.")
        },
        children: [
          {
            id: "tec-pricing-plan",
            type: "pricingPlan",
            props: { amountCents: 2900, currency: "EUR", href: orderHref, variant: "featured" },
            text: {
              title: t("Teculiar", "Teculiar"),
              suffix: t("/month", "/Monat"),
              body: t(
                "Your own storefront with page builder\nAdmin & client dashboards\nDedicated database\nFree yourname.teculiar.net subdomain\nWhite-label custom domains",
                "Eigener Storefront mit Page-Builder\nAdmin- & Kunden-Dashboards\nEigene Datenbank\nGratis deinname.teculiar.net-Subdomain\nWhite-Label mit eigener Domain"
              ),
              ctaLabel: t("Get started", "Jetzt starten")
            }
          }
        ]
      },
      {
        id: "tec-cta",
        type: "cta",
        props: { primaryHref: orderHref, secondaryHref: "/de/kontakt" },
        text: {
          eyebrow: t("Ready?", "Bereit?"),
          title: t("Your platform is minutes away.", "Deine Plattform ist Minuten entfernt."),
          body: t(
            "Order now, or talk to us first — we're happy to help you plan the switch.",
            "Jetzt bestellen — oder sprich zuerst mit uns, wir helfen gern beim Umstieg."
          ),
          primaryCta: t("Order the Teculiar plan", "Teculiar-Tarif bestellen"),
          secondaryCta: t("Contact us", "Kontakt aufnehmen")
        }
      },
      {
        id: "tec-faq",
        type: "faq",
        text: {
          eyebrow: t("FAQ", "FAQ"),
          title: t("Common questions.", "Häufige Fragen.")
        },
        children: [
          {
            id: "tec-faq-domain",
            type: "faqItem",
            text: {
              question: t("Can I use my own domain?", "Kann ich meine eigene Domain nutzen?"),
              answer: t(
                "Yes — white-label is built in. Point your domain at Teculiar and the storefront, admin and client areas run under it with clean URLs.",
                "Ja — White-Label ist eingebaut. Zeige deine Domain auf Teculiar und Storefront, Admin- und Kundenbereich laufen mit sauberen URLs darunter."
              )
            }
          },
          {
            id: "tec-faq-data",
            type: "faqItem",
            text: {
              question: t("Where does my data live?", "Wo liegen meine Daten?"),
              answer: t(
                "Every tenant gets its own dedicated database — your customers, invoices and content are isolated from everyone else's.",
                "Jeder Tenant bekommt eine eigene Datenbank — deine Kunden, Rechnungen und Inhalte sind von allen anderen getrennt."
              )
            }
          },
          {
            id: "tec-faq-cancel",
            type: "faqItem",
            text: {
              question: t("Can I cancel anytime?", "Kann ich jederzeit kündigen?"),
              answer: t(
                "The plan is billed monthly and can be cancelled at any time — no minimum term.",
                "Der Tarif wird monatlich abgerechnet und ist jederzeit kündbar — keine Mindestlaufzeit."
              )
            }
          }
        ]
      }
    ]
  };
}

const HOME_SEO = {
  title: {
    en: "Teculiar — sell hosting under your own brand",
    de: "Teculiar — Hosting unter eigener Marke verkaufen"
  },
  description: {
    en: "Storefront, billing, domains and provisioning in one platform. Your own database and domain, ready in minutes.",
    de: "Storefront, Abrechnung, Domains und Provisionierung in einer Plattform. Eigene Datenbank und Domain, startklar in Minuten."
  }
};

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const flags = new Set(args.filter((arg) => arg.startsWith("--")));
  const [subdomain = "teculiar"] = args.filter((arg) => !arg.startsWith("--"));
  const publish = flags.has("--publish");
  const force = flags.has("--force");

  const app = await NestFactory.createApplicationContext(AppModule, { logger: ["error", "warn"] });
  try {
    const cp = app.get(ControlPlaneService);
    let prisma: PrismaClient;
    if (cp.enabled) {
      const tenant = await cp.findBySubdomain(subdomain);
      if (!tenant) {
        console.error(`No tenant with subdomain "${subdomain}". Provision it first (bootstrap-tenant).`);
        process.exit(1);
      }
      prisma = app.get(ConnectionRegistry).clientFor(tenant.dbUrl);
    } else {
      prisma = app.get(PrismaService) as unknown as PrismaClient;
    }

    const page = await prisma.page.findUnique({
      where: { key: "home" },
      select: { id: true, layoutVersion: true, publishedLayout: true, seoTitle: true, seoDescription: true }
    });
    if (!page) {
      console.error(`No "home" page in tenant "${subdomain}" — is the tenant seeded (bootstrap-tenant)?`);
      process.exit(1);
    }
    if (page.publishedLayout != null && !force) {
      console.error("Home already has a published custom layout — re-run with --force to overwrite it.");
      process.exit(1);
    }

    const product = await prisma.product.findUnique({ where: { slug: "teculiar-plan" }, select: { id: true } });
    const orderHref = product ? `/de/order/${product.id}` : "/de/kontakt";
    const doc = homeLayout(orderHref) as unknown as Prisma.InputJsonValue;

    // SEO only when unset — an admin's own SEO text is never clobbered.
    const seo: Record<string, Prisma.InputJsonValue> = {};
    if (page.seoTitle == null) {
      seo.seoTitle = HOME_SEO.title;
    }
    if (page.seoDescription == null) {
      seo.seoDescription = HOME_SEO.description;
    }

    if (publish) {
      const version = page.layoutVersion + 1;
      await prisma.$transaction([
        prisma.page.update({
          where: { id: page.id },
          data: { ...seo, draftLayout: doc, draftUpdatedAt: new Date(), publishedLayout: doc, layoutVersion: version }
        }),
        prisma.pageVersion.create({
          data: { pageId: page.id, version, layout: doc, label: "Teculiar home seed" }
        })
      ]);
      console.log(`\n✅ Home authored + published for "${subdomain}" (v${version}, order link ${orderHref}).\n`);
    } else {
      await prisma.page.update({
        where: { id: page.id },
        data: { ...seo, draftLayout: doc, draftUpdatedAt: new Date() }
      });
      console.log(
        `\n✅ Home draft authored for "${subdomain}" (order link ${orderHref}). Review it in Admin → Theme → Customizer, then Publish (or re-run with --publish).\n`
      );
    }
  } finally {
    await app.close();
  }
}

main().catch((error) => {
  console.error("\n❌ seed-teculiar-pages failed:\n", error instanceof Error ? error.message : error);
  process.exit(1);
});
