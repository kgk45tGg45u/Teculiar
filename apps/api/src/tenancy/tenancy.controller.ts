import { BadRequestException, Controller, Get, NotFoundException, Optional, Query } from "@nestjs/common";
import { ControlPlaneService } from "./control-plane.service";
import { hasVerificationToken, verificationCandidates, type TxtResolver } from "./domain-verification";

/**
 * Platform (non-tenant) endpoints for the edge (Phase 4.6d). Public by design — the caller is the
 * reverse-proxy/edge on the box, not an authenticated user.
 */
@Controller("tenancy")
export class TenancyController {
  constructor(
    private readonly controlPlane: ControlPlaneService,
    /** Overridable in tests; undefined in the app → real DNS inside hasVerificationToken. */
    @Optional() private readonly txtResolver?: TxtResolver
  ) {}

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

  /**
   * DNS-TXT ownership check for a PENDING custom domain (Phase 4.6f). The customer publishes
   * `_teculiar-verify.<registrable-domain> TXT "<token>"` (shown at registration), then this is polled
   * (wizard button / curl). On a match the host flips to ACTIVE — routable + TLS-issuable at the edge.
   * Safe without auth: it only compares public DNS against the stored token and can only ever activate
   * a host whose owner published that token.
   */
  @Get("verify-domain")
  async verifyDomain(@Query("host") hostQuery?: string): Promise<{ ok: boolean; status: string; txtRecord?: string }> {
    const host = (hostQuery ?? "").trim().toLowerCase();
    if (!host) {
      throw new BadRequestException("host query parameter is required");
    }
    const domain = await this.controlPlane.findDomainByHost(host);
    if (!domain) {
      throw new NotFoundException("host is not a registered tenant domain");
    }
    if (domain.status === "active") {
      return { ok: true, status: "active" }; // idempotent
    }
    if (!domain.verifyToken) {
      throw new BadRequestException("domain has no verification token — re-register it as pending");
    }
    const verified = await hasVerificationToken(host, domain.verifyToken, this.txtResolver);
    if (!verified) {
      // Tell the caller exactly which record to publish (most-specific candidate shown).
      return { ok: false, status: domain.status, txtRecord: `${verificationCandidates(host)[0]} TXT "${domain.verifyToken}"` };
    }
    await this.controlPlane.activateDomain(host);
    return { ok: true, status: "active" };
  }
}
