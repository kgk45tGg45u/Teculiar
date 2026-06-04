import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { test } from "node:test";

test("production deployment files describe GitHub Actions and server Docker wiring", async () => {
  const workflow = await readFile(new URL("../../../.github/workflows/deploy.yml", import.meta.url), "utf8");
  const compose = await readFile(new URL("../../../docker-compose.prod.yml", import.meta.url), "utf8");
  const apiDockerfile = await readFile(new URL("../../../Dockerfile.api", import.meta.url), "utf8");
  const webDockerfile = await readFile(new URL("../../../Dockerfile.web", import.meta.url), "utf8");
  const envExample = await readFile(new URL("../../../.env.example", import.meta.url), "utf8");
  const docs = await readFile(new URL("../../../DEPLOYMENT.md", import.meta.url), "utf8");

  assert.match(workflow, /docker\/build-push-action@v6/);
  assert.match(workflow, /ghcr\.io/);
  assert.match(workflow, /SSH_PRIVATE_KEY/);
  assert.match(workflow, /docker compose -f docker-compose\.prod\.yml pull/);
  assert.match(workflow, /docker compose -f docker-compose\.prod\.yml up -d --remove-orphans/);

  assert.match(compose, /image:\s*ghcr\.io\/[^/\s]+\/dezhost-api:latest/);
  assert.match(compose, /image:\s*ghcr\.io\/[^/\s]+\/dezhost-web:latest/);
  assert.match(compose, /127\.0\.0\.1:4000:4000/);
  assert.match(compose, /127\.0\.0\.1:3000:3000/);
  assert.match(compose, /\/opt\/dezhost\/\.env/);

  assert.match(apiDockerfile, /prisma migrate deploy --schema prisma\/schema\.prisma/);
  assert.match(webDockerfile, /ARG NEXT_PUBLIC_API_URL/);

  for (const key of ["DATABASE_URL", "NEXT_PUBLIC_API_URL", "APP_URL", "PUBLIC_WEB_URL", "PUBLIC_API_URL", "JWT_ACCESS_SECRET", "JWT_REFRESH_SECRET", "EMERGENCY_ADMIN_EMAIL", "EMERGENCY_ADMIN_PASSWORD"]) {
    assert.match(envExample, new RegExp(`^${key}=`, "m"));
  }

  assert.match(envExample, /^DATABASE_URL=mysql:\/\/USER:PASSWORD@127\.0\.0\.1:3306\/dezhost_hosting$/m);
  assert.match(docs, /https:\/\/www\.dezhost\.com\/api\/v1/);
  assert.match(docs, /GitHub Actions builds Docker images/);
  assert.match(docs, /docker compose pull/);
});

test("api exposes a deployment health endpoint", async () => {
  const controller = await readFile(new URL("../src/health.controller.ts", import.meta.url), "utf8");
  const appModule = await readFile(new URL("../src/app.module.ts", import.meta.url), "utf8");
  const main = await readFile(new URL("../src/main.ts", import.meta.url), "utf8");

  assert.match(controller, /@Controller\("health"\)/);
  assert.match(controller, /status:\s*"ok"/);
  assert.match(appModule, /HealthController/);
  assert.match(main, /CORS_ORIGINS/);
  assert.match(main, /0\.0\.0\.0/);
});

test("deployment files do not commit local secrets", async () => {
  assert.ok(existsSync(new URL("../../../.env", import.meta.url)));
  const gitignore = await readFile(new URL("../../../.gitignore", import.meta.url), "utf8");
  const envExample = await readFile(new URL("../../../.env.example", import.meta.url), "utf8");

  assert.match(gitignore, /^\.env$/m);
  assert.doesNotMatch(envExample, /mysql:\/\/(?!USER:PASSWORD@)[^@\n]+@/);
  assert.doesNotMatch(envExample, new RegExp("post" + "gresql://[^@\\n]+@"));
  assert.doesNotMatch(envExample, /RESELLBIZ_API_KEY=.+/);
  assert.doesNotMatch(envExample, /JWT_ACCESS_SECRET=.+/);
});
