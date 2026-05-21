import assert from "node:assert/strict";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import test from "node:test";

const globals = readFileSync(new URL("../app/globals.css", import.meta.url), "utf8");
const button = readFileSync(new URL("../components/ui/button.tsx", import.meta.url), "utf8");
const card = readFileSync(new URL("../components/ui/card.tsx", import.meta.url), "utf8");
const clientDashboardCss = readFileSync(new URL("../components/portal/client-dashboard.module.css", import.meta.url), "utf8");
const clientDashboardTsx = readFileSync(new URL("../components/portal/client-dashboard.tsx", import.meta.url), "utf8");
const adminDashboardCss = readFileSync(new URL("../components/admin/admin-dashboard.module.css", import.meta.url), "utf8");
const adminDashboardTsx = readFileSync(new URL("../components/admin/admin-dashboard.tsx", import.meta.url), "utf8");
const siteHeaderCss = readFileSync(new URL("../components/layout/site-header.module.css", import.meta.url), "utf8");

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

test("phase 3 admin and client shells use compact electric sidebar", () => {
  for (const css of [clientDashboardCss, adminDashboardCss]) {
    assert.match(css, /\.page\s*\{[\s\S]*background:\s*var\(--bg\)/);
    assert.match(css, /\.sidebar\s*\{[\s\S]*background:\s*var\(--sidebar\)/);
    assert.match(css, /\.sidebar a\s*\{[\s\S]*min-height:\s*34px/);
    assert.match(css, /\.sidebar a\[aria-current="page"\]/);
    assert.match(css, /\.main\s*\{[\s\S]*gap:\s*16px/);
  }

  assert.match(clientDashboardTsx, /aria-current=\{clientNavCurrent/);
  assert.match(adminDashboardTsx, /aria-current=\{adminNavCurrent/);
});

test("phase 4 and 5 dashboards match compact card and table density", () => {
  for (const css of [clientDashboardCss, adminDashboardCss]) {
    assert.match(css, /\.module\s*\{[\s\S]*padding:\s*16px/);
    assert.match(css, /\.tableWrap|\.panel\s*\{/);
    assert.match(css, /box-shadow:\s*var\(--shadow-soft\)/);
  }

  assert.match(globals, /\.metric\s*\{[\s\S]*padding:\s*12px/);
  assert.match(globals, /\.table th,\n\.table td\s*\{[\s\S]*padding:\s*8px 12px/);
});

test("phase 6 public surfaces are compact and non-red branded", () => {
  assert.match(globals, /\.section\s*\{[\s\S]*padding:\s*64px 0/);
  assert.match(globals, /\.display\s*\{[\s\S]*font-size:\s*clamp\(2\.6rem/);
  assert.match(siteHeaderCss, /\.inner\s*\{[\s\S]*min-height:\s*62px/);
});

test("css does not keep old crimson rgb brand accents", () => {
  const root = new URL("../", import.meta.url);
  const cssFiles = listCssFiles(root);
  for (const file of cssFiles) {
    assert.doesNotMatch(readFileSync(file, "utf8"), /rgba\(177,\s*18,\s*38/i, file.pathname);
  }
});

function listCssFiles(dir) {
  const files = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === "node_modules" || entry.name === ".next") {
      continue;
    }
    const url = new URL(`${entry.name}${entry.isDirectory() ? "/" : ""}`, dir);
    if (entry.isDirectory()) {
      files.push(...listCssFiles(url));
    } else if (entry.name.endsWith(".css")) {
      files.push(url);
    }
  }
  return files;
}
