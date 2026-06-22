/**
 * i18n-sync — the documented sync + versioning tool for packages/locales.
 *
 * English (SOURCE_LOCALE) is the source of truth. For every other language this tool:
 *   - prunes keys that no longer exist in English,
 *   - fills missing keys (DeepSeek API when DEEPSEEK_API_KEY is set, else English placeholder),
 *   - rewrites each namespace in English key order,
 *   - refreshes manifest.updatedAt (and bumps the patch version with --bump).
 *
 * In --check mode it makes no writes and exits non-zero unless every language pack has the
 * exact same key set as English and the manifest is internally consistent. Wire that into CI.
 *
 * Run from the repo root (Node 24 strips the TS types automatically):
 *   node scripts/i18n-sync.ts --check
 *   node scripts/i18n-sync.ts
 *   node scripts/i18n-sync.ts --bump
 */
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const LOCALES_DIR = join(ROOT, "packages", "locales");
const MANIFEST_PATH = join(LOCALES_DIR, "manifest.json");
const SOURCE_LOCALE = "en";
const NAMESPACES = ["common", "admin", "client", "storefront", "email", "invoice", "meta"];

type Json = Record<string, unknown>;
type Manifest = { version: string; languages: string[]; updatedAt: string };

const args = new Set(process.argv.slice(2));
const CHECK = args.has("--check");
const BUMP = args.has("--bump");

function readJson(path: string): Json {
  return JSON.parse(readFileSync(path, "utf8"));
}

function nsPath(locale: string, ns: string): string {
  return join(LOCALES_DIR, locale, `${ns}.json`);
}

function isObject(value: unknown): value is Json {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Flatten an object to a sorted list of dotted leaf keys. */
function flattenKeys(obj: Json, prefix = ""): string[] {
  const keys: string[] = [];
  for (const [key, value] of Object.entries(obj)) {
    const dotted = prefix ? `${prefix}.${key}` : key;
    if (isObject(value)) {
      keys.push(...flattenKeys(value, dotted));
    } else {
      keys.push(dotted);
    }
  }
  return keys.sort();
}

function getAt(obj: Json, dotted: string): unknown {
  let node: unknown = obj;
  for (const part of dotted.split(".")) {
    if (!isObject(node)) return undefined;
    node = node[part];
  }
  return node;
}

function setAt(obj: Json, dotted: string, value: unknown): void {
  const parts = dotted.split(".");
  let node: Json = obj;
  for (let i = 0; i < parts.length - 1; i++) {
    const part = parts[i]!;
    if (!isObject(node[part])) node[part] = {};
    node = node[part] as Json;
  }
  node[parts[parts.length - 1]!] = value;
}

/** Rebuild `target` so it mirrors `source`'s shape/order, keeping target's own leaf values. */
function reshapeLike(source: Json, target: Json): Json {
  const out: Json = {};
  for (const [key, value] of Object.entries(source)) {
    if (isObject(value)) {
      out[key] = reshapeLike(value, isObject(target[key]) ? (target[key] as Json) : {});
    } else if (key in target && !isObject(target[key])) {
      out[key] = target[key];
    } else {
      out[key] = value; // missing in target — seeded below by fill step / placeholder
    }
  }
  return out;
}

async function deepseekTranslate(text: string, targetCode: string): Promise<string | null> {
  const apiKey = process.env.DEEPSEEK_API_KEY;
  if (!apiKey) return null;
  try {
    const res = await fetch("https://api.deepseek.com/chat/completions", {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model: "deepseek-chat",
        temperature: 0,
        messages: [
          {
            role: "system",
            content:
              `You translate UI strings from English to the locale "${targetCode}". ` +
              "Preserve all {{placeholders}}, HTML tags and inline styles exactly. " +
              "Return only the translated string, no quotes, no explanation."
          },
          { role: "user", content: text }
        ]
      })
    });
    if (!res.ok) {
      console.warn(`  ! DeepSeek HTTP ${res.status} — seeding English placeholder`);
      return null;
    }
    const data = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> };
    return data.choices?.[0]?.message?.content?.trim() ?? null;
  } catch (err) {
    console.warn(`  ! DeepSeek error (${(err as Error).message}) — seeding English placeholder`);
    return null;
  }
}

