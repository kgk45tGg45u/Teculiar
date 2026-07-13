// Copy the canonical JSON packs + manifest next to the compiled dist/index.js so the
// CommonJS build (consumed by apps/api at runtime) can require("./en/common.json") etc.
// apps/web reads the .ts source directly via tsconfig path mapping, so it does not need this.
import { cpSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const pkgRoot = join(here, "..");
const dist = join(pkgRoot, "dist");

mkdirSync(dist, { recursive: true });
for (const entry of ["manifest.json", "en", "de"]) {
  cpSync(join(pkgRoot, entry), join(dist, entry), { recursive: true });
}
console.log("[@teculiar/locales] copied JSON packs + manifest to dist/");
