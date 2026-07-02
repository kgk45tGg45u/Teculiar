import { BadRequestException, ConflictException, Injectable } from "@nestjs/common";
import { PrismaClient } from "@prisma/client";
import { hash } from "bcryptjs";
import { randomBytes } from "node:crypto";
import { execFile } from "node:child_process";
import { resolve as resolvePath } from "node:path";
import { promisify } from "node:util";
import { ThemeRepository } from "../modules/theme/theme.repository";
import { UsersRepository } from "../modules/users/users.repository";
import { ConnectionRegistry, JWT_ACCESS_SECRET_KEY, JWT_REFRESH_SECRET_KEY } from "./connection-registry.service";
import { ControlPlaneService } from "./control-plane.service";
import { runWithTenant } from "./tenant-context";

const run = promisify(execFile);

// A subdomain becomes a routing key, a database name and a DB username — all of which
// are interpolated into DDL as identifiers, so it must be strictly validated.
const SUBDOMAIN_RE = /^[a-z0-9](?:[a-z0-9-]{0,29}[a-z0-9])?$/;

// The broken migration the Dockerfile CMD also resolves before `migrate deploy`
// (typo'd ALTER; the corrected 20260607120001 supersedes it). On a fresh DB, resolving
// it first marks it applied/skipped so deploy runs the corrected migration instead.
const BROKEN_MIGRATION = "20260607120000_add_bank_transfer_payment_method";

export interface CreateTenantInput {
  subdomain: string;
  brand?: string;
  plan?: string;
  adminEmail?: string;
  adminName?: string;
  modules?: unknown;
}

export interface CreateTenantResult {
  subdomain: string;
  dbName: string;
  url: string;
  adminEmail: string;
  adminPassword: string;
}

/**
 * The `createTenant` primitive (Phase 4.1): provisions a brand-new tenant by creating
 * its own database directly via a MariaDB admin connection, migrating the tenant schema,
 * seeding Blue content + an admin user + per-tenant JWT secrets, and registering it in
 * the control-plane. Reused later by the Tecreator provisioning module (Phase 4.3).
 */
@Injectable()
export class TenantProvisioningService {
  constructor(
    private readonly controlPlane: ControlPlaneService,
    private readonly registry: ConnectionRegistry,
    private readonly theme: ThemeRepository,
    private readonly users: UsersRepository
  ) {}

  async createTenant(input: CreateTenantInput): Promise<CreateTenantResult> {
    const subdomain = input.subdomain.trim().toLowerCase();
    if (!SUBDOMAIN_RE.test(subdomain)) {
      throw new BadRequestException("Invalid subdomain (use a–z, 0–9 and hyphens; 2–31 chars).");
    }
    if (!this.controlPlane.enabled) {
      throw new BadRequestException("Control-plane is not configured (CONTROL_PLANE_DATABASE_URL is unset).");
    }
    if (await this.controlPlane.findBySubdomain(subdomain)) {
      throw new ConflictException(`Tenant "${subdomain}" already exists.`);
    }

    const ident = subdomain.replace(/-/g, "_");
    const dbName = `db_${ident}`;
    const dbUser = `u_${ident}`.slice(0, 32);
    const dbPassword = randomBytes(24).toString("base64url");
    const dbUrl = this.tenantDbUrl(dbName, dbUser, dbPassword);

    await this.createDatabase(dbName, dbUser, dbPassword);
    await this.migrate(dbUrl);
    const adminEmail = (input.adminEmail ?? `admin@${subdomain}.teculiar.net`).toLowerCase();
    const adminPassword = await this.seed(dbUrl, adminEmail, input.adminName ?? "Administrator");
    await this.controlPlane.register({
      subdomain,
      dbName,
      dbUrl,
      brand: input.brand ?? null,
      plan: input.plan ?? null,
      modules: input.modules
    });

    return { subdomain, dbName, url: `https://${subdomain}.teculiar.net`, adminEmail, adminPassword };
  }

  /** Build the tenant's least-privilege connection string from the admin URL's host. */
  private tenantDbUrl(dbName: string, dbUser: string, dbPassword: string): string {
    const adminUrl = process.env.TENANT_ADMIN_DATABASE_URL;
    if (!adminUrl) {
      throw new BadRequestException("TENANT_ADMIN_DATABASE_URL is not configured.");
    }
    const admin = new URL(adminUrl);
    const port = admin.port || "3306";
    return `mysql://${dbUser}:${dbPassword}@${admin.hostname}:${port}/${dbName}`;
  }

  /** CREATE DATABASE + least-privilege user via the MariaDB admin connection. */
  private async createDatabase(dbName: string, dbUser: string, dbPassword: string): Promise<void> {
    const admin = new PrismaClient({ datasources: { db: { url: process.env.TENANT_ADMIN_DATABASE_URL } } });
    try {
      await admin.$executeRawUnsafe(
        `CREATE DATABASE IF NOT EXISTS \`${dbName}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`
      );
      await admin.$executeRawUnsafe(`CREATE USER IF NOT EXISTS '${dbUser}'@'%' IDENTIFIED BY '${dbPassword}'`);
      await admin.$executeRawUnsafe(`GRANT ALL PRIVILEGES ON \`${dbName}\`.* TO '${dbUser}'@'%'`);
      await admin.$executeRawUnsafe("FLUSH PRIVILEGES");
    } finally {
      await admin.$disconnect().catch(() => undefined);
    }
  }

  /** Apply the tenant schema to the new DB, mirroring the Dockerfile's resolve+deploy. */
  private async migrate(dbUrl: string): Promise<void> {
    const prismaBin = resolvePath(process.cwd(), "node_modules/.bin/prisma");
    const env = { ...process.env, DATABASE_URL: dbUrl };
    await run(prismaBin, ["migrate", "resolve", "--applied", BROKEN_MIGRATION, "--schema", "prisma/schema.prisma"], {
      env
    }).catch(() => undefined);
    await run(prismaBin, ["migrate", "deploy", "--schema", "prisma/schema.prisma"], { env });
  }

  /** Seed Blue content + an admin user + per-tenant JWT secrets into the new tenant DB. */
  private async seed(dbUrl: string, adminEmail: string, adminName: string): Promise<string> {
    const prisma = this.registry.clientFor(dbUrl);
    const adminPassword = randomBytes(12).toString("base64url");
    await runWithTenant({ tenant: null, prisma, jwtSecrets: { access: "", refresh: "" } }, async () => {
      // Content + styling seeds are DB-idempotent (they check the tenant DB, not process state).
      await this.theme.ensureContentSeeded();
      await this.theme.ensureStylingSeeded();
      await prisma.systemSetting.createMany({
        data: [
          { key: JWT_ACCESS_SECRET_KEY, value: randomBytes(48).toString("base64url") },
          { key: JWT_REFRESH_SECRET_KEY, value: randomBytes(48).toString("base64url") }
        ],
        skipDuplicates: true
      });
      await this.users.createUserWithRole(
        { email: adminEmail, name: adminName, passwordHash: await hash(adminPassword, 10) },
        "admin"
      );
    });
    return adminPassword;
  }
}
