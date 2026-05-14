"use client";

import { useSearchParams } from "next/navigation";
import { useState } from "react";
import { API_BASE_URL, storeAuth, type AuthPayload } from "../../lib/api";
import { Button } from "../ui/button";
import { notify } from "../ui/toast-provider";
import styles from "./login-form.module.css";

export function LoginForm({ admin = false }: { admin?: boolean }) {
  const params = useSearchParams();
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

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
      const message = typeof payload.message === "string" ? payload.message : "Login failed.";
      setError(message);
      notify.error(message);
      return;
    }
    if (admin && !payload.user.roles.some((role) => role === "admin" || role === "staff")) {
      setError("Admin access required.");
      notify.error("Admin access required.");
      return;
    }

    storeAuth(payload as AuthPayload, admin ? "admin" : "client");
    notify.success("Login successful.");
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
      const message = typeof payload.message === "string" ? payload.message : "Admin setup failed.";
      setError(message);
      notify.error(message);
      return;
    }

    storeAuth(payload as AuthPayload, "admin");
    notify.success("Admin created.");
    window.location.assign("/admin");
  }

  return (
    <main className={styles.shell}>
      <section className={styles.card}>
        <div>
          <span className="eyebrow">{admin ? "Admin" : "Client"}</span>
          <h1>{admin ? "Admin Login" : "Login"}</h1>
        </div>
        <form action={submit} className={styles.form}>
          <label>
            E-Mail
            <input autoComplete="email" name="email" required type="email" />
          </label>
          <label>
            Passwort
            <input autoComplete="current-password" name="password" required type="password" />
          </label>
          <Button type="submit">{loading ? "Bitte warten..." : "Login"}</Button>
          {error ? <p className={styles.error}>{error}</p> : null}
        </form>
        {admin ? (
          <details>
            <summary>First admin setup</summary>
            <form action={setupAdmin} className={styles.form}>
              <label>
                Name
                <input name="adminName" required />
              </label>
              <label>
                E-Mail
                <input name="adminEmail" required type="email" />
              </label>
              <label>
                Passwort
                <input minLength={12} name="adminPassword" required type="password" />
              </label>
              <Button type="submit" variant="secondary">{loading ? "Bitte warten..." : "Create admin"}</Button>
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
