import { NestFactory } from "@nestjs/core";
import type { PrismaClient } from "@prisma/client";
import { AppModule } from "../app.module";
import { PrismaService } from "../modules/prisma/prisma.service";
import { ConnectionRegistry } from "./connection-registry.service";
import { ControlPlaneService } from "./control-plane.service";

/**
 * One-off CLI (Phase 4.1): seed the Teculiar-plan catalog into a tenant — the product teculiar.com
 * sells. Creates/updates the "Teculiar" category + plan product (monthly recurring, provisioning
 * module `tecreator`) and switches the tecreator module on. Idempotent: upserts by slug, so re-runs
 * only update. Run inside the API container after the tenant exists (bootstrap-tenant):
 *
 *   docker compose exec api node apps/api/dist/tenancy/seed-teculiar-plan.js teculiar
 *   docker compose exec api node apps/api/dist/tenancy/seed-teculiar-plan.js teculiar 2900 EUR
 *
 * Without CONTROL_PLANE_DATABASE_URL (single-tenant/dev) it seeds the default database.
 * Buying the plan runs the unchanged order→invoice→provision pipeline → Tecreator → createTenant.
 */
async function main(): Promise<void> {
  const [subdomain = "teculiar", cents = "2900", currency = "EUR"] = process.argv.slice(2);
  const monthlyCents = Number.parseInt(cents, 10);
  if (!Number.isFinite(monthlyCents) || monthlyCents <= 0) {
    console.error("usage: node apps/api/dist/tenancy/seed-teculiar-plan.js [tenant-subdomain] [monthlyCents] [currency]");
    process.exit(1);
  }

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

    const category = await prisma.productCategory.upsert({
      where: { slug: "teculiar" },
      create: {
        slug: "teculiar",
        name: "Teculiar",
        description: "The Teculiar platform — sell hosting, domains and services with your own storefront.",
        provisioningModule: "tecreator",
        active: true
      },
      update: { provisioningModule: "tecreator", active: true }
    });

    const product = await prisma.product.upsert({
      where: { slug: "teculiar-plan" },
      create: {
        slug: "teculiar-plan",
        name: "Teculiar",
        type: "MANAGED_SERVICE",
        description:
          "Your own storefront, admin and client dashboards on a dedicated database — ready in minutes on a free subdomain, white-label custom domains included.",
        categoryId: category.id,
        provisioningModule: "tecreator",
        domainRequirement: "NOT_NEEDED",
        active: true,
        homepageVisible: true,
        featured: true
      },
      update: { categoryId: category.id, provisioningModule: "tecreator", domainRequirement: "NOT_NEEDED", active: true }
    });

    await prisma.productPrice.upsert({
      where: { productId_billingCycle: { productId: product.id, billingCycle: "MONTHLY" } },
      create: { productId: product.id, billingCycle: "MONTHLY", amountCents: monthlyCents, currency, active: true },
      update: { amountCents: monthlyCents, currency, active: true }
    });

    // Feature list shown on product cards/checkout (label only — empty value renders just the label).
    const features: Array<[string, string]> = [
      ["storefront", "Your own storefront with the Blue theme + page builder"],
      ["dashboards", "Admin & client dashboards"],
      ["database", "Dedicated database for your data"],
      ["subdomain", "Free yourname.teculiar.net subdomain"],
      ["whitelabel", "White-label custom domains"]
    ];
    for (const [key, label] of features) {
      await prisma.productConfig.upsert({
        where: { productId_key: { productId: product.id, key } },
        create: { productId: product.id, key, label, values: [""] },
        update: { label }
      });
    }

    // Make the platform module's enabled-state explicit (modules default active, but the admin UI
    // then shows it as deliberately on).
    await prisma.systemSetting.upsert({
      where: { key: "module.tecreator.active" },
      create: { key: "module.tecreator.active", value: 1 },
      update: { value: 1 }
    });

    console.log(
      `\n✅ Teculiar plan seeded for "${subdomain}": product ${product.slug} (${(monthlyCents / 100).toFixed(2)} ${currency}/month, module tecreator). Tecreator module enabled.\n`
    );
  } finally {
    await app.close();
  }
}

main().catch((error) => {
  console.error("\n❌ seed-teculiar-plan failed:\n", error instanceof Error ? error.message : error);
  process.exit(1);
});
