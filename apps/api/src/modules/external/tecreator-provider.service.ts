import { Injectable } from "@nestjs/common";
import { randomInt } from "node:crypto";
import { ControlPlaneService } from "../../tenancy/control-plane.service";
import { TenantProvisioningService } from "../../tenancy/tenant-provisioning.service";
import type { HostingProvider, ProvisioningRequest, ProvisioningResult } from "./provider.types";

/**
 * Tecreator (Phase 4.3) — the `platform` provisioning module. Teculiar sells itself using itself:
 * buying a Teculiar plan runs this provider, which creates a brand-new TENANT by delegating to the
 * 4.1 `createTenant` primitive (create DB + user → migrate → seed Blue content + admin + per-tenant
 * JWT secrets → register in the control-plane). It implements the SAME `HostingProvider` interface as
 * the Virtualmin/Hetzner providers, so it plugs into the unchanged order→invoice→provision pipeline
 * (`onInvoicePaid → activateItem → external.hostingProvider("tecreator").provision(...)`); the returned
 * credentials are surfaced in the activation email like every other provider's `metadata.credentials`.
 */
@Injectable()
export class TecreatorProviderService implements HostingProvider {
  constructor(
    private readonly tenants: TenantProvisioningService,
    private readonly controlPlane: ControlPlaneService
  ) {}

  async provision(request: ProvisioningRequest): Promise<ProvisioningResult> {
    // Multi-tenancy must be configured (control-plane on). In single-tenant/dev we don't hard-fail the
    // order — return QUEUED with a reason, mirroring the Virtualmin "credentials not configured" path.
    if (!this.controlPlane.enabled) {
      return {
        externalId: `tecreator_${request.serviceId}`,
        status: "QUEUED",
        metadata: {
          platform: "tecreator",
          reason: "Control-plane is not configured (CONTROL_PLANE_DATABASE_URL is unset).",
          requestedOptions: request.options
        }
      };
    }

    const subdomain = resolveSubdomain(request.options);
    try {
      const tenant = await this.tenants.createTenant({
        subdomain,
        brand: stringOption(request.options, "brand"),
        plan: stringOption(request.options, "plan") ?? stringOption(request.options, "defaultPlan") ?? request.productType,
        adminEmail: stringOption(request.options, "adminEmail") ?? stringOption(request.options, "email"),
        adminName: stringOption(request.options, "adminName")
      });
      return {
        externalId: tenant.subdomain,
        status: "ACTIVE",
        metadata: {
          platform: "tecreator",
          url: tenant.url,
          dbName: tenant.dbName,
          // Emailed to the buyer by the billing lifecycle, exactly like the Virtualmin credentials block.
          credentials: { controlPanelUrl: `${tenant.url}/admin`, username: tenant.adminEmail, password: tenant.adminPassword }
        }
      };
    } catch (error) {
      // createTenant throws on invalid/duplicate subdomain, DDL/migrate/seed failures, etc. Surface the
      // reason on a FAILED result rather than throwing — the lifecycle records it against the service.
      return {
        externalId: `tecreator_${subdomain}`,
        status: "FAILED",
        metadata: {
          platform: "tecreator",
          reason: error instanceof Error ? error.message : "Tenant provisioning failed",
          requestedOptions: request.options
        }
      };
    }
  }

  // A tenant's liveness = its presence in the control-plane registry. "QUEUED" is treated as
  // inconclusive by the refresh cron, so a not-yet-registered tenant never flips a service inactive.
  async status(serviceExternalId: string): Promise<ProvisioningResult> {
    if (!this.controlPlane.enabled) {
      return { externalId: serviceExternalId, status: "QUEUED", metadata: { platform: "tecreator", reason: "Control-plane is not configured." } };
    }
    const tenant = await this.controlPlane.findBySubdomain(serviceExternalId).catch(() => null);
    if (tenant) {
      return { externalId: tenant.subdomain, status: "ACTIVE", metadata: { platform: "tecreator", plan: tenant.plan ?? undefined, tenantStatus: tenant.status } };
    }
    return { externalId: serviceExternalId, status: "QUEUED", metadata: { platform: "tecreator", reason: "Tenant not found in control-plane (still provisioning?)." } };
  }

  // Licensing lifecycle. The Teculiar subscription IS the tenant's license, so suspending/reactivating a
  // customer for (non-)payment simply flips the tenant's control-plane status. Suspension is
  // NON-destructive: the DB + uploads + public storefront stay; only authenticated dashboard/API access
  // is blocked (by JwtAuthGuard) until the overdue Teculiar invoice is paid. `serviceExternalId` is the
  // tenant subdomain (returned as the provision externalId).
  async disable(serviceExternalId: string) {
    return this.setTenantStatus(serviceExternalId, "suspended");
  }

  async enable(serviceExternalId: string) {
    return this.setTenantStatus(serviceExternalId, "active");
  }

  private async setTenantStatus(serviceExternalId: string, status: "suspended" | "active") {
    if (!this.controlPlane.enabled) {
      return { accepted: false, reason: "Control-plane is not configured." };
    }
    const subdomain = serviceExternalId.trim().toLowerCase();
    try {
      await this.controlPlane.setStatus(subdomain, status);
      return { accepted: true, subdomain, status };
    } catch (error) {
      return { accepted: false, reason: error instanceof Error ? error.message : `failed to set ${status}` };
    }
  }

  // Tenants are not "restartable" — provisioning is one-shot database creation. Report an accepted no-op
  // so the generic restart action the pipeline offers every hosting service does not error.
  async restart(serviceExternalId: string) {
    return { accepted: true, operationId: `tecreator-noop-${serviceExternalId}` };
  }
}

function stringOption(options: Record<string, unknown>, key: string): string | undefined {
  const value = options[key];
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

// The buyer's chosen subdomain (a checkout/product-config field), else an auto-generated one. Left
// unvalidated here — createTenant enforces the strict subdomain grammar and rejects duplicates.
function resolveSubdomain(options: Record<string, unknown>): string {
  const chosen = stringOption(options, "subdomain");
  if (chosen) {
    return chosen.toLowerCase();
  }
  const prefix = (stringOption(options, "subdomainPrefix") ?? "user").toLowerCase();
  return `${prefix}${String(randomInt(1000, 999999)).padStart(4, "0")}`;
}
