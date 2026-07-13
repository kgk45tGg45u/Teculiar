"use client";

import { useEffect, useState } from "react";
import { currentLocale, storeAuth, type AuthPayload } from "@teculiar/web-core/lib/api";
import { getDictionary } from "@teculiar/web-core/lib/dictionary";

/**
 * SSO handoff — TARGET side (Phase 4.6e). Runs on the destination origin (e.g. client.theirdomain.com):
 * redeems the one-time code (+ the PKCE verifier from the URL fragment) for fresh host-local tokens,
 * stores them, scrubs the URL and continues to the requested page. On any failure → this origin's login.
 */
export default function SsoCallbackPage() {
  const [failed, setFailed] = useState(false);
  const copy = getDictionary(currentLocale()).common;

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const scope = params.get("scope") === "admin" ? "admin" : "client";
    const requested = params.get("to") ?? "";
    const to = requested.startsWith("/") && !requested.startsWith("//") ? requested : scope === "admin" ? "/admin" : "/client";
    const loginPath = scope === "admin" ? "/admin/login" : "/login";
    const code = params.get("code") ?? "";
    const verifier = new URLSearchParams(window.location.hash.slice(1)).get("v") ?? "";

    const run = async () => {
      if (!code || !verifier) {
        window.location.replace(loginPath);
        return;
      }
      const response = await fetch("/api/v1/auth/sso/redeem", {
        body: JSON.stringify({ code, codeVerifier: verifier }),
        headers: { "Content-Type": "application/json" },
        method: "POST"
      });
      if (!response.ok) {
        window.location.replace(loginPath);
        return;
      }
      const payload = (await response.json()) as AuthPayload;
      storeAuth(payload, scope, true);
      window.location.replace(to); // also scrubs code + fragment from the address bar/history entry
    };
    void run().catch(() => setFailed(true));
  }, []);

  return (
    <main style={{ alignItems: "center", display: "flex", justifyContent: "center", minHeight: "60vh" }}>
      <p>{failed ? copy.ssoFailed : copy.ssoRedirecting}</p>
    </main>
  );
}
