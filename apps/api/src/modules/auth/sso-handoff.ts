import { createHash, randomBytes } from "crypto";

/**
 * One-time-code store for the cross-origin session handoff (Phase 4.6e).
 *
 * When a tenant places its client area on a separate origin (client.theirdomain.com) while the shopper
 * logs in on the storefront apex, the session cannot cross origins (tokens are host-only by design).
 * The handoff moves a SINGLE-USE, 30-second code instead of the token:
 *   origin-with-session → POST /auth/sso/exchange (Bearer)  → { code }
 *   302 → target/sso/callback?code=…#v=<verifier>           (verifier rides the URL FRAGMENT — never
 *                                                            sent to servers/logs; code alone is useless)
 *   target → POST /auth/sso/redeem { code, codeVerifier }   → fresh tokens for the target origin
 *
 * PKCE-style binding: exchange stores sha256(verifier); redeem must present the verifier. The code is
 * additionally bound to the tenant + the exact target host, so a leaked code cannot be replayed
 * elsewhere. In-memory: valid for a single API instance (today's topology); a multi-instance deploy
 * needs a shared store (control-plane table) — revisit with the load balancer.
 */

export interface SsoGrant {
  userId: string;
  email: string;
  /** Tenant the session belongs to; null in single-tenant fallback. Redeem must match. */
  tenantId: string | null;
  /** Lowercased hostname the code may be redeemed on (and nowhere else). */
  targetHost: string;
  /** base64url(sha256(codeVerifier)) supplied at exchange time. */
  codeChallenge: string;
  expiresAt: number;
}

export const SSO_CODE_TTL_MS = 30_000;

export function sha256Base64Url(value: string): string {
  return createHash("sha256").update(value).digest("base64url");
}

/** Hostname of an https origin/url string, lowercased; null when unparsable. */
export function originHostname(origin: string): string | null {
  try {
    return new URL(origin).hostname.toLowerCase() || null;
  } catch {
    return null;
  }
}

export class SsoHandoffStore {
  private readonly grants = new Map<string, SsoGrant>();

  mint(grant: Omit<SsoGrant, "expiresAt">, now = Date.now()): string {
    this.prune(now);
    const code = randomBytes(24).toString("base64url");
    this.grants.set(code, { ...grant, expiresAt: now + SSO_CODE_TTL_MS });
    return code;
  }

  /** Burns the code — a grant is consumable exactly once, within its TTL. */
  consume(code: string, now = Date.now()): SsoGrant | null {
    this.prune(now);
    const grant = this.grants.get(code);
    if (!grant) {
      return null;
    }
    this.grants.delete(code);
    return grant.expiresAt > now ? grant : null;
  }

  private prune(now: number): void {
    for (const [code, grant] of this.grants) {
      if (grant.expiresAt <= now) {
        this.grants.delete(code);
      }
    }
  }
}
