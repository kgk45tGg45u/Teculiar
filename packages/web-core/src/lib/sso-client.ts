// Browser-side helpers for the cross-origin SSO handoff (Phase 4.6e). Used by the storefront's
// /sso/handoff page (origin WITH the session) and the dashboards' /sso/callback page (target origin).
// The verifier travels in the URL FRAGMENT (#v=…), which browsers never send to servers — so a code
// leaked via logs/referrer is useless without it.

function base64Url(bytes: Uint8Array): string {
  let raw = "";
  for (const byte of bytes) {
    raw += String.fromCharCode(byte);
  }
  return btoa(raw).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/, "");
}

export function generateSsoVerifier(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return base64Url(bytes);
}

export async function ssoChallengeFor(verifier: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier));
  return base64Url(new Uint8Array(digest));
}

/** Destination callback URL: code+scope+path in the query, verifier in the fragment. */
export function ssoCallbackUrl(targetOrigin: string, code: string, scope: "admin" | "client", toPath: string, verifier: string): string {
  const path = toPath.startsWith("/") && !toPath.startsWith("//") ? toPath : scope === "admin" ? "/admin" : "/client";
  return `${targetOrigin.replace(/\/+$/, "")}/sso/callback?code=${encodeURIComponent(code)}&scope=${scope}&to=${encodeURIComponent(path)}#v=${verifier}`;
}
