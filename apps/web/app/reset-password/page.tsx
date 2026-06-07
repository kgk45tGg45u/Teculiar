"use client";

import { useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";
import { API_BASE_URL } from "../../lib/api";
import { notify } from "../../components/ui/toast-provider";
import styles from "../../components/auth/login-form.module.css";

export default function ResetPasswordPage() {
  return (
    <Suspense>
      <ResetPasswordForm />
    </Suspense>
  );
}

function ResetPasswordForm() {
  const params = useSearchParams();
  const [message, setMessage] = useState("");
  const [done, setDone] = useState(false);
  const [loading, setLoading] = useState(false);

  async function submit(formData: FormData) {
    setLoading(true);
    const response = await fetch(`${API_BASE_URL}/auth/password-reset/confirm`, {
      body: JSON.stringify({
        password: String(formData.get("password") ?? ""),
        token: params.get("token") ?? ""
      }),
      headers: { "Content-Type": "application/json" },
      method: "POST"
    });
    setLoading(false);
    if (response.ok) {
      const msg = "Password changed. You can now log in.";
      setMessage(msg);
      setDone(true);
      notify.success(msg);
    } else {
      const msg = "Password reset failed or link has expired.";
      setMessage(msg);
      notify.error(msg);
    }
  }

  return (
    <main className={styles.shell}>
      <div className={styles.card}>
        <div className={styles.logoWrap}>
          <span className={styles.logoIcon}>D</span>
        </div>
        <div className={styles.cardHead}>
          <h1>Reset Password</h1>
          <p className={styles.subtitle}>Enter your new password below.</p>
        </div>

        {done ? (
          <div className={styles.resetSuccess}>
            <p>{message}</p>
            <a className={styles.textLink} href="/login">Go to login</a>
          </div>
        ) : (
          <form action={submit} className={styles.form}>
            <input
              autoComplete="new-password"
              className={styles.plainInput}
              minLength={9}
              name="password"
              placeholder="New password"
              required
              type="password"
            />
            {message && <p className={styles.error}>{message}</p>}
            <button className={styles.submitBtn} disabled={loading} type="submit">
              {loading ? "Please wait…" : "Change Password"}
            </button>
          </form>
        )}
      </div>
    </main>
  );
}
