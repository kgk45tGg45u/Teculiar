import { BadRequestException, Body, ConflictException, Controller, Get, NotFoundException, Post, Put, UseGuards } from "@nestjs/common";
import { randomBytes } from "node:crypto";
import { IsIn, IsOptional, IsString, Matches, MaxLength } from "class-validator";
import { Roles } from "../common/decorators/roles.decorator";
import { RolesGuard } from "../common/guards/roles.guard";
import { JwtAuthGuard } from "../modules/auth/guards/jwt-auth.guard";
import { PrismaService } from "../modules/prisma/prisma.service";
import { ControlPlaneService } from "./control-plane.service";
import { hasVerificationToken, verificationCandidates } from "./domain-verification";
import { getTenantContext } from "./tenant-context";

const HOSTNAME_RE = /^(?=.{4,253}$)([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,}$/;

export class CreateTenantDomainDto {
  @IsString()
  @Matches(HOSTNAME_RE, { message: "host must be a valid lowercase hostname" })
  host!: string;

  @IsIn(["apex", "admin", "client", "api"])
  surface!: string;
}

export class VerifyTenantDomainDto {
  @IsString()
  @MaxLength(253)
  host!: string;
}

export class WhitelabelConfigDto {
  /** external = own website on the apex; blue_selfhosted = our theme on their box; blue_hosted = everything points to us. */
  @IsIn(["external", "blue_selfhosted", "blue_hosted"])
  apexMode!: string;

  /** subdomains (client.x.com) or apex_paths (x.com/client — only with a blue_* apex). */
  @IsIn(["subdomains", "apex_paths"])
  dashboards!: string;

  /** The client-area subdomain label — "client" by default; tenants may prefer "portal", "kunde", … */
  @IsOptional()
  @IsString()
  @Matches(/^[a-z0-9]([a-z0-9-]{0,28}[a-z0-9])?$/, { message: "clientLabel must be a short lowercase dns label" })
  clientLabel?: string;
}

const WHITELABEL_SETTING_KEY = "whitelabel.config";

/**
 * Tenant self-service domain setup (Phase 4.6f — the wizard's API). Every route is scoped to the
 * REQUEST's tenant: a tenant can only see/register/verify its own hosts, and an attempt to claim a
 * host already owned by another tenant is refused. Registration is always PENDING + DNS-TXT token;
 * activation goes through the ownership check (same rules as the operator CLI).
 */
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles("admin", "super_admin")
@Controller("admin/tenant-domains")
export class TenantDomainsController {
  constructor(
    private readonly controlPlane: ControlPlaneService,
    private readonly prisma: PrismaService
  ) {}

  private tenant() {
    const tenant = getTenantContext()?.tenant;
    if (!tenant) {
      throw new BadRequestException("Custom domains require the multi-tenant platform (no tenant on this request).");
    }
    return tenant;
  }

  @Get()
  async overview() {
    const tenant = this.tenant();
    const domains = await this.controlPlane.listDomains(tenant.id);
    const setting = await this.prisma.systemSetting.findUnique({ where: { key: WHITELABEL_SETTING_KEY } });
    return {
      tenant: { subdomain: tenant.subdomain, defaultHost: `${tenant.subdomain}.teculiar.net` },
      edge: {
        // Where customer DNS must point. Operator-configurable; defaults match eu01.
        host: process.env.TECULIAR_EDGE_HOST ?? "edge.teculiar.net",
        ip: process.env.TECULIAR_EDGE_IP ?? "195.201.252.12"
      },
      config: (setting?.value as Record<string, unknown> | null) ?? null,
      domains: domains.map((domain) => ({
        host: domain.host,
        surface: domain.surface,
        status: domain.status,
        txtRecord:
          domain.status === "pending" && domain.verifyToken
            ? { name: verificationCandidates(domain.host).at(-1)!, value: domain.verifyToken }
            : null
      }))
    };
  }

  @Post()
  async register(@Body() dto: CreateTenantDomainDto) {
    const tenant = this.tenant();
    const host = dto.host.toLowerCase();
    const existing = await this.controlPlane.findDomainByHost(host);
    if (existing && existing.tenantId !== tenant.id) {
      throw new ConflictException("This hostname is already registered to another tenant.");
    }
    const verifyToken = existing?.verifyToken ?? randomBytes(24).toString("hex");
    const domain = await this.controlPlane.registerDomain({
      host,
      tenantId: tenant.id,
      surface: dto.surface,
      status: existing?.status === "active" ? "active" : "pending",
      verifyToken
    });
    return {
      host: domain.host,
      surface: domain.surface,
      status: domain.status,
      txtRecord: domain.status === "pending" ? { name: verificationCandidates(host).at(-1)!, value: verifyToken } : null
    };
  }

  @Post("verify")
  async verify(@Body() dto: VerifyTenantDomainDto) {
    const tenant = this.tenant();
    const host = dto.host.trim().toLowerCase();
    const domain = await this.controlPlane.findDomainByHost(host);
    if (!domain || domain.tenantId !== tenant.id) {
      throw new NotFoundException("This hostname is not registered for your account.");
    }
    if (domain.status === "active") {
      return { ok: true, status: "active" };
    }
    if (!domain.verifyToken) {
      throw new BadRequestException("No verification token — re-add the domain.");
    }
    if (!(await hasVerificationToken(host, domain.verifyToken))) {
      return {
        ok: false,
        status: domain.status,
        txtRecord: { name: verificationCandidates(host).at(-1)!, value: domain.verifyToken }
      };
    }
    await this.controlPlane.activateDomain(host);
    return { ok: true, status: "active" };
  }

  @Put("config")
  async saveConfig(@Body() dto: WhitelabelConfigDto) {
    this.tenant();
    if (dto.apexMode === "external" && dto.dashboards === "apex_paths") {
      throw new BadRequestException("With your own website on the apex, the dashboards must use subdomains.");
    }
    const value = {
      apexMode: dto.apexMode,
      dashboards: dto.dashboards,
      clientLabel: dto.clientLabel?.toLowerCase() || "client"
    };
    await this.prisma.systemSetting.upsert({
      where: { key: WHITELABEL_SETTING_KEY },
      update: { value },
      create: { key: WHITELABEL_SETTING_KEY, value }
    });
    return { ok: true, config: value };
  }
}
