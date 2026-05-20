"use client";

import { useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";
import { API_BASE_URL } from "../../lib/api";
import { Button } from "../../components/ui/button";
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

  async function submit(formData: FormData) {
    const response = await fetch(`${API_BASE_URL}/auth/password-reset/confirm`, {
      body: JSON.stringify({
        password: String(formData.get("password") ?? ""),
        token: params.get("token") ?? ""
      }),
      headers: { "Content-Type": "application/json" },
      method: "POST"
    });
    const next = response.ok ? "Password changed. You can log in now." : "Password reset failed or expired.";
    setMessage(next);
    response.ok ? notify.success(next) : notify.error(next);
  }

  return (
    <main className={styles.shell}>
      <section className={styles.card}>
        <div>
          <span className="eyebrow">Account</span>
          <h1>Reset Password</h1>
        </div>
        <form action={submit} className={styles.form}>
          <label>
            New password
            <input minLength={12} name="password" required type="password" />
          </label>
          <Button type="submit">Change Password</Button>
          {message ? <p>{message}</p> : null}
        </form>
      </section>
    </main>
  );
}
