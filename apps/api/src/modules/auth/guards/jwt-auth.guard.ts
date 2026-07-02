import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import { accessSecret } from "../../../tenancy/jwt-secrets";

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
      return true;
    } catch {
      throw new UnauthorizedException("Invalid access token");
    }
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
