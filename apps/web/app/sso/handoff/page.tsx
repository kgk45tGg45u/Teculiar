"use client";

import { SsoHandoffScreen } from "@dezhost/web-core/components/auth/sso-handoff-screen";

// SSO handoff, dashboards side (Phase 2.4): lets a session cross FROM a dashboard origin to another
// tenant origin (e.g. admin panel → the client area on client.<domain>). Root-level route — never
// surface-prefixed (middleware ROOT_PAGES).
export default function SsoHandoffPage() {
  return <SsoHandoffScreen />;
}
