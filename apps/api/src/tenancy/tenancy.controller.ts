import { Controller, Get, NotFoundException, Query } from "@nestjs/common";
import { ControlPlaneService } from "./control-plane.service";

/**
 * Platform (non-tenant) endpoints for the edge (Phase 4.6d). Public by design — the caller is the
 * reverse-proxy/edge on the box, not an authenticated user.
 */
@Controller("tenancy")
export class TenancyController {
  constructor(private readonly controlPlane: ControlPlaneService) {}

  /**
   * Caddy on-demand-TLS `ask` endpoint. Caddy calls `GET …/tenancy/tls-allowed?domain=<host>` before it
   * mints a certificate for an unknown hostname; a **2xx** means "issue it". We allow ONLY registered
   * ACTIVE tenant hosts, so the edge never obtains certs for arbitrary hostnames pointed at its IP
   * (anti-abuse + Let's-Encrypt-quota protection). Any non-tenant host → 404 → Caddy declines.
   */
  @Get("tls-allowed")
  async tlsAllowed(@Query("domain") domain?: string, @Query("host") host?: string): Promise<{ ok: true }> {
    const candidate = (domain ?? host ?? "").trim().toLowerCase();
    if (candidate && (await this.controlPlane.isActiveTenantHost(candidate))) {
      return { ok: true };
    }
    throw new NotFoundException("host is not a registered active tenant domain");
  }
}
