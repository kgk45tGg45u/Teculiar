import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import test from "node:test";

const globals = readFileSync(new URL("../app/globals.css", import.meta.url), "utf8");
const button = readFileSync(new URL("../components/ui/button.tsx", import.meta.url), "utf8");
const card = readFileSync(new URL("../components/ui/card.tsx", import.meta.url), "utf8");

const uiFiles = [
  "../components/ui/badge.tsx",
  "../components/ui/status-badge.tsx",
  "../components/ui/form-controls.tsx",
  "../components/ui/table.tsx",
  "../components/ui/dialog.tsx",
  "../components/ui/dropdown.tsx",
  "../components/ui/tabs.tsx",
  "../components/ui/layout-primitives.tsx",
  "../components/ui/sidebar-nav.tsx",
  "../components/ui/top-bar.tsx",
  "../components/ui/index.ts"
];

test("electric infrastructure palette is global design source", () => {
  for (const [token, value] of [
    ["--bg", "#eef3f8"],
    ["--surface", "#ffffff"],
    ["--surface-muted", "#e5edf5"],
    ["--text", "#0b1220"],
    ["--muted", "#334155"],
    ["--primary", "#071a2f"],
    ["--primary-hover", "#0f2f52"],
    ["--accent", "#0077b6"],
    ["--accent-2", "#5b21b6"],
    ["--accent-soft", "#d8f1ff"],
    ["--accent-text", "#004b75"],
    ["--on-accent", "#031018"],
    ["--success", "#087443"],
    ["--warning", "#9a5b00"],
    ["--danger", "#b42318"],
    ["--border", "#b9c7d6"],
    ["--sidebar", "#061426"]
  ]) {
    assert.match(globals, new RegExp(`${token}:\\s*${value}`, "i"));
  }

  assert.match(globals, /body\s*\{[\s\S]*background:\s*var\(--bg\)/);
  assert.match(globals, /body\s*\{[\s\S]*color:\s*var\(--text\)/);
});

test("phase 1 reusable visual utilities exist", () => {
  for (const className of [
    "app-shell",
    "page-header",
    "compact-card",
    "compact-button",
    "muted-text",
    "status-badge",
    "compact-table",
    "form-field"
  ]) {
    assert.match(globals, new RegExp(`\\.${className}\\b`));
  }
});

test("phase 2 shared ui components exist without replacing old imports", () => {
  for (const file of uiFiles) {
    assert.equal(existsSync(new URL(file, import.meta.url)), true, file);
  }

  assert.match(button, /variant\?: "primary" \| "secondary" \| "ghost"/);
  assert.match(card, /tone\?: "default" \| "selected"/);
});

test("electric infrastructure readme tracks done and remaining work", () => {
  const docUrl = new URL("../../../docs/electric-infrastructure-readme.md", import.meta.url);
  assert.equal(existsSync(docUrl), true);
  const doc = readFileSync(docUrl, "utf8");
  assert.match(doc, /Phase 1/);
  assert.match(doc, /Phase 2/);
  assert.match(doc, /Remaining/);
  assert.match(doc, /Changelog/);
});
