// entry point
import "reflect-metadata";
import { ValidationPipe } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import { NestExpressApplication } from "@nestjs/platform-express";
import cookieParser from "cookie-parser";
import helmet from "helmet";
import { resolve } from "node:path";
import { AppModule } from "./app.module";
import { uploadsTenantGuard } from "./common/uploads-guard";
import { makeCorsOrigin } from "./cors-origin";
import { ControlPlaneService } from "./tenancy/control-plane.service";

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);
  const controlPlane = app.get(ControlPlaneService, { strict: false });

  // Serve the uploads volume as static files (Caddy proxies /uploads/ → this port, bypassing Next).
  // Phase 8.2: a tenant guard runs FIRST so scoped files (/uploads/<tenant>/…) are only served to
  // their owning tenant; legacy flat paths stay world-readable for backward compatibility.
  const uploadsDir = resolve(process.cwd(), "apps/web/public/uploads");
  app.use("/uploads", uploadsTenantGuard(controlPlane));
  app.useStaticAssets(uploadsDir, { prefix: "/uploads" });
  app.setGlobalPrefix("api/v1");
  app.enableCors({
    // Static origins + tenant suffixes, plus registered ACTIVE tenant custom domains (Phase 4.6).
    origin: makeCorsOrigin(controlPlane),
    credentials: true
  });
  app.use(helmet());
  app.use(cookieParser());
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true
    })
  );

  await app.listen(process.env.PORT ? Number(process.env.PORT) : 4000, process.env.HOST ?? "0.0.0.0");
}

void bootstrap();
