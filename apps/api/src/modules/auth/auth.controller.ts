import { Body, Controller, Get, Post, Req, UseGuards } from "@nestjs/common";
import type { Request } from "express";
import { JwtAuthGuard } from "./guards/jwt-auth.guard";
import { AuthService } from "./auth.service";
import { LoginDto } from "./dto/login.dto";
import { RefreshTokenDto } from "./dto/refresh-token.dto";
import { RegisterDto } from "./dto/register.dto";
import { VerifyTotpDto } from "./dto/verify-totp.dto";

@Controller("auth")
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Post("register")
  register(@Body() dto: RegisterDto, @Req() request: Request) {
    return this.auth.register(dto, request.ip);
  }

  @Post("login")
  login(@Body() dto: LoginDto, @Req() request: Request) {
    return this.auth.login(dto, request.ip, request.header("user-agent"));
  }

  @Post("refresh")
  refresh(@Body() dto: RefreshTokenDto, @Req() request: Request) {
    return this.auth.refresh(dto.refreshToken, request.ip, request.header("user-agent"));
  }

  @UseGuards(JwtAuthGuard)
  @Post("logout")
  logout(@Body() dto: RefreshTokenDto) {
    return this.auth.logout(dto.refreshToken);
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
