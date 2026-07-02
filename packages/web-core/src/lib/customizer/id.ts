// Stable node ids for layout docs (DnD keys + edit targets). Uses the platform crypto UUID, which
// exists in both the Node server runtime and the browser, so no extra dependency is needed.
export function newId(): string {
  return (globalThis.crypto?.randomUUID?.() ?? `n-${Math.random().toString(36).slice(2)}-${Date.now().toString(36)}`).slice(0, 21);
}
