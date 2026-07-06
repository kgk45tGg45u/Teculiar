"use client";

import { useEffect, useState } from "react";
import { authHeaders, authToken, currentLocale } from "@dezhost/web-core/lib/api";
import { getDictionary } from "@dezhost/web-core/lib/dictionary";
import { generateSsoVerifier, ssoCallbackUrl, ssoChallengeFor } from "@dezhost/web-core/lib/sso-client";

/**
 * SSO handoff — SOURCE side (Phase 4.6e). Runs on the origin that HAS the session (the storefront
 * apex). Mints a one-time code for the target origin and redirects there; the token never leaves this
 * origin. Linked as /sso/handoff?to=<absolute destination URL>[&scope=client|admin]. Without a session
 * it forwards straight to the destination's login.
 */
export default function SsoHandoffPage() {
  const [failed, setFailed] = useState(false);
  const copy = getDictionary(currentLocale()).common;

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const scope = params.get("scope") === "admin" ? "admin" : "client";
    let target: URL;
    try {
      target = new URL(params.get("to") ?? "");
    } catch {
      setFailed(true);
      return;
    }

    const run = async () => {
      if (!authToken(scope)) {
        window.location.replace(`${target.origin}/login`);
        return;
      }
      const verifier = generateSsoVerifier();
      const response = await fetch("/api/v1/auth/sso/exchange", {
        body: JSON.stringify({ targetOrigin: target.origin, codeChallenge: await ssoChallengeFor(verifier) }),
        headers: { "Content-Type": "application/json", ...authHeaders(scope) },
        method: "POST"
      });
      if (!response.ok) {
        // No valid session / origin not allowed — land on the destination's login instead.
        window.location.replace(`${target.origin}/login`);
        return;
      }
      const { code } = (await response.json()) as { code: string };
      window.location.replace(ssoCallbackUrl(target.origin, code, scope, target.pathname + target.search, verifier));
    };
    void run().catch(() => setFailed(true));
  }, []);

  return (
    <main style={{ alignItems: "center", display: "flex", justifyContent: "center", minHeight: "60vh" }}>
      <p>{failed ? copy.ssoFailed : copy.ssoRedirecting}</p>
    </main>
  );
}
