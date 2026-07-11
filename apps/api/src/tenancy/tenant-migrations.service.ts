import { Injectable, Logger, OnApplicationBootstrap } from "@nestjs/common";
import { execFile } from "node:child_process";
import { resolve as resolvePath } from "node:path";
import { promisify } from "node:util";
import { ControlPlaneService } from "./control-plane.service";

const run = promisify(execFile);

// Same broken migration the Dockerfile CMD resolves before `migrate deploy` (typo'd ALTER;
// the corrected 20260607120001 supersedes it). Resolving is a no-op on an up-to-date DB.
const BROKEN_MIGRATION = "20260607120000_add_bank_transfer_payment_method";

/**
 * Applies pending Prisma migrations to every registered tenant database at boot.
 * The Dockerfile CMD only migrates the default DB (DATABASE_URL); tenant DBs are
 * migrated once at createTenant and would otherwise go stale when a later release
 * ships a schema change. A per-tenant failure is logged and skipped — that tenant
 * errors at runtime either way, and the others keep working.
 */
@Injectable()
export class TenantMigrationsService implements OnApplicationBootstrap {
  private readonly logger = new Logger("TenantMigrations");

  constructor(private readonly controlPlane: ControlPlaneService) {}

  async onApplicationBootstrap(): Promise<void> {
    if (!this.controlPlane.enabled) {
      return;
    }
    const tenants = await this.controlPlane.list();
    for (const tenant of tenants) {
      try {
        await this.migrate(tenant.dbUrl);
        this.logger.log(`Tenant "${tenant.subdomain}" migrations up to date`);
      } catch (error) {
        this.logger.error(
          `Tenant "${tenant.subdomain}" migration failed: ${error instanceof Error ? error.message : String(error)}`
        );
      }
    }
  }

  /** Mirrors TenantProvisioningService.migrate: resolve the broken migration, then deploy. */
  private async migrate(dbUrl: string): Promise<void> {
    const prismaBin = resolvePath(process.cwd(), "node_modules/.bin/prisma");
    const env = { ...process.env, DATABASE_URL: dbUrl };
    await run(prismaBin, ["migrate", "resolve", "--applied", BROKEN_MIGRATION, "--schema", "prisma/schema.prisma"], {
      env
    }).catch(() => undefined);
    await run(prismaBin, ["migrate", "deploy", "--schema", "prisma/schema.prisma"], { env });
  }
}
