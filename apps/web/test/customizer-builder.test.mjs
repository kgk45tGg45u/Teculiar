import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import test from "node:test";

// Phase 3c — Customizer builder shell. Static-source checks lock the contract (the drag/edit/save/
// publish/restore lifecycle is exercised manually against a running stack + Playwright); mirrors the
// style of customizer-foundation.test.mjs.
const read = (rel) => readFileSync(new URL(rel, import.meta.url), "utf8");
const json = (rel) => JSON.parse(read(rel));

const pkg = json("../package.json");
const builder = read("../components/admin/customizer/builder.tsx");
const tree = read("../components/admin/customizer/tree.ts");
const idb = read("../components/admin/customizer/idb.ts");
const api = read("../components/admin/customizer/api.ts");
const palette = read("../components/admin/customizer/palette.tsx");
const canvas = read("../components/admin/customizer/canvas.tsx");
const editModal = read("../components/admin/customizer/edit-modal.tsx");
const pagesTab = read("../components/admin/theme/pages-tab.tsx");
const enAdmin = json("../../../packages/locales/en/admin.json");
const deAdmin = json("../../../packages/locales/de/admin.json");

test("@dnd-kit is a declared web dependency + builder route exists", () => {
  for (const dep of ["@dnd-kit/core", "@dnd-kit/sortable", "@dnd-kit/utilities"]) {
    assert.ok(pkg.dependencies[dep], `missing dependency ${dep}`);
  }
  assert.ok(existsSync(new URL("../app/admin/theme/customizer/[pageKey]/page.tsx", import.meta.url)));
});

test("builder shell: dnd-kit canvas, Save/Publish, IndexedDB autosave, beforeunload guard", () => {
  assert.match(builder, /DndContext/);
  assert.match(builder, /DragOverlay/);
  assert.match(builder, /closestCenter/);
  assert.match(builder, /saveDraft\(pageId, doc\)/); // Save → server draft
  assert.match(builder, /publish\(pageId, doc\)/); // Publish → go live
  assert.match(builder, /saveBuffer\(pageId, doc\)/); // debounced IndexedDB autosave
  assert.match(builder, /loadBuffer\(pageId\)/); // restore-on-open
  assert.match(builder, /"beforeunload"/); // dirty guard
  assert.match(builder, /setComponent\("custom"\)/); // publish flips the live badge
});

test("immutable tree helpers cover insert/move/remove/update", () => {
  for (const fn of ["findNode", "parentContainerId", "childrenOf", "removeNode", "insertNode", "updateNode", "containsId"]) {
    assert.ok(tree.includes(`export function ${fn}`), `tree missing ${fn}`);
  }
});

test("IndexedDB buffer + API client expose the full surface", () => {
  for (const fn of ["loadBuffer", "saveBuffer", "clearBuffer"]) {
    assert.ok(idb.includes(`export async function ${fn}`), `idb missing ${fn}`);
  }
  for (const fn of ["saveDraft", "publish", "revertTo", "listVersions", "translateTexts", "getPage"]) {
    assert.ok(api.includes(fn), `api missing ${fn}`);
  }
});

test("palette is registry-driven; canvas uses sortable + droppable contexts", () => {
  assert.match(palette, /listElements\(\)/);
  assert.match(palette, /useDraggable/);
  assert.match(canvas, /useSortable/);
  assert.match(canvas, /useDroppable/);
  assert.match(canvas, /SortableContext/);
  assert.match(canvas, /mode="preview"/); // same registry render as live
});

test("edit modal reuses translate slots + per-field DeepSeek auto-translate", () => {
  assert.match(editModal, /def\.textSlots\.map/);
  assert.match(editModal, /def\.propSchema\.map/);
  assert.match(editModal, /translateTexts\(/);
});

test("Pages tab links to the builder; locale packs carry admin.customizer (en + de)", () => {
  assert.match(pagesTab, /\/admin\/theme\/customizer\/\$\{page\.key\}/);
  assert.ok(enAdmin.themeBuilder.customize && deAdmin.themeBuilder.customize, "themeBuilder.customize missing");
  assert.ok(enAdmin.customizer && deAdmin.customizer, "admin.customizer group missing");
  assert.deepEqual(Object.keys(enAdmin.customizer).sort(), Object.keys(deAdmin.customizer).sort());
  assert.deepEqual(Object.keys(enAdmin.customizer.slots).sort(), Object.keys(deAdmin.customizer.slots).sort());
});
