import { BadRequestException, ForbiddenException, Injectable, Optional, UnauthorizedException } from "@nestjs/common";
import { JwtService, type JwtSignOptions } from "@nestjs/jwt";
import { compare, hash } from "bcryptjs";
import { createHash, createHmac, randomBytes, randomUUID, timingSafeEqual } from "crypto";
import { EmailService } from "../email/email.service";
import { UsersRepository } from "../users/users.repository";
import { ControlPlaneService } from "../../tenancy/control-plane.service";
import { accessSecret } from "../../tenancy/jwt-secrets";
import { getTenantContext } from "../../tenancy/tenant-context";
import { tenantWebBaseUrl } from "../../tenancy/tenant-urls";
import { allowedOrigins } from "../../cors-origin";
import { LoginDto } from "./dto/login.dto";
import { RegisterDto } from "./dto/register.dto";
import { originHostname, sha256Base64Url, SsoHandoffStore } from "./sso-handoff";

type TokenUser = {
  id: string;
  email: string;
  roles: string[];
};

/** Which portal a request comes from; maps onto the DB-level User.scope world. */
type PortalScope = "admin" | "client";

function userScope(scope: PortalScope): "CLIENT" | "STAFF" {
  return scope === "admin" ? "STAFF" : "CLIENT";
}

@Injectable()
export class AuthService {
  // In-memory one-time codes for the cross-origin SSO handoff (Phase 4.6e; single API instance).
  private readonly ssoStore = new SsoHandoffStore();

  constructor(
    private readonly jwt: JwtService,
    private readonly users: UsersRepository,
    @Optional() private readonly emails?: EmailService,
    @Optional() private readonly controlPlane?: ControlPlaneService
  ) {}

  async register(dto: RegisterDto, ipAddress?: string) {
    const email = dto.email.trim().toLowerCase();
    const existing = await this.users.findByEmail(email, "CLIENT");
    if (existing) {
      throw new BadRequestException("Email is already registered");
    }

    const passwordHash = await hash(dto.password, 12);
    const user = await this.users.createClient({
      address: dto.address,
      countryCode: dto.countryCode,
      customerType: dto.customerType,
      email,
      name: dto.name,
      passwordHash,
      phone: dto.phone,
      vatId: dto.vatId
    });
    void this.users.createAuditLog({
      action: "user.registered",
      actorId: user.id,
      metadata: { email: user.email, ipAddress },
      subject: "user",
      subjectId: user.id
    }).catch(() => undefined);
    void this.emails?.dispatch("welcome", {
      context: { customer_email: user.email, customer_name: dto.name },
      user: { email: user.email, id: user.id, name: dto.name }
    }).catch(() => undefined);

    return this.issueTokens(
      { id: user.id, email: user.email, roles: ["client"] },
      ipAddress,
      undefined
    );
  }

  async bootstrapAdmin(dto: RegisterDto, ipAddress?: string, userAgent?: string) {
    if (await this.users.adminExists()) {
      throw new BadRequestException("Admin already exists");
    }
    const existing = await this.users.findByEmail(dto.email.trim().toLowerCase(), "STAFF");
    if (existing) {
      throw new BadRequestException("Email is already registered");
    }

    const user = await this.users.createUserWithRole(
      {
        email: dto.email.toLowerCase(),
        name: dto.name,
        passwordHash: await hash(dto.password, 12)
      },
      "admin"
    );
    void this.users.createAuditLog({
      action: "user.admin_bootstrapped",
      actorId: user.id,
      metadata: { email: user.email, ipAddress, userAgent },
      subject: "user",
      subjectId: user.id
    }).catch(() => undefined);
    void this.emails?.dispatch("welcome", {
      context: { customer_email: user.email, customer_name: dto.name },
      user: { email: user.email, id: user.id, name: dto.name }
    }).catch(() => undefined);

    return this.issueTokens({ id: user.id, email: user.email, roles: ["admin"] }, ipAddress, userAgent);
  }

  async requestPasswordReset(rawEmail: string, scope: PortalScope = "client") {
    const email = rawEmail.trim().toLowerCase();
    const user = await this.users.findByEmail(email, userScope(scope));
    if (!user) {
      return { ok: true };
    }

    const passwordResetLink = this.passwordResetLink(user);
    void this.emails?.dispatch("password_reset", {
      context: {
        customer_email: user.email,
        customer_name: user.name ?? user.email,
        password_reset_link: passwordResetLink
      },
      user: { email: user.email, id: user.id, name: user.name ?? user.email }
    }).catch(() => undefined);
    void this.users.createAuditLog({
      action: "user.password_reset_requested",
      actorId: user.id,
      metadata: { email: user.email },
      subject: "user",
      subjectId: user.id
    }).catch(() => undefined);
    return { ok: true };
  }

