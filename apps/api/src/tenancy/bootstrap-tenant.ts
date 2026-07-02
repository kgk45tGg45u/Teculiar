import { NestFactory } from "@nestjs/core";
import { AppModule } from "../app.module";
import { TenantProvisioningService } from "./tenant-provisioning.service";

/**
 * One-off CLI to provision the FIRST tenants (Teculiar.com = tenant #0, then Dezhost) — the bootstrap
 * that breaks the chicken-and-egg: Tecreator normally runs on purchase, but the first tenants have no
 * store to buy from yet. Reuses the exact same 4.1 `createTenant` primitive Tecreator calls.
 *
 * Requires the multi-tenant env (CONTROL_PLANE_DATABASE_URL + TENANT_ADMIN_DATABASE_URL). Run it inside
 * the API container after deploy, e.g.:
 *   docker compose exec api node dist/tenancy/bootstrap-tenant.js teculiar admin@teculiar.com "Teculiar"
 *   docker compose exec api node dist/tenancy/bootstrap-tenant.js dezhost  admin@dezhost.com  "Dezhost"
 * It prints the admin email + generated password — save them, then log in at
 * https://<subdomain>.teculiar.net/admin and enable the tenant's modules.
 */
async function main(): Promise<void> {
  const [subdomain, adminEmail, brand] = process.argv.slice(2);
  if (!subdomain) {
    console.error("usage: node dist/tenancy/bootstrap-tenant.js <subdomain> [adminEmail] [brand]");
    process.exit(1);
  }

  const app = await NestFactory.createApplicationContext(AppModule, { logger: ["error", "warn"] });
  try {
    const result = await app.get(TenantProvisioningService).createTenant({ subdomain, adminEmail, brand });
    console.log("\n✅ Tenant provisioned:\n");
    console.log(JSON.stringify(result, null, 2));
    console.log("\nSave the adminPassword above — it is shown only once.\n");
  } finally {
    await app.close();
  }
}

main().catch((error) => {
  console.error("\n❌ Tenant provisioning failed:\n", error instanceof Error ? error.message : error);
  process.exit(1);
});
