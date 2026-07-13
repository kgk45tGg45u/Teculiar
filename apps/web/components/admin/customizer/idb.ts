// Browser-local autosave buffer (Phase 3c, storage layer 1). Survives refresh / crash / lost
// connection BEFORE an explicit Save writes the durable server draft. One record per pageId. On
// reopen the builder compares `savedAt` to the server `draftUpdatedAt` to offer "Restore unsaved
// changes". Best-effort: every op degrades to a no-op when IndexedDB is unavailable.
import type { LayoutDoc } from "@teculiar/web-core/lib/customizer/types";

const DB_NAME = "dezhost-customizer";
const STORE = "drafts";
const VERSION = 1;

export type DraftBuffer = { pageId: string; doc: LayoutDoc; savedAt: number };

function openDb(): Promise<IDBDatabase | null> {
  return new Promise((resolve) => {
    if (typeof indexedDB === "undefined") {
      resolve(null);
      return;
    }
    const request = indexedDB.open(DB_NAME, VERSION);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(STORE)) {
        request.result.createObjectStore(STORE, { keyPath: "pageId" });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => resolve(null);
  });
}

export async function loadBuffer(pageId: string): Promise<DraftBuffer | null> {
  const db = await openDb();
  if (!db) {
    return null;
  }
  try {
    return await new Promise<DraftBuffer | null>((resolve) => {
      const request = db.transaction(STORE, "readonly").objectStore(STORE).get(pageId);
      request.onsuccess = () => resolve((request.result as DraftBuffer) ?? null);
      request.onerror = () => resolve(null);
    });
  } finally {
    db.close();
  }
}

export async function saveBuffer(pageId: string, doc: LayoutDoc): Promise<void> {
  const db = await openDb();
  if (!db) {
    return;
  }
  try {
    await new Promise<void>((resolve) => {
      const tx = db.transaction(STORE, "readwrite");
      tx.objectStore(STORE).put({ pageId, doc, savedAt: Date.now() } satisfies DraftBuffer);
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
    });
  } finally {
    db.close();
  }
}

export async function clearBuffer(pageId: string): Promise<void> {
  const db = await openDb();
  if (!db) {
    return;
  }
  try {
    await new Promise<void>((resolve) => {
      const tx = db.transaction(STORE, "readwrite");
      tx.objectStore(STORE).delete(pageId);
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
    });
  } finally {
    db.close();
  }
}
