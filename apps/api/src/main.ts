// entry point
import "reflect-metadata";
import { ValidationPipe } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import { NestExpressApplication } from "@nestjs/platform-express";
import cookieParser from "cookie-parser";
import helmet from "helmet";
import { resolve } from "node:path";
import { AppModule } from "./app.module";

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);

  // Serve the shared uploads volume as static files.
  // Apache proxies /uploads/ → this port (4000), bypassing Next.js entirely.
  const uploadsDir = resolve(process.cwd(), "apps/web/public/uploads");
  app.useStaticAssets(uploadsDir, { prefix: "/uploads" });
  app.setGlobalPrefix("api/v1");
  app.enableCors({
    origin: corsOrigin,
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

function allowedOrigins() {
  const origins = [
    process.env.APP_URL,
    process.env.PUBLIC_WEB_URL,
    process.env.NEXT_PUBLIC_WEB_URL,
    process.env.CORS_ORIGINS,
    "http://localhost:3000",
    "http://127.0.0.1:3000"
  ]
    .flatMap((value) => value?.split(",") ?? [])
    .map((value) => value.trim().replace(/\/$/, ""))
    .filter(Boolean);

  return Array.from(new Set(origins));
}

// Domain suffixes whose subdomains are always allowed (multi-tenant, Phase 4.1). Every
// tenant lives at <subdomain>.teculiar.net; teculiar.com is the dogfood storefront.
// Extra buyer domains can be added via CORS_TENANT_SUFFIXES (comma-separated).
function tenantOriginSuffixes() {
  const extra = (process.env.CORS_TENANT_SUFFIXES ?? "")
    .split(",")
    .map((value) => value.trim().toLowerCase())
    .filter(Boolean);
  return ["teculiar.net", "teculiar.com", ...extra];
}

// CORS callback: allow the configured static origins plus any host under a tenant
// suffix (apex or subdomain). Same-origin / server-to-server requests carry no Origin.
function corsOrigin(origin: string | undefined, callback: (err: Error | null, allow?: boolean) => void) {
  if (!origin) {
    callback(null, true);
    return;
  }
  const normalized = origin.trim().replace(/\/$/, "");
  if (allowedOrigins().includes(normalized)) {
    callback(null, true);
    return;
  }
  let hostname = "";
  try {
    hostname = new URL(origin).hostname.toLowerCase();
  } catch {
    callback(null, false);
    return;
  }
  const allowed = tenantOriginSuffixes().some(
    (suffix) => hostname === suffix || hostname.endsWith(`.${suffix}`)
  );
  callback(null, allowed);
}
