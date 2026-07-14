import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

// Page mirrors + universal flip wiring: every storefront page (except blog) gets a Customizer DRAFT
// mirroring its content, and every such route renders its published layout when one exists else its
// built-in renderer. Seeded as drafts only → live is untouched until an admin publishes a page.
const read = (rel) => readFileSync(new URL(rel, import.meta.url), "utf8");

const mirrors = read("../../api/src/modules/theme/page-mirrors.ts");
const repo = read("../../api/src/modules/theme/theme.repository.ts");
const registryIndex = read("../../../packages/web-core/src/lib/customizer/registry/index.ts");

const GATED = {
  webhosting: "webhosting/page.tsx",
  "virtual-servers": "virtual-servers/page.tsx",
  reseller: "reseller/page.tsx",
  webdesign: "webdesign/page.tsx",
  "it-losungen": "it-losungen/page.tsx",
  domains: "domains/page.tsx",
  kontakt: "kontakt/page.tsx",
  "legal-impressum": "legal/impressum/page.tsx",
  "legal-datenschutz": "legal/datenschutz/page.tsx",
  "legal-agb": "legal/agb/page.tsx",
  "legal-zahlung": "legal/zahlung/page.tsx",
  "legal-widerruf": "legal/widerruf/page.tsx"
};
const MIRROR_KEYS = ["home", "uber-uns", ...Object.keys(GATED)];

test("page-mirrors covers every storefront page (blog excepted)", () => {
  for (const key of MIRROR_KEYS) {
    assert.match(mirrors, new RegExp(`"${key}":|\\b${key}:`), `mirror missing for ${key}`);
  }
  assert.doesNotMatch(mirrors, /\bblog:/); // blog needs a dedicated element — intentionally not mirrored yet
});

test("mirror drafts are seeded idempotently (drafts only, never published)", () => {
  assert.match(repo, /async ensureMirrorDrafts/);
  assert.match(repo, /page\.draftLayout == null/); // only fill pages without a draft
  assert.match(repo, /this\.mirrorsSeeded\.has\(tenantKey\)/); // once per tenant per process (Phase 3.3)
  assert.doesNotMatch(repo, /publishedLayout:/); // the seed never publishes
});

test("home + uber-uns + all gated routes wrap their built-in renderer in the gate", () => {
  for (const [key, rel] of Object.entries(GATED)) {
    const src = read(`../../storefront/app/[locale]/${rel}`);
    assert.match(src, new RegExp(`<CustomPageGate locale=\\{locale\\} pageKey="${key}">`), `gate missing in ${rel}`);
    assert.match(src, /BuiltIn locale=\{locale\}/, `built-in extraction missing in ${rel}`);
  }
  const home = read("../../storefront/app/[locale]/page.tsx");
  assert.match(home, /pageKey="home"/);
});

test("domainSearch element is registered", () => {
  assert.match(registryIndex, /domainSearchDef/);
});
