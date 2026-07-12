"use client";

import { usePathname } from "next/navigation";
import { surfaceHref } from "./surface";

/**
 * Client-component href mapper (Phase 2.2): internal /admin|/client targets → hrefs matching the
 * current URL shape. On a per-surface host the browser path carries no section segment, so the
 * target's segment is stripped; on apex-path hosts targets pass through unchanged. Only for
 * components rendered INSIDE their section — root-level pages (/login, /sso) must use
 * `hrefForSurface` with a server-provided surface instead.
 */
export function useSurfaceHref(): (target: string) => string {
  const pathname = usePathname() ?? "/";
  return (target: string) => surfaceHref(pathname, target);
}
