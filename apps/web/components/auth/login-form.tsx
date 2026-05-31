"use client";

import { useSearchParams } from "next/navigation";
import { useState } from "react";
import { API_BASE_URL, storeAuth, type AuthPayload } from "../../lib/api";
import type { Locale } from "../../lib/i18n";
import { Button } from "../ui/button";
import { notify } from "../ui/toast-provider";
import styles from "./login-form.module.css";

export function LoginForm({ admin = false, locale }: { admin?: boolean; locale: Locale }) {
  const params = useSearchParams();
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [resetMessage, setResetMessage] = useState("");
  const copy = loginCopy[locale];

  async function submit(formData: FormData) {
    setError("");
    setLoading(true);
    const response = await fetch(`${API_BASE_URL}/auth/login`, {
      body: JSON.stringify({
        email: String(formData.get("email") ?? ""),
        password: String(formData.get("password") ?? "")
      }),
      headers: { "Content-Type": "application/json" },
      method: "POST"
    });
    const payload = (await response.json().catch(() => ({}))) as Partial<AuthPayload> & { message?: string };
    setLoading(false);

    if (!response.ok || !payload.accessToken || !payload.refreshToken || !payload.user) {
      const message = copy.loginFailed;
      setError(message);
      notify.error(message);
      return;
    }
    if (admin && !payload.user.roles.some((role) => role === "admin" || role === "staff")) {
      setError(copy.adminRequired);
      notify.error(copy.adminRequired);
      return;
    }

    storeAuth(payload as AuthPayload, admin ? "admin" : "client");
    notify.success(copy.loginSuccess);
    window.location.assign(safeNext(params.get("next"), admin ? "/admin" : "/client"));
  }

  async function setupAdmin(formData: FormData) {
    setError("");
    setLoading(true);
    const response = await fetch(`${API_BASE_URL}/auth/bootstrap-admin`, {
      body: JSON.stringify({
        email: String(formData.get("adminEmail") ?? ""),
        name: String(formData.get("adminName") ?? ""),
        password: String(formData.get("adminPassword") ?? "")
      }),
      headers: { "Content-Type": "application/json" },
      method: "POST"
    });
    const payload = (await response.json().catch(() => ({}))) as Partial<AuthPayload> & { message?: string };
    setLoading(false);

    if (!response.ok || !payload.accessToken || !payload.refreshToken || !payload.user) {
      const message = copy.adminSetupFailed;
      setError(message);
      notify.error(message);
      return;
    }

    storeAuth(payload as AuthPayload, "admin");
    notify.success(copy.adminCreated);
    window.location.assign("/admin");
  }

  async function requestReset(formData: FormData) {
    const response = await fetch(`${API_BASE_URL}/auth/password-reset/request`, {
      body: JSON.stringify({ email: String(formData.get("resetEmail") ?? "") }),
      headers: { "Content-Type": "application/json" },
      method: "POST"
    });
    const message = response.ok ? copy.resetSent : copy.resetFailed;
    setResetMessage(message);
    response.ok ? notify.success(message) : notify.error(message);
  }

  return (
    <main className={styles.shell}>
      <section className={styles.card}>
        <div className={styles.cardHead}>
          <span className="eyebrow">{admin ? copy.adminEyebrow : copy.clientEyebrow}</span>
          <h1>{admin ? copy.adminTitle : copy.clientTitle}</h1>
        </div>
        <form action={submit} className={styles.form}>
          <label>
            {copy.email}
            <input autoComplete="email" name="email" required type="email" />
          </label>
          <label>
            {copy.password}
            <input autoComplete="current-password" name="password" required type="password" />
          </label>
          <Button type="submit">{loading ? copy.loading : copy.loginButton}</Button>
          {error ? <p className={styles.error}>{error}</p> : null}
        </form>
        {admin ? (
          <details>
            <summary>{copy.firstAdminSetup}</summary>
            <form action={setupAdmin} className={styles.form}>
              <label>
                {copy.name}
                <input name="adminName" required />
              </label>
              <label>
                {copy.email}
                <input name="adminEmail" required type="email" />
              </label>
              <label>
                {copy.password}
                <input minLength={12} name="adminPassword" required type="password" />
              </label>
              <Button type="submit" variant="secondary">{loading ? copy.loading : copy.createAdmin}</Button>
            </form>
          </details>
        ) : null}
        {!admin ? (
          <details>
            <summary>{copy.forgotPassword}</summary>
            <form action={requestReset} className={styles.form}>
              <label>
                {copy.email}
                <input name="resetEmail" required type="email" />
              </label>
              <Button type="submit" variant="secondary">{copy.sendReset}</Button>
              {resetMessage ? <p>{resetMessage}</p> : null}
            </form>
          </details>
        ) : null}
      </section>
    </main>
  );
}

function safeNext(next: string | null, fallback: string) {
  if (!next?.startsWith("/") || next.startsWith("//")) {
    return fallback;
  }
  return next;
}

const loginCopy = {
  de: {
    adminCreated: "Admin erstellt.",
    adminEyebrow: "Admin",
    adminRequired: "Admin-Zugriff erforderlich.",
    adminSetupFailed: "Admin-Einrichtung fehlgeschlagen.",
    adminTitle: "Admin-Anmeldung",
    clientEyebrow: "Kunde",
    clientTitle: "Anmelden",
    createAdmin: "Admin erstellen",
    email: "E-Mail",
    firstAdminSetup: "Ersten Admin einrichten",
    forgotPassword: "Passwort vergessen?",
    loading: "Bitte warten...",
    loginButton: "Anmelden",
    loginFailed: "Anmeldung fehlgeschlagen.",
    loginSuccess: "Anmeldung erfolgreich.",
    name: "Name",
    password: "Passwort",
    resetFailed: "Passwort-Zurücksetzen fehlgeschlagen.",
    resetSent: "Falls das Konto existiert, wurde eine E-Mail zum Zurücksetzen erstellt oder gesendet.",
    sendReset: "Link zum Zurücksetzen senden"
  },
  en: {
    adminCreated: "Admin created.",
    adminEyebrow: "Admin",
    adminRequired: "Admin access required.",
    adminSetupFailed: "Admin setup failed.",
    adminTitle: "Admin Login",
    clientEyebrow: "Client",
    clientTitle: "Login",
    createAdmin: "Create admin",
    email: "Email",
    firstAdminSetup: "First admin setup",
    forgotPassword: "Forgot password?",
    loading: "Please wait...",
    loginButton: "Login",
    loginFailed: "Login failed.",
    loginSuccess: "Login successful.",
    name: "Name",
    password: "Password",
    resetFailed: "Password reset failed.",
    resetSent: "If the account exists, a reset email was logged or sent.",
    sendReset: "Send reset link"
  }
} satisfies Record<Locale, Record<string, string>>;