  async confirmPasswordReset(token: string, password: string) {
    if (password.length < 12) {
      throw new BadRequestException("Password must be at least 12 characters.");
    }
    const payload = await this.verifyPasswordResetToken(token);
    await this.users.updatePasswordHash(payload.id, await hash(password, 12));
    await this.users.createAuditLog({
      action: "user.password_reset_completed",
      actorId: payload.id,
      metadata: { email: payload.email },
      subject: "user",
      subjectId: payload.id
    });
    return { ok: true };
  }

  async login(dto: LoginDto, ipAddress?: string, userAgent?: string) {
    const email = dto.email.trim().toLowerCase();
    const scope: PortalScope = dto.scope === "admin" ? "admin" : "client";
    // Admin and client portals are separate credential worlds: a staff account can never log
    // in through the client portal, and vice versa — even with the correct password.
    const user = await this.users.findByEmail(email, userScope(scope));
    if (!user || !(await compare(dto.password, user.passwordHash))) {
      const emergency = scope === "admin"
        ? await this.tryEmergencyAdminLogin(email, dto.password, ipAddress, userAgent)
        : null;
      if (emergency) {
        return emergency;
      }
      void this.users.createAuditLog({
        action: "user.login_failed",
        metadata: { email, ipAddress, scope, userAgent },
        subject: "user"
      }).catch(() => undefined);
      throw new UnauthorizedException("Invalid credentials");
    }

    if (user.totpEnabled) {
      if (!user.totpSecret) {
        throw new UnauthorizedException("Two-factor setup is incomplete");
      }
      const valid = dto.totpCode && verifyTotp(dto.totpCode, user.totpSecret);
      if (!valid) {
        throw new UnauthorizedException("Two-factor code required");
      }
    }

    const roles = user.userRoles.map((userRole) => userRole.role.slug);
    void this.users.createAuditLog({
      action: "user.login_succeeded",
      actorId: user.id,
      metadata: { email: user.email, ipAddress, userAgent },
      subject: "user",
      subjectId: user.id
    }).catch(() => undefined);
    return this.issueTokens({ id: user.id, email: user.email, roles }, ipAddress, userAgent);
  }

  private async tryEmergencyAdminLogin(email: string, password: string, ipAddress?: string, userAgent?: string) {
    const emergencyEmail = process.env.EMERGENCY_ADMIN_EMAIL?.trim().toLowerCase();
    const emergencyPassword = process.env.EMERGENCY_ADMIN_PASSWORD;
    if (!emergencyEmail || !emergencyPassword || email !== emergencyEmail || !secureEquals(password, emergencyPassword)) {
      return null;
    }

    void this.users.createAuditLog({
      action: "user.emergency_admin_login_succeeded",
      metadata: { email: emergencyEmail, ipAddress, userAgent },
      subject: "user"
    }).catch(() => undefined);

    return this.issueEmergencyAdminTokens(emergencyEmail);
  }

  async refresh(refreshToken: string, ipAddress?: string, userAgent?: string) {
    const tokenHash = this.hashToken(refreshToken);
    const session = await this.users.findRefreshSessionByTokenHash(tokenHash);
    if (!session || session.revokedAt || session.expiresAt < new Date()) {
      throw new UnauthorizedException("Invalid refresh token");
    }

    const roles = session.user.userRoles.map((userRole) => userRole.role.slug);
    await this.users.revokeRefreshSession(session.id);
    return this.issueTokens({ id: session.userId, email: session.user.email, roles }, ipAddress, userAgent);
  }

  async logout(refreshToken: string) {
    const tokenHash = this.hashToken(refreshToken);
    await this.users.revokeRefreshSessionByHash(tokenHash);
    return { ok: true };
  }

  async setupTwoFactor(userId: string, email: string) {
    const secret = createTotpSecret();
    await this.users.setTotpSecret(userId, secret);
    return {
      secret,
      uri: createTotpUri(email, "Teculiar", secret)
    };
  }

  async verifyTwoFactor(userId: string, code: string) {
    const user = await this.users.findById(userId);
    if (!user?.totpSecret || !verifyTotp(code, user.totpSecret)) {
      throw new BadRequestException("Invalid two-factor code");
    }
    await this.users.enableTotp(userId);
    return { enabled: true };
  }

