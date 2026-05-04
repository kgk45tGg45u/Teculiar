import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";

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
        secret: process.env.JWT_ACCESS_SECRET
      });
      return true;
    } catch {
      throw new UnauthorizedException("Invalid access token");
    }
  }
}
