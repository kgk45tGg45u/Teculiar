import "reflect-metadata";
import { ValidationPipe } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import cookieParser from "cookie-parser";
import helmet from "helmet";
import { AppModule } from "./app.module";

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.setGlobalPrefix("api/v1");
  app.enableCors({
    origin: allowedOrigins(),
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
