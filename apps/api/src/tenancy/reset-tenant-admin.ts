import { NestFactory } from "@nestjs/core";
import { AppModule } from "../app.module";
import { TenantProvisioningService } from "./tenant-provisioning.service";

/**
 * Ops rescue CLI: reset (or create) a tenant's admin login when the provisioning password was lost or
 * never took effect. Reuses the exact control-plane lookup + connection registry that live requests use,
 * so it writes to the DB `auth/login` authenticates against. It also lists the tenant's existing admin
 * emails, so if the admin was seeded under a different address you can see it.
 *
 * Requires the multi-tenant env (CONTROL_PLANE_DATABASE_URL). Run it inside the API container:
 *   docker compose exec api node dist/tenancy/reset-tenant-admin.js dezhost info@dezhost.com
 *   docker compose exec api node dist/tenancy/reset-tenant-admin.js dezhost info@dezhost.com 'AChosenPassword'
 * With no password it generates one. Save the printed password — it is shown only here.
 */
async function main(): Promise<void> {
  const [subdomain, email, newPassword] = process.argv.slice(2);
  if (!subdomain || !email) {
    console.error("usage: node dist/tenancy/reset-tenant-admin.js <subdomain> <email> [newPassword]");
    process.exit(1);
  }

  const app = await NestFactory.createApplicationContext(AppModule, { logger: ["error", "warn"] });
  try {
    const result = await app.get(TenantProvisioningService).resetTenantAdmin(subdomain, email, newPassword);
    console.log(`\n✅ Admin login ${result.created ? "created" : "reset"}:\n`);
    console.log(JSON.stringify(result, null, 2));
    console.log(`\nLog in at https://${result.subdomain}.teculiar.net/admin (or the tenant's own domain).`);
    console.log("Save the adminPassword above — it is shown only once.\n");
  } finally {
    await app.close();
  }
}

main().catch((error) => {
  console.error("\n❌ Reset failed:\n", error instanceof Error ? error.message : error);
  process.exit(1);
});
