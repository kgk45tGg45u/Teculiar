import { API_BASE_URL, authFetch, dateLabel } from "@teculiar/web-core/lib/api";
import type { Locale } from "@teculiar/web-core/lib/i18n";

// authFetch (not raw fetch) so a request firing after the ~15m access token expired refreshes
// the token once and retries, instead of 401ing and bouncing the admin to the login screen.
export function adminMutate(method: "PATCH" | "POST" | "DELETE", path: string, body?: unknown) {
  return authFetch(`${API_BASE_URL}${path}`, {
    body: body === undefined ? undefined : JSON.stringify(body),
    headers: { "Content-Type": "application/json" },
    method
  });
}

/** Loops the per-record endpoint sequentially (Phase 5.2 — no batch API needed). */
export async function runBulk(ids: string[], run: (id: string) => Promise<Response>) {
  const ok: string[] = [];
  let failed = 0;
  for (const id of ids) {
    const response = await run(id).catch(() => null);
    if (response?.ok) ok.push(id);
    else failed += 1;
  }
  return { failed, ok };
}

export function bulkSummary(ok: number, failed: number, doneLabel: string, failedLabel: string) {
  return failed ? `${ok} ${doneLabel}, ${failed} ${failedLabel}` : `${ok} ${doneLabel}`;
}

/** Sort helper: timestamp for date columns; null keeps missing dates last. */
export function ts(value?: string | null) {
  if (!value) return null;
  const time = new Date(value).getTime();
  return Number.isNaN(time) ? null : time;
}

export function shortDate(value: string | null | undefined, locale: Locale) {
  return dateLabel(value, locale, { day: "2-digit", month: "2-digit", year: "2-digit" });
}
