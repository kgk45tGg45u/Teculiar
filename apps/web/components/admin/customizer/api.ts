// Typed client for the admin Customizer API (Phase 3c). Mutations return the raw Response so callers
// can pass it to notifyResponse (surfacing the server's message, incl. the clean 502 from a failed
// auto-translate); reads return parsed data. All calls use the admin auth scope (token auto-refresh).
import { API_BASE_URL, authFetch } from "../../../lib/api";
import type { LayoutDoc } from "../../../lib/customizer/types";

const base = `${API_BASE_URL}/admin/dev/customizer`;
const jsonInit = (method: string, body: unknown): RequestInit => ({
  method,
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(body)
});

export type PageVersionRow = { version: number; label: string | null; publishedAt: string; publishedBy: string | null };

export type CustomizerPageData = {
  page: { id: string; key: string; component: string; name: Record<string, string>; slug: Record<string, string> };
  draftLayout: unknown;
  publishedLayout: unknown;
  draftUpdatedAt: string | null;
  layoutVersion: number;
};

export async function getPage(pageId: string): Promise<CustomizerPageData | null> {
  const response = await authFetch(`${base}/${pageId}`, {}, "admin");
  return response.ok ? ((await response.json()) as CustomizerPageData) : null;
}

export function saveDraft(pageId: string, layout: LayoutDoc): Promise<Response> {
  return authFetch(`${base}/${pageId}/draft`, jsonInit("PATCH", { layout }), "admin");
}

export function publish(pageId: string, layout: LayoutDoc, label?: string): Promise<Response> {
  return authFetch(`${base}/${pageId}/publish`, jsonInit("POST", { layout, label }), "admin");
}

export function revertTo(pageId: string, version: number): Promise<Response> {
  return authFetch(`${base}/${pageId}/revert/${version}`, { method: "POST" }, "admin");
}

export async function listVersions(pageId: string): Promise<PageVersionRow[]> {
  const response = await authFetch(`${base}/${pageId}/versions`, {}, "admin");
  return response.ok ? ((await response.json()) as PageVersionRow[]) : [];
}

/** Translate `texts` from `source` (default: main language) into `target`. Null on failure. */
export async function translateTexts(texts: string[], target: string, source?: string): Promise<string[] | null> {
  const response = await authFetch(`${base}/translate`, jsonInit("POST", { texts, target, source }), "admin");
  if (!response.ok) {
    return null;
  }
  const data = (await response.json()) as { items?: unknown };
  return Array.isArray(data.items) ? (data.items as string[]) : null;
}