  /**
   * SSO handoff step 1 (Phase 4.6e): mint a one-time code for carrying the CURRENT session to another
   * origin of the SAME tenant (e.g. storefront apex → client.theirdomain.com). The code is bound to the
   * user, tenant, exact target host and a PKCE challenge; the token itself never leaves this origin.
   */
  async ssoExchange(user: TokenUser, targetOrigin: string, codeChallenge: string) {
    if (user.id === "emergency-admin") {
      throw new BadRequestException("The emergency session cannot be handed off");
    }
    if (!codeChallenge || codeChallenge.length < 20) {
      throw new BadRequestException("codeChallenge is required (base64url sha256 of the verifier)");
    }
    const targetHost = originHostname(targetOrigin);
    if (!targetHost) {
      throw new BadRequestException("targetOrigin must be a valid origin URL");
    }
    const tenant = getTenantContext()?.tenant ?? null;
    if (!(await this.isTenantOrigin(targetHost, tenant))) {
      throw new ForbiddenException("targetOrigin does not belong to this tenant");
    }
    const code = this.ssoStore.mint({
      userId: user.id,
      email: user.email,
      tenantId: tenant?.id ?? null,
      targetHost,
      codeChallenge
    });
    return { code, expiresIn: 30 };
  }

  /**
   * SSO handoff step 2: redeem the one-time code ON the target origin for fresh tokens. Requires the
   * PKCE verifier, must arrive on the exact host the code was minted for, within the same tenant.
   */
  async ssoRedeem(code: string, codeVerifier: string, requestHost: string | undefined, ipAddress?: string, userAgent?: string) {
    const grant = this.ssoStore.consume(code ?? "");
    if (!grant) {
      throw new UnauthorizedException("Invalid or expired code");
    }
    if (!codeVerifier || sha256Base64Url(codeVerifier) !== grant.codeChallenge) {
      throw new UnauthorizedException("Verification failed");
    }
    const host = (requestHost ?? "").split(":")[0]?.trim().toLowerCase() ?? "";
    if (!host || host !== grant.targetHost) {
      throw new UnauthorizedException("Code was issued for a different origin");
    }
    const tenant = getTenantContext()?.tenant ?? null;
    if ((tenant?.id ?? null) !== grant.tenantId) {
      throw new UnauthorizedException("Tenant mismatch");
    }
    // Fresh lookup by id (roles may have changed since the grant was minted; email is only
    // unique per scope, so it cannot identify a user on its own).
    const user = await this.users.findAuthById(grant.userId);
    if (!user) {
      throw new UnauthorizedException("Unknown user");
    }
    const roles = user.userRoles.map((userRole) => userRole.role.slug);
    void this.users.createAuditLog({
      action: "user.sso_handoff_redeemed",
      actorId: user.id,
      metadata: { email: user.email, targetHost: host, ipAddress, userAgent },
      subject: "user",
      subjectId: user.id
    }).catch(() => undefined);
    return this.issueTokens({ id: user.id, email: user.email, roles }, ipAddress, userAgent);
  }

  /** A host is a legal handoff target when it belongs to the request's tenant (or, in single-tenant fallback, to the configured origins). */
  private async isTenantOrigin(host: string, tenant: { id: string; subdomain: string } | null): Promise<boolean> {
    if (tenant) {
      if (host === `${tenant.subdomain}.teculiar.net`.toLowerCase()) {
        return true;
      }
      const domain = await this.controlPlane?.findDomainByHost(host);
      return Boolean(domain && domain.status === "active" && domain.tenantId === tenant.id);
    }
    return allowedOrigins().some((origin) => originHostname(origin) === host);
  }

  private async issueTokens(user: TokenUser, ipAddress?: string, userAgent?: string) {
    const refreshToken = randomUUID() + randomUUID();
    const refreshTokenHash = this.hashToken(refreshToken);

    await this.users.createRefreshSession({
      userId: user.id,
      tokenHash: refreshTokenHash,
      ipAddress,
      userAgent,
      expiresAt: new Date(Date.now() + 1000 * 60 * 60 * 24 * 30)
    });

    const expiresIn = (process.env.JWT_ACCESS_TTL ?? "15m") as JwtSignOptions["expiresIn"];
    const accessToken = await this.jwt.signAsync(
      {
        sub: user.id,
        email: user.email,
        roles: user.roles
      },
      {
        secret: accessSecret(),
        expiresIn
      }
    );

    return {
      accessToken,
      refreshToken,
      tokenType: "Bearer",
      user
    };
  }

  private async issueEmergencyAdminTokens(email: string) {
    const user = { id: "emergency-admin", email, roles: ["admin"] };
    const expiresIn = (process.env.JWT_ACCESS_TTL ?? "15m") as JwtSignOptions["expiresIn"];
    const accessToken = await this.jwt.signAsync(
      {
        sub: user.id,
        email: user.email,
        roles: user.roles
      },
      {
        secret: accessSecret(),
        expiresIn
      }
    );

    return {
      accessToken,
      refreshToken: `emergency-${randomUUID()}${randomUUID()}`,
      tokenType: "Bearer",
      user
    };
  }

