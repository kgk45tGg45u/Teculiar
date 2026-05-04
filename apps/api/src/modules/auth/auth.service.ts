import { BadRequestException, Injectable, UnauthorizedException } from "@nestjs/common";
import { JwtService, type JwtSignOptions } from "@nestjs/jwt";
import { compare, hash } from "bcryptjs";
import { createHash, createHmac, randomBytes, randomUUID } from "crypto";
import { UsersRepository } from "../users/users.repository";
import { LoginDto } from "./dto/login.dto";
import { RegisterDto } from "./dto/register.dto";

type TokenUser = {
  id: string;
  email: string;
  roles: string[];
};

@Injectable()
export class AuthService {
  constructor(
    private readonly jwt: JwtService,
    private readonly users: UsersRepository
  ) {}

  async register(dto: RegisterDto, ipAddress?: string) {
    const existing = await this.users.findByEmail(dto.email);
    if (existing) {
      throw new BadRequestException("Email is already registered");
    }

    const passwordHash = await hash(dto.password, 12);
    const user = await this.users.createUser({
      email: dto.email.toLowerCase(),
      name: dto.name,
      passwordHash
    });

    return this.issueTokens(
      { id: user.id, email: user.email, roles: ["client"] },
      ipAddress,
      undefined
    );
  }

  async login(dto: LoginDto, ipAddress?: string, userAgent?: string) {
    const user = await this.users.findByEmail(dto.email.toLowerCase());
    if (!user || !(await compare(dto.password, user.passwordHash))) {
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
    return this.issueTokens({ id: user.id, email: user.email, roles }, ipAddress, userAgent);
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
      uri: createTotpUri(email, "CrimsonGrid", secret)
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
        secret: process.env.JWT_ACCESS_SECRET,
        expiresIn
      }
    );

    return {
      accessToken,
      refreshToken,
      tokenType: "Bearer"
    };
  }

  private hashToken(token: string) {
    return createHash("sha256").update(token).digest("hex");
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
