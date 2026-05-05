import { existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";

export function findDotEnv(startDir = process.cwd()): string | undefined {
  let current = resolve(startDir);

  while (true) {
    const candidate = join(current, ".env");
    if (existsSync(candidate)) {
      return candidate;
    }

    const parent = dirname(current);
    if (parent === current) {
      return undefined;
    }

    current = parent;
  }
}

export function loadDotEnv(file = findDotEnv(), env: Record<string, string | undefined> = process.env): void {
  if (!file || !existsSync(file)) {
    return;
  }

  for (const line of readFileSync(file, "utf8").split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
    const key = match?.[1];
    const value = match?.[2];
    if (!key || value === undefined || env[key] !== undefined) {
      continue;
    }

    env[key] = unquote(value);
  }
}

function unquote(value: string): string {
  const trimmed = value.trim();
  if (
    (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'"))
  ) {
    return trimmed.slice(1, -1);
  }

  return trimmed;
}
