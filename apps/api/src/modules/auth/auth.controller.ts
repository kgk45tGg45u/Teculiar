import { Body, Controller, Get, Post, Req, UseGuards } from "@nestjs/common";
import type { Request } from "express";
import { JwtAuthGuard } from "./guards/jwt-auth.guard";
import { AuthService } from "./auth.service";
import { LoginDto } from "./dto/login.dto";
import { RefreshTokenDto } from "./dto/refresh-token.dto";
import { RegisterDto } from "./dto/register.dto";
import { SsoExchangeDto, SsoRedeemDto } from "./dto/sso.dto";
import { VerifyTotpDto } from "./dto/verify-totp.dto";

@Controller("auth")
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Post("register")
  register(@Body() dto: RegisterDto, @Req() request: Request) {
    return this.auth.register(dto, request.ip);
  }

  @Post("bootstrap-admin")
  bootstrapAdmin(@Body() dto: RegisterDto, @Req() request: Request) {
    return this.auth.bootstrapAdmin(dto, request.ip, request.header("user-agent"));
  }

  @Post("login")
  login(@Body() dto: LoginDto, @Req() request: Request) {
    return this.auth.login(dto, request.ip, request.header("user-agent"));
  }

  @Post("refresh")
  refresh(@Body() dto: RefreshTokenDto, @Req() request: Request) {
    return this.auth.refresh(dto.refreshToken, request.ip, request.header("user-agent"));
  }

  @Post("password-reset/request")
  requestPasswordReset(@Body() body: { email: string }) {
    return this.auth.requestPasswordReset(body.email ?? "");
  }

  @Post("password-reset/confirm")
  confirmPasswordReset(@Body() body: { password: string; token: string }) {
    return this.auth.confirmPasswordReset(body.token ?? "", body.password ?? "");
  }

  @UseGuards(JwtAuthGuard)
  @Post("logout")
  logout(@Body() dto: RefreshTokenDto) {
    return this.auth.logout(dto.refreshToken);
  }

  // Cross-origin session handoff (Phase 4.6e): mint a one-time code on the origin that HAS the session…
  @UseGuards(JwtAuthGuard)
  @Post("sso/exchange")
  ssoExchange(
    @Req() request: Request & { user: { sub: string; email: string; roles?: string[] } },
    @Body() dto: SsoExchangeDto
  ) {
    return this.auth.ssoExchange(
      { id: request.user.sub, email: request.user.email, roles: request.user.roles ?? [] },
      dto.targetOrigin,
      dto.codeChallenge
    );
  }

  // …and redeem it (with the PKCE verifier) on the target origin for fresh host-local tokens.
  @Post("sso/redeem")
  ssoRedeem(@Body() dto: SsoRedeemDto, @Req() request: Request) {
    return this.auth.ssoRedeem(dto.code, dto.codeVerifier, request.headers.host, request.ip, request.header("user-agent"));
  }

  @UseGuards(JwtAuthGuard)
  @Get("2fa/setup")
  setupTwoFactor(@Req() request: Request & { user: { sub: string; email: string } }) {
    return this.auth.setupTwoFactor(request.user.sub, request.user.email);
  }

  @UseGuards(JwtAuthGuard)
  @Post("2fa/verify")
  verifyTwoFactor(@Req() request: Request & { user: { sub: string } }, @Body() dto: VerifyTotpDto) {
    return this.auth.verifyTwoFactor(request.user.sub, dto.code);
  }
}
