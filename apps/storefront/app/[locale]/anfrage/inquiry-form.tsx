"use client";

import { ArrowRight, CheckCircle, Loader2 } from "lucide-react";
import { useSearchParams } from "next/navigation";
import { useState } from "react";
import { Button } from "@teculiar/web-core/components/ui/button";
import { API_BASE_URL } from "@teculiar/web-core/lib/api";
import styles from "./anfrage.module.css";

type FormState = "idle" | "submitting" | "success" | "error";

export function InquiryForm({ locale }: { locale: string }) {
  const isDe = locale === "de";
  const searchParams = useSearchParams();
  const initialSubject = searchParams.get("subject") ?? "";

  const [state, setState] = useState<FormState>("idle");
  const [errorMsg, setErrorMsg] = useState("");

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setState("submitting");
    setErrorMsg("");

    const form = event.currentTarget;
    const data = new FormData(form);

    const payload = {
      _honey: data.get("_honey") as string,
      email: data.get("email") as string,
      message: data.get("message") as string,
      name: data.get("name") as string,
      phone: (data.get("phone") as string) || undefined,
      source: "inquiry",
      subject: data.get("subject") as string
    };

    try {
      const res = await fetch(`${API_BASE_URL}/storefront/inquiries`, {
        body: JSON.stringify(payload),
        headers: { "Content-Type": "application/json" },
        method: "POST"
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        const msg = typeof body?.message === "string" ? body.message : res.statusText;
        setErrorMsg(msg);
        setState("error");
        return;
      }
      setState("success");
    } catch {
      setErrorMsg(isDe ? "Verbindungsfehler. Bitte versuche es erneut." : "Connection error. Please try again.");
      setState("error");
    }
  }

  if (state === "success") {
    return (
      <div className={styles.successBox}>
        <CheckCircle aria-hidden size={40} className={styles.successIcon} />
        <h2>{isDe ? "Nachricht erhalten!" : "Message received!"}</h2>
        <p>
          {isDe
            ? "Vielen Dank für deine Anfrage. Wir melden uns so schnell wie möglich."
            : "Thank you for your enquiry. We will get back to you as soon as possible."}
        </p>
        <Button href={`/${locale}`} variant="secondary" icon={ArrowRight}>
          {isDe ? "Zur Startseite" : "Back to home"}
        </Button>
      </div>
    );
  }

  return (
    <form className={styles.form} onSubmit={handleSubmit}>
      {/* Honeypot — hidden from humans, filled by bots */}
      <input
        aria-hidden
        autoComplete="off"
        name="_honey"
        style={{ display: "none" }}
        tabIndex={-1}
        type="text"
      />

      <div className={styles.formGroup}>
        <label htmlFor="inquiry-name">{isDe ? "Name" : "Name"} *</label>
        <input
          id="inquiry-name"
          name="name"
          placeholder={isDe ? "Dein Name" : "Your name"}
          required
          type="text"
        />
      </div>

      <div className={styles.formGroup}>
        <label htmlFor="inquiry-email">{isDe ? "E-Mail-Adresse" : "Email address"} *</label>
        <input
          id="inquiry-email"
          name="email"
          placeholder={isDe ? "deine@email.de" : "your@email.com"}
          required
          type="email"
        />
      </div>

      <div className={styles.formGroup}>
        <label htmlFor="inquiry-phone">{isDe ? "Telefonnummer (optional)" : "Phone number (optional)"}</label>
        <input
          id="inquiry-phone"
          name="phone"
          placeholder="+49 ..."
          type="tel"
        />
      </div>

      <div className={styles.formGroup}>
        <label htmlFor="inquiry-subject">{isDe ? "Betreff" : "Subject"} *</label>
        <input
          defaultValue={initialSubject}
          id="inquiry-subject"
          name="subject"
          placeholder={isDe ? "Worum geht es?" : "What is this about?"}
          required
          type="text"
        />
      </div>

      <div className={styles.formGroup}>
        <label htmlFor="inquiry-message">{isDe ? "Nachricht" : "Message"} *</label>
        <textarea
          id="inquiry-message"
          name="message"
          placeholder={isDe ? "Beschreibe kurz, womit wir dir helfen können ..." : "Briefly describe how we can help you ..."}
          required
          rows={6}
        />
      </div>

      {state === "error" && <p className={styles.errorMsg}>{errorMsg}</p>}

      <Button
        disabled={state === "submitting"}
        icon={state === "submitting" ? Loader2 : ArrowRight}
        type="submit"
      >
        {state === "submitting"
          ? (isDe ? "Wird gesendet …" : "Sending …")
          : (isDe ? "Anfrage senden" : "Send enquiry")}
      </Button>
    </form>
  );
}
