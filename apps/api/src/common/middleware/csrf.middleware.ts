import { Injectable, NestMiddleware, ForbiddenException } from "@nestjs/common";
import type { NextFunction, Request, Response } from "express";

const safeMethods = new Set(["GET", "HEAD", "OPTIONS"]);

@Injectable()
export class CsrfMiddleware implements NestMiddleware {
  use(req: Request, _res: Response, next: NextFunction) {
    if (safeMethods.has(req.method)) {
      next();
      return;
    }

    const tokenFromHeader = req.header("x-csrf-token");
    const tokenFromCookie = req.cookies?.csrf_token as string | undefined;

    if (tokenFromCookie && tokenFromHeader !== tokenFromCookie) {
      throw new ForbiddenException("Invalid CSRF token");
    }

    next();
  }
}
