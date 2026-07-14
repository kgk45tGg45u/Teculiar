import { CanActivate, ExecutionContext, ForbiddenException, Injectable, UnauthorizedException } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import { accessSecret } from "../../../tenancy/jwt-secrets";
import { getTenantContext } from "../../../tenancy/tenant-context";

// Licensing enforcement: a tenant whose Teculiar subscription lapsed is marked `suspended` in the
// control-plane. Its DATA and PUBLIC storefront stay intact, but every AUTHENTICATED dashboard/API
// request is refused until the overdue invoice is paid (Tecreator flips the status back to `active`).
// A no-op in single-tenant fallback (no control-plane → tenant context is null).
export function assertTenantActive(): void {
  const status = getTenantContext()?.tenant?.status;
  if (status && status.toLowerCase() === "suspended") {
    // `code` is the machine-readable marker the dashboards key their suspension notice on
    // (Phase 3.4) — never match on the English message text. `billingUrl` (optional, operator
    // env) tells the tenant owner WHERE the outstanding Teculiar invoice lives.
    throw new ForbiddenException({
      statusCode: 403,
      error: "Forbidden",
      code: "TENANT_SUSPENDED",
      message: "This account is suspended for non-payment. Please settle the outstanding invoice to reactivate.",
      billingUrl: process.env.TECULIAR_BILLING_URL || null
    });
  }
}

@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(private readonly jwt: JwtService) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<{ headers: Record<string, string>; user?: unknown }>();
    const header = request.headers.authorization;
    const token = header?.startsWith("Bearer ") ? header.slice("Bearer ".length) : undefined;

    if (!token) {
      throw new UnauthorizedException("Missing access token");
    }

    try {
      request.user = this.jwt.verify(token, {
        secret: accessSecret()
      });
    } catch {
      throw new UnauthorizedException("Invalid access token");
    }
    assertTenantActive();
    return true;
  }
}

@Injectable()
export class OptionalJwtAuthGuard extends JwtAuthGuard {
  override canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<{ headers: Record<string, string>; user?: unknown }>();
    const header = request.headers.authorization;
    const token = header?.startsWith("Bearer ") ? header.slice("Bearer ".length) : undefined;
    if (!token) {
      return true;
    }
    try {
      return super.canActivate(context);
    } catch {
      // Treat expired/invalid tokens as anonymous — guest checkout must still work
      request.user = undefined;
      return true;
    }
  }
}
