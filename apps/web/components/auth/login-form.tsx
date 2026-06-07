"use client";

import { Eye, EyeOff, Lock, Mail } from "lucide-react";
import { useSearchParams } from "next/navigation";
import { useState } from "react";
import { API_BASE_URL, storeAuth, type AuthPayload } from "../../lib/api";
import type { Locale } from "../../lib/i18n";
import { notify } from "../ui/toast-provider";
import styles from "./login-form.module.css";

export function LoginForm({ admin = false, locale }: { admin?: boolean; locale: Locale }) {
  const params = useSearchParams();
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(false);
  const [forgotMode, setForgotMode] = useState(false);
  const [resetMessage, setResetMessage] = useState("");
  const [resetSent, setResetSent] = useState(false);
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
      setError(copy.loginFailed);
      notify.error(copy.loginFailed);
      return;
    }
    if (admin && !payload.user.roles.some((role) => role === "admin" || role === "staff")) {
      setError(copy.adminRequired);
      notify.error(copy.adminRequired);
      return;
    }

    storeAuth(payload as AuthPayload, admin ? "admin" : "client", rememberMe);
    notify.success(copy.loginSuccess);
    window.location.assign(safeNext(params.get("next"), admin ? "/admin" : "/client"));
  }

  async function requestReset(formData: FormData) {
    setLoading(true);
    const response = await fetch(`${API_BASE_URL}/auth/password-reset/request`, {
      body: JSON.stringify({ email: String(formData.get("resetEmail") ?? "") }),
      headers: { "Content-Type": "application/json" },
      method: "POST"
    });
    setLoading(false);
    if (response.ok) {
      setResetSent(true);
      setResetMessage(copy.resetSent);
    } else {
      setResetMessage(copy.resetFailed);
    }
  }

  if (forgotMode) {
    return (
      <main className={styles.shell}>
        <div className={styles.card}>
          <div className={styles.logoWrap}>
            <span className={styles.logoIcon}>D</span>
          </div>
          <div className={styles.cardHead}>
            <h1>{copy.forgotTitle}</h1>
            <p className={styles.subtitle}>{copy.forgotSubtitle}</p>
          </div>

          {resetSent ? (
            <div className={styles.resetSuccess}>
              <p>{resetMessage}</p>
              <button
                className={styles.textLink}
                type="button"
                onClick={() => { setForgotMode(false); setResetSent(false); setResetMessage(""); }}
              >
                {copy.backToLogin}
              </button>
            </div>
          ) : (
            <form action={requestReset} className={styles.form}>
              <div className={styles.inputWrap}>
                <Mail className={styles.inputIcon} size={17} aria-hidden />
                <input
                  autoComplete="email"
                  className={styles.inputWithIcon}
                  name="resetEmail"
                  placeholder={copy.emailPlaceholder}
                  required
                  type="email"
                />
              </div>
              {resetMessage && <p className={styles.error}>{resetMessage}</p>}
              <button className={styles.submitBtn} disabled={loading} type="submit">
                {loading ? copy.loading : copy.sendReset}
              </button>
              <button
                className={styles.textLink}
                type="button"
                onClick={() => { setForgotMode(false); setResetMessage(""); }}
              >
                {copy.backToLogin}
              </button>
            </form>
          )}
        </div>
      </main>
    );
  }

  return (
    <main className={styles.shell}>
      <div className={styles.card}>
        <div className={styles.logoWrap}>
          <span className={styles.logoIcon}>D</span>
        </div>
        <div className={styles.cardHead}>
          <h1>{admin ? copy.adminTitle : copy.clientTitle}</h1>
          <p className={styles.subtitle}>{copy.subtitle}</p>
        </div>

        <form action={submit} className={styles.form}>
          <div className={styles.inputWrap}>
            <Mail className={styles.inputIcon} size={17} aria-hidden />
            <input
              autoComplete="email"
              className={styles.inputWithIcon}
              name="email"
              placeholder={copy.emailPlaceholder}
              required
              type="email"
            />
          </div>

          <div className={styles.inputWrap}>
            <Lock className={styles.inputIcon} size={17} aria-hidden />
            <input
              autoComplete="current-password"
              className={styles.inputWithIconRight}
              name="password"
              placeholder={copy.passwordPlaceholder}
              required
              type={showPassword ? "text" : "password"}
            />
            <button
              aria-label={showPassword ? copy.hidePassword : copy.showPassword}
              className={styles.eyeBtn}
              type="button"
              onClick={() => setShowPassword((v) => !v)}
            >
              {showPassword ? <EyeOff size={17} aria-hidden /> : <Eye size={17} aria-hidden />}
            </button>
          </div>

          <div className={styles.rememberRow}>
            <label className={styles.checkLabel}>
              <input
                checked={rememberMe}
                className={styles.checkbox}
                type="checkbox"
                onChange={(e) => setRememberMe(e.target.checked)}
              />
              {copy.rememberMe}
            </label>
            <button
              className={styles.forgotLink}
              type="button"
              onClick={() => { setForgotMode(true); setError(""); }}
            >
              {copy.forgotPassword}
            </button>
          </div>

          {error ? <p className={styles.error}>{error}</p> : null}

          <button className={styles.submitBtn} disabled={loading} type="submit">
            {loading ? copy.loading : copy.loginButton}
          </button>
        </form>
      </div>
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
    adminRequired: "Admin-Zugriff erforderlich.",
    adminTitle: "Admin-Anmeldung",
    backToLogin: "Zurück zur Anmeldung",
    clientTitle: "Anmelden",
    emailPlaceholder: "deine@email.de",
    forgotPassword: "Passwort vergessen?",
    forgotSubtitle: "Gib deine E-Mail-Adresse ein – wir schicken dir einen Link.",
    forgotTitle: "Passwort zurücksetzen",
    hidePassword: "Passwort verbergen",
    loading: "Bitte warten...",
    loginButton: "Anmelden",
    loginFailed: "Anmeldung fehlgeschlagen.",
    loginSuccess: "Anmeldung erfolgreich.",
    passwordPlaceholder: "••••••••",
    rememberMe: "Angemeldet bleiben",
    resetFailed: "Passwort-Zurücksetzen fehlgeschlagen.",
    resetSent: "Falls das Konto existiert, wurde ein Zurücksetzen-Link verschickt.",
    sendReset: "Link senden",
    showPassword: "Passwort anzeigen",
    subtitle: "Gib deine Anmeldedaten ein, um fortzufahren."
  },
  en: {
    adminRequired: "Admin access required.",
    adminTitle: "Admin Login",
    backToLogin: "Back to login",
    clientTitle: "Login to your account",
    emailPlaceholder: "you@example.com",
    forgotPassword: "Forgot password?",
    forgotSubtitle: "Enter your email and we'll send you a reset link.",
    forgotTitle: "Reset your password",
    hidePassword: "Hide password",
    loading: "Please wait...",
    loginButton: "Sign in",
    loginFailed: "Login failed.",
    loginSuccess: "Login successful.",
    passwordPlaceholder: "••••••••",
    rememberMe: "Remember me",
    resetFailed: "Password reset failed.",
    resetSent: "If an account exists, a reset link has been sent.",
    sendReset: "Send reset link",
    showPassword: "Show password",
    subtitle: "Enter your credentials to access your account."
  }
} satisfies Record<Locale, Record<string, string>>;
