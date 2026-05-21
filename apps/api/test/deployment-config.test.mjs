import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { test } from "node:test";

test("preview deployment files describe Vercel, Render, and Neon wiring", async () => {
  const render = await readFile(new URL("../../../render.yaml", import.meta.url), "utf8");
  const vercel = await readFile(new URL("../../../vercel.json", import.meta.url), "utf8");
  const envExample = await readFile(new URL("../../../.env.example", import.meta.url), "utf8");
  const docs = await readFile(new URL("../../../docs/preview-deployment.md", import.meta.url), "utf8");

  assert.match(render, /type:\s*web/);
  assert.match(render, /npm --workspace @crimson\/api run build/);
  assert.match(render, /npm exec prisma migrate deploy -- --schema prisma\/schema\.prisma/);
  assert.match(render, /healthCheckPath:\s*\/api\/v1\/health/);

  assert.match(vercel, /"installCommand": "npm install"/);
  assert.match(vercel, /"buildCommand": "npm --workspace @crimson\/web run build"/);
  assert.match(vercel, /"framework": "nextjs"/);

  for (const key of ["DATABASE_URL", "NEXT_PUBLIC_API_URL", "APP_URL", "PUBLIC_WEB_URL", "PUBLIC_API_URL", "JWT_ACCESS_SECRET", "JWT_REFRESH_SECRET"]) {
    assert.match(envExample, new RegExp(`^${key}=`, "m"));
  }

  assert.match(docs, /Neon Postgres/);
  assert.match(docs, /Render/);
  assert.match(docs, /Vercel/);
});

test("api exposes a render-compatible health endpoint", async () => {
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
  assert.doesNotMatch(envExample, /postgresql:\/\/[^@\n]+@/);
  assert.doesNotMatch(envExample, /RESELLBIZ_API_KEY=.+/);
  assert.doesNotMatch(envExample, /JWT_ACCESS_SECRET=.+/);
});
