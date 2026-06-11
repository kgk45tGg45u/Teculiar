/**
 * Collision-free identifier generation. Combines a timestamp with a random
 * suffix and a per-process counter so parallel workers never clash, even when
 * two tests start in the same millisecond.
 */
import { randomBytes } from "node:crypto";

let counter = 0;

/** Short, lowercase, alphanumeric token (default 6 chars). */
export function token(length = 6): string {
  return randomBytes(16).toString("hex").slice(0, length);
}

/** Monotonic-ish unique slug, e.g. `1718000000000-3-a1b2c3`. */
export function uniqueSlug(prefix = ""): string {
  counter += 1;
  const slug = `${Date.now()}-${counter}-${token(6)}`;
  return prefix ? `${prefix}-${slug}` : slug;
}

/** Unique email under the dezhost.test sink domain. */
export function uniqueEmail(prefix = "e2e"): string {
  return `${prefix}-${Date.now()}-${token(6)}@dezhost.test`;
}

/**
 * Unique registrable domain (TLD only, never a subdomain). Labels are kept
 * DNS-safe (lowercase alphanumeric + hyphens) and comfortably under 63 chars.
 */
export function uniqueDomain(root: string, tld: string): string {
  const label = `${root}-${Date.now().toString(36)}-${token(5)}`
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
  return `${label}.${tld.replace(/^\./, "")}`;
}
