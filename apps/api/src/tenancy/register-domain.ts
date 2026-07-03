import { NestFactory } from "@nestjs/core";
import { AppModule } from "../app.module";
import { ControlPlaneService } from "./control-plane.service";

/**
 * One-off CLI to map a custom hostname to a tenant + white-label surface (Phase 4.6). This is what
 * makes a tenant's OWN domain resolve — the per-request resolver looks the full Host up in the
 * control-plane `tenant_domains` table. Run it inside the API container after the tenant is provisioned:
 *
 *   docker compose exec api node apps/api/dist/tenancy/register-domain.js dezhost.com  dezhost apex   active
 *   docker compose exec api node apps/api/dist/tenancy/register-domain.js teculiar.com teculiar apex  active
 *   docker compose exec api node apps/api/dist/tenancy/register-domain.js admin.acme.com acme   admin  active
 *
 * `surface` = admin|client|api|apex (default apex — an apex host serves several surfaces by path).
 * `status`  = active|pending|verified|disabled (default active; only ACTIVE hosts resolve / get TLS).
 * Requires the multi-tenant env (CONTROL_PLANE_DATABASE_URL). The tenant must already exist.
 */
async function main(): Promise<void> {
  const [host, subdomain, surface = "apex", status = "active"] = process.argv.slice(2);
  if (!host || !subdomain) {
    console.error(
      "usage: node apps/api/dist/tenancy/register-domain.js <host> <tenant-subdomain> [surface=apex|admin|client|api] [status=active|pending]"
    );
    process.exit(1);
  }

  const app = await NestFactory.createApplicationContext(AppModule, { logger: ["error", "warn"] });
  try {
    const cp = app.get(ControlPlaneService);
    if (!cp.enabled) {
      console.error("CONTROL_PLANE_DATABASE_URL is not set — multi-tenancy is off; nothing to register.");
      process.exit(1);
    }
    const tenant = await cp.findBySubdomain(subdomain);
    if (!tenant) {
      console.error(`No tenant with subdomain "${subdomain}". Provision it first (bootstrap-tenant).`);
      process.exit(1);
    }
    const domain = await cp.registerDomain({ host, tenantId: tenant.id, surface, status });
    console.log(`\n✅ ${domain.host} → tenant "${tenant.subdomain}" (surface=${domain.surface}, status=${domain.status}).\n`);
  } finally {
    await app.close();
  }
}

main().catch((error) => {
  console.error("\n❌ register-domain failed:\n", error instanceof Error ? error.message : error);
  process.exit(1);
});