  private hashToken(token: string) {
    return createHash("sha256").update(token).digest("hex");
  }

  private passwordResetLink(user: { email: string; id: string; passwordHash: string }) {
    const expiresAt = Date.now() + 1000 * 60 * 60;
    const payload = Buffer.from(JSON.stringify({ email: user.email, exp: expiresAt, id: user.id, nonce: randomUUID() })).toString("base64url");
    const signature = this.passwordResetSignature(payload, user.passwordHash);
    const baseUrl = tenantWebBaseUrl();
    return `${baseUrl}/reset-password?token=${encodeURIComponent(`${payload}.${signature}`)}`;
  }

  private async verifyPasswordResetToken(token: string) {
    const [payload, signature] = token.split(".");
    if (!payload || !signature) {
      throw new BadRequestException("Invalid password reset token.");
    }
    let decoded: { email?: string; exp?: number; id?: string };
    try {
      decoded = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as { email?: string; exp?: number; id?: string };
    } catch {
      throw new BadRequestException("Invalid password reset token.");
    }
    if (!decoded.email || !decoded.id || !decoded.exp || decoded.exp < Date.now()) {
      throw new BadRequestException("Invalid password reset token.");
    }
    const user = await this.users.findAuthById(decoded.id);
    if (!user || user.email !== decoded.email) {
      throw new BadRequestException("Invalid password reset token.");
    }
    const expected = this.passwordResetSignature(payload, user.passwordHash);
    if (!safeEqual(signature, expected)) {
      throw new BadRequestException("Invalid password reset token.");
    }
    return { email: user.email, id: user.id };
  }

  private passwordResetSignature(payload: string, passwordHash: string) {
    return createHmac("sha256", accessSecret() ?? "dev-password-reset-secret")
      .update(`${payload}.${passwordHash}`)
      .digest("base64url");
  }
}

const base32Alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

function createTotpSecret() {
  let bits = "";
  for (const byte of randomBytes(20)) {
    bits += byte.toString(2).padStart(8, "0");
  }

  return bits
    .match(/.{1,5}/g)!
    .map((chunk) => base32Alphabet[Number.parseInt(chunk.padEnd(5, "0"), 2)] ?? "A")
    .join("");
}

function createTotpUri(email: string, issuer: string, secret: string) {
  const label = encodeURIComponent(`${issuer}:${email}`);
  const params = new URLSearchParams({
    secret,
    issuer,
    algorithm: "SHA1",
    digits: "6",
    period: "30"
  });
  return `otpauth://totp/${label}?${params.toString()}`;
}

function verifyTotp(token: string, secret: string) {
  const cleanToken = token.replace(/\s/g, "");
  const timeStep = Math.floor(Date.now() / 30_000);

  return [-1, 0, 1].some((windowOffset) => generateTotp(secret, timeStep + windowOffset) === cleanToken);
}

function generateTotp(secret: string, timeStep: number) {
  const key = decodeBase32(secret);
  const buffer = Buffer.alloc(8);
  buffer.writeBigUInt64BE(BigInt(timeStep));
  const hmac = createHmac("sha1", key).update(buffer).digest();
  const offset = (hmac[hmac.length - 1] ?? 0) & 0x0f;
  const code =
    (((hmac[offset] ?? 0) & 0x7f) << 24) |
    (((hmac[offset + 1] ?? 0) & 0xff) << 16) |
    (((hmac[offset + 2] ?? 0) & 0xff) << 8) |
    ((hmac[offset + 3] ?? 0) & 0xff);
  return String(code % 1_000_000).padStart(6, "0");
}

function decodeBase32(secret: string) {
  const clean = secret.replace(/=+$/g, "").toUpperCase();
  let bits = "";
  for (const char of clean) {
    const value = base32Alphabet.indexOf(char);
    if (value < 0) {
      throw new Error("Invalid TOTP secret");
    }
    bits += value.toString(2).padStart(5, "0");
  }

  const bytes = bits.match(/.{1,8}/g)?.filter((byte) => byte.length === 8) ?? [];
  return Buffer.from(bytes.map((byte) => Number.parseInt(byte, 2)));
}

function safeEqual(left: string, right: string) {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  return leftBuffer.length === rightBuffer.length && timingSafeEqual(leftBuffer, rightBuffer);
}

function secureEquals(left: string, right: string) {
  const leftHash = createHash("sha256").update(left).digest();
  const rightHash = createHash("sha256").update(right).digest();
  return timingSafeEqual(leftHash, rightHash);
}