function checkPacks(manifest: Manifest): string[] {
  const problems: string[] = [];
  const langs = manifest.languages;
  if (!langs.includes(SOURCE_LOCALE)) {
    problems.push(`manifest.languages must include the source locale "${SOURCE_LOCALE}"`);
  }
  for (const ns of NAMESPACES) {
    const sourcePath = nsPath(SOURCE_LOCALE, ns);
    if (!existsSync(sourcePath)) {
      problems.push(`missing source namespace ${SOURCE_LOCALE}/${ns}.json`);
      continue;
    }
    const sourceKeys = flattenKeys(readJson(sourcePath));
    for (const lang of langs) {
      if (lang === SOURCE_LOCALE) continue;
      const path = nsPath(lang, ns);
      if (!existsSync(path)) {
        problems.push(`missing ${lang}/${ns}.json`);
        continue;
      }
      const keys = flattenKeys(readJson(path));
      const missing = sourceKeys.filter((k) => !keys.includes(k));
      const extra = keys.filter((k) => !sourceKeys.includes(k));
      if (missing.length) problems.push(`${lang}/${ns}.json missing ${missing.length} key(s): ${missing.slice(0, 5).join(", ")}${missing.length > 5 ? "…" : ""}`);
      if (extra.length) problems.push(`${lang}/${ns}.json has ${extra.length} stray key(s): ${extra.slice(0, 5).join(", ")}${extra.length > 5 ? "…" : ""}`);
    }
  }
  return problems;
}

async function syncPacks(manifest: Manifest): Promise<void> {
  for (const ns of NAMESPACES) {
    const source = readJson(nsPath(SOURCE_LOCALE, ns));
    const sourceKeys = flattenKeys(source);
    for (const lang of manifest.languages) {
      if (lang === SOURCE_LOCALE) continue;
      const path = nsPath(lang, ns);
      const existing = existsSync(path) ? readJson(path) : {};
      // Prune + reorder to match English, keeping existing translations.
      const reshaped = reshapeLike(source, existing);
      // Fill keys still equal to the English source value (i.e. untranslated / newly added).
      let filled = 0;
      for (const key of sourceKeys) {
        const sourceVal = getAt(source, key);
        const targetVal = getAt(reshaped, key);
        const wasPresent = getAt(existing, key) !== undefined && !isObject(getAt(existing, key));
        if (wasPresent) continue;
        if (typeof sourceVal === "string") {
          const translated = await deepseekTranslate(sourceVal, lang);
          setAt(reshaped, key, translated ?? sourceVal);
          filled++;
        } else {
          setAt(reshaped, key, targetVal);
        }
      }
      writeFileSync(path, `${JSON.stringify(reshaped, null, 2)}\n`, "utf8");
      console.log(`  ${lang}/${ns}.json — ${filled} key(s) filled`);
    }
  }
}

async function main(): Promise<void> {
  const manifest = readJson(MANIFEST_PATH) as Manifest;
  const problems = checkPacks(manifest);

  if (CHECK) {
    if (problems.length) {
      console.error("i18n-sync --check FAILED:");
      for (const p of problems) console.error(`  - ${p}`);
      process.exit(1);
    }
    console.log(`i18n-sync --check OK — ${manifest.languages.length} language(s), version ${manifest.version}`);
    return;
  }

  console.log("i18n-sync: pruning + filling non-English packs against English source…");
  await syncPacks(manifest);

  manifest.updatedAt = new Date().toISOString().slice(0, 10);
  if (BUMP) {
    const [major, minor, patch] = manifest.version.split(".").map((n) => parseInt(n, 10) || 0);
    manifest.version = `${major}.${minor}.${patch + 1}`;
    console.log(`  manifest version bumped to ${manifest.version}`);
  }
  writeFileSync(MANIFEST_PATH, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
  console.log(`Done. manifest.updatedAt=${manifest.updatedAt}, version=${manifest.version}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
