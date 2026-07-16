import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import { accessSecret } from "../../tenancy/jwt-secrets";

// The "agent" role (restricted, PII-masked credential used for automated dashboard testing) gets
// full read+write everywhere EXCEPT the customer-linked modules below, where it must be strictly
// read-only — no editing a real customer, creating/paying/refunding a real order or invoice,
// replying to or closing a real customer's ticket. This guard is the structural backstop for that
// boundary: some of these routes aren't @Roles-gated at all (ticket replies/attachments/close are
// open to "any authenticated user", scoped only by service-level ownership checks — see
// tickets.service.ts's FULL_ACCESS_ROLES, which now includes "agent" so it can list/view every
// ticket, which would otherwise also let it reply to/close any ticket), and others rely on a
// class-level @Roles(...) grant that also covers a handful of mutating methods with no per-method
// override (e.g. BillingDevController). Path-prefix matching, not per-route decorators, so a
// future new endpoint added under one of these prefixes is safe by default.
const BLOCKED_PREFIXES = [
  "/users",
  "/orders",
  "/billing",
  "/tickets",
  "/services",
  "/cron",
  "/admin/dev/billing",
  "/admin/dev/services",
  "/admin/dev/module-logs",
  "/admin/dev/tickets",
  "/admin/dev/admins",
  "/admin/dev/emails"
];

function isBlockedPath(path: string): boolean {
  const normalized = path.replace(/^\/api\/v1/, "");
  return BLOCKED_PREFIXES.some((prefix) => normalized === prefix || normalized.startsWith(`${prefix}/`));
}

// Global guards run BEFORE any per-controller JwtAuthGuard (Nest order: global -> controller ->
// route), so `request.user` isn't populated yet when this runs — this guard decodes the token
// itself instead of relying on JwtAuthGuard having done it. A missing/invalid token is not this
// guard's concern (JwtAuthGuard, or the route being public, handles that); it only ever acts when
// it can positively identify the caller as "agent".
@Injectable()
export class AgentWriteBlockGuard implements CanActivate {
  constructor(private readonly jwt: JwtService) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<{ method: string; path: string; headers: Record<string, string> }>();
    if (request.method === "GET" || !isBlockedPath(request.path)) return true;

    const header = request.headers.authorization;
    const token = header?.startsWith("Bearer ") ? header.slice("Bearer ".length) : undefined;
    if (!token) return true;

    let roles: string[] = [];
    try {
      roles = this.jwt.verify<{ roles?: string[] }>(token, { secret: accessSecret() }).roles ?? [];
    } catch {
      return true;
    }

    if (roles.includes("agent")) {
      throw new ForbiddenException("The agent role is read-only for customer-linked resources");
    }
    return true;
  }
}
