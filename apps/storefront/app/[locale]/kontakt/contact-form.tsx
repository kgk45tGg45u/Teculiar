"use client";

import { ArrowRight, CheckCircle } from "lucide-react";
import { useState } from "react";
import { Button } from "@dezhost/web-core/components/ui/button";
import { API_BASE_URL } from "@dezhost/web-core/lib/api";
import styles from "./kontakt.module.css";

type FormState = "idle" | "submitting" | "success" | "error";

const TOPICS_DE = [
  "Webhosting",
  "Domain registrieren",
  "Website erstellen lassen",
  "IT-Lösungen & Managed Services",
  "Nextcloud einrichten",
  "Migration von anderem Anbieter",
  "Allgemeine Beratung",
  "Sonstiges"
];

const TOPICS_EN = [
  "Web hosting",
  "Register domain",
  "Have website created",
  "IT solutions & managed services",
  "Set up Nextcloud",
  "Migration from another provider",
  "General consultation",
  "Other"
];

export function ContactForm({ locale }: { locale: string }) {
  const isDe = locale === "de";
  const topics = isDe ? TOPICS_DE : TOPICS_EN;

  const [state, setState] = useState<FormState>("idle");
  const [errorMsg, setErrorMsg] = useState("");

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setState("submitting");
    setErrorMsg("");

    const form = event.currentTarget;
    const data = new FormData(form);
    const topic = data.get("topic") as string;
    const name = data.get("name") as string;
    const email = data.get("email") as string;
    const message = data.get("message") as string;

    if (!topic) {
      setErrorMsg(isDe ? "Bitte wähle ein Thema aus." : "Please select a topic.");
      setState("error");
      return;
    }

    const payload = {
      _honey: "",
      email,
      message,
      name,
      source: "contact",
      subject: topic
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
      setErrorMsg(
        isDe
          ? "Verbindungsfehler. Bitte versuche es erneut."
          : "Connection error. Please try again."
      );
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
            ? "Vielen Dank für deine Anfrage. Wir haben ein Support-Ticket für dich eröffnet und melden uns so schnell wie möglich."
            : "Thank you for your enquiry. We have opened a support ticket for you and will get back to you as soon as possible."}
        </p>
        <Button href={`/${locale}`} icon={ArrowRight} variant="secondary">
          {isDe ? "Zur Startseite" : "Back to home"}
        </Button>
      </div>
    );
  }

  return (
    <form className={styles.form} onSubmit={handleSubmit}>
      <div className={styles.formRow}>
        <div className={styles.field}>
          <label htmlFor="contact-name">{isDe ? "Dein Name" : "Your name"} *</label>
          <input
            className="input"
            id="contact-name"
            name="name"
            placeholder={isDe ? "z. B. Maria Müller" : "e.g. Jane Smith"}
            required
            type="text"
          />
        </div>
        <div className={styles.field}>
          <label htmlFor="contact-email">E-Mail *</label>
          <input
            className="input"
            id="contact-email"
            name="email"
            placeholder={isDe ? "deine@email.de" : "your@email.com"}
            required
            type="email"
          />
        </div>
      </div>

      <div className={styles.field}>
        <label htmlFor="contact-topic">{isDe ? "Worum geht es?" : "What is it about?"} *</label>
        <select className="input" defaultValue="" id="contact-topic" name="topic" required>
          <option value="" disabled>
            {isDe ? "Thema auswählen" : "Select topic"}
          </option>
          {topics.map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </select>
      </div>

      <div className={styles.field}>
        <label htmlFor="contact-message">{isDe ? "Deine Nachricht" : "Your message"} *</label>
        <textarea
          className={`input ${styles.textarea}`}
          id="contact-message"
          name="message"
          placeholder={
            isDe
              ? "Erzähl uns, was du brauchst. Kein Fachwissen nötig – einfach drauflosschreiben."
              : "Tell us what you need. No expertise required – just write freely."
          }
          required
          rows={5}
        />
      </div>

      {state === "error" && errorMsg && (
        <p className={styles.formError}>{errorMsg}</p>
      )}

      <Button disabled={state === "submitting"} icon={ArrowRight} type="submit">
        {state === "submitting"
          ? isDe
            ? "Wird gesendet…"
            : "Sending…"
          : isDe
            ? "Anfrage senden"
            : "Send enquiry"}
      </Button>
    </form>
  );
}
