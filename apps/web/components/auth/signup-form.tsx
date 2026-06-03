"use client";

import { Check, Copy, Eye, EyeOff } from "lucide-react";
import { useState } from "react";
import { API_BASE_URL, storeAuth, type AuthPayload } from "../../lib/api";
import { createChallenge, type BotChallenge } from "../../lib/bot-challenge";
import { BotCheck, validateBotCheck } from "../ui/bot-check";
import { Button } from "../ui/button";
import { notify } from "../ui/toast-provider";
import styles from "./signup-form.module.css";

type Country = { code: string; flag: string; name: string };

function generatePassword() {
  const uppercase = "ABCDEFGHJKLMNPQRSTUVWXYZ";
  const lowercase = "abcdefghijkmnopqrstuvwxyz";
  const numbers = "23456789";
  const specials = "~*!@$#%_+.?:,{}";
  const all = `${uppercase}${lowercase}${numbers}${specials}`;
  const chars = [
    pickChar(uppercase),
    pickChar(lowercase),
    pickChar(numbers),
    pickChar(specials),
    ...Array.from({ length: 8 }, () => pickChar(all))
  ];
  return shuffleChars(chars).join("");
}

function pickChar(source: string) {
  const arr = new Uint32Array(1);
  crypto.getRandomValues(arr);
  return source[(arr[0] ?? 0) % source.length] ?? source[0] ?? "A";
}

function shuffleChars(values: string[]) {
  return values
    .map((value) => {
      const arr = new Uint32Array(1);
      crypto.getRandomValues(arr);
      return { sort: arr[0] ?? 0, value };
    })
    .sort((a, b) => a.sort - b.sort)
    .map((item) => item.value);
}

function isStrongPassword(password: string) {
  return (
    password.length >= 9 &&
    password.length <= 16 &&
    /[A-Z]/.test(password) &&
    /[a-z]/.test(password) &&
    /\d/.test(password) &&
    /[~*!@$#%_+.?:,{}]/.test(password)
  );
}

export function SignupForm({
  countries,
  initialChallenge,
  locale
}: {
  countries: Country[];
  initialChallenge: BotChallenge;
  locale: string;
}) {
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [copied, setCopied] = useState(false);
  // Server-generated initial challenge; refreshed client-side after each API failure
  const [challenge, setChallenge] = useState<BotChallenge>(initialChallenge);
  const [challengeKey, setChallengeKey] = useState(0);

  const de = locale === "de";

  const passwordRules = [
    { label: de ? "9–16 Zeichen" : "9–16 characters", passed: password.length >= 9 && password.length <= 16 },
    { label: de ? "Großbuchstaben" : "Uppercase letter", passed: /[A-Z]/.test(password) },
    { label: de ? "Kleinbuchstaben" : "Lowercase letter", passed: /[a-z]/.test(password) },
    { label: de ? "Zahl" : "Number", passed: /\d/.test(password) },
    { label: de ? "Sonderzeichen (~*!@$#%_+.?:,{})" : "Special character (~*!@$#%_+.?:,{})", passed: /[~*!@$#%_+.?:,{}]/.test(password) }
  ];

  async function submit(formData: FormData) {
    setError("");

    // Client-side checks — do NOT refresh the bot challenge on these
    const botError = validateBotCheck(formData, locale);
    if (botError) {
      setError(botError);
      return;
    }

    const pw = String(formData.get("password") ?? "");
    if (!isStrongPassword(pw)) {
      setError(de
        ? "Passwort erfüllt die Anforderungen nicht."
        : "Password does not meet requirements. Must be 9–16 characters with uppercase, lowercase, number, and special character.");
      return;
    }
    if (!formData.get("acceptedTerms")) {
      setError(de ? "Bitte akzeptieren Sie die AGB." : "You must accept the terms and conditions.");
      return;
    }

    setLoading(true);
    const companyName = String(formData.get("companyName") ?? "").trim();
    const state = String(formData.get("state") ?? "").trim();
    const response = await fetch(`${API_BASE_URL}/auth/register`, {
      body: JSON.stringify({
        name: String(formData.get("name") ?? ""),
        email: String(formData.get("email") ?? ""),
        password: pw,
        phone: String(formData.get("phone") ?? "") || undefined,
        companyName: companyName || undefined,
        vatId: String(formData.get("vatId") ?? "") || undefined,
        address: {
          line1: String(formData.get("address") ?? ""),
          postalCode: String(formData.get("postalCode") ?? ""),
          city: String(formData.get("city") ?? ""),
          state: state || undefined
        },
        countryCode: String(formData.get("countryCode") ?? "DE"),
        customerType: companyName ? "BUSINESS" : "INDIVIDUAL"
      }),
      headers: { "Content-Type": "application/json" },
      method: "POST"
    });

    setLoading(false);
    const payload = await response.json().catch(() => ({})) as Partial<AuthPayload> & { message?: string };

    if (!response.ok || !payload.accessToken || !payload.user) {
      const message = typeof payload.message === "string"
        ? payload.message
        : (de ? "Registrierung fehlgeschlagen." : "Registration failed. Please try again.");
      setError(message);
      notify.error(message);
      // Fresh challenge after API failure: new question, timestamp=0 bypasses the
      // 3-second timing guard so the user is not blocked on a quick re-submit.
      setChallenge({ ...createChallenge(locale), startTime: 0 });
      setChallengeKey((key) => key + 1);
      return;
    }

    storeAuth(payload as AuthPayload, "client");
    notify.success(de ? "Konto erstellt! Willkommen." : "Account created! Welcome.");
    window.location.assign("/client");
  }

  return (
    <main className={styles.shell}>
      <section className={styles.card}>
        <div className={styles.cardHead}>
          <span className="eyebrow">{de ? "Konto erstellen" : "Create Account"}</span>
          <h1>{de ? "Registrieren" : "Sign Up"}</h1>
          <p>{de ? "Bereits Kunde?" : "Already a customer?"} <a href="/login">{de ? "Anmelden" : "Log in"}</a></p>
        </div>

        <form
          className={styles.form}
          onSubmit={async (e) => {
            e.preventDefault();
            await submit(new FormData(e.currentTarget));
          }}
        >
          <fieldset className={styles.fieldset}>
            <legend>{de ? "Persönliche Daten" : "Personal Details"}</legend>
            <div className={styles.row}>
              <label>
                {de ? "Vollständiger Name" : "Full Name"} *
                <input className={styles.input} name="name" required placeholder="Max Mustermann" />
              </label>
              <label>
                E-Mail *
                <input autoComplete="email" className={styles.input} name="email" required type="email" placeholder="mail@example.com" />
              </label>
            </div>
            <label>
              {de ? "Passwort" : "Password"} *
              <div className={styles.passwordControl}>
                <div className={styles.passwordInputWrap}>
                  <input
                    autoComplete="new-password"
                    className={styles.input}
                    name="password"
                    required
                    type={showPassword ? "text" : "password"}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                  />
                  <div className={styles.passwordIcons}>
                    <button
                      aria-label={de ? "Passwort kopieren" : "Copy password"}
                      className={`${styles.passwordIconBtn}${copied ? ` ${styles.passwordIconBtnActive}` : ""}`}
                      disabled={!password}
                      onClick={() => {
                        if (!password) return;
                        void navigator.clipboard.writeText(password).then(() => {
                          setCopied(true);
                          setTimeout(() => setCopied(false), 2000);
                        });
                      }}
                      type="button"
                    >
                      {copied ? <Check aria-hidden size={15} /> : <Copy aria-hidden size={15} />}
                    </button>
                    <button
                      aria-label={showPassword ? (de ? "Passwort verbergen" : "Hide password") : (de ? "Passwort anzeigen" : "Show password")}
                      className={styles.passwordIconBtn}
                      onClick={() => setShowPassword((v) => !v)}
                      type="button"
                    >
                      {showPassword ? <EyeOff aria-hidden size={15} /> : <Eye aria-hidden size={15} />}
                    </button>
                  </div>
                </div>
                <button
                  className={styles.generateBtn}
                  onClick={() => { setPassword(generatePassword()); setShowPassword(true); }}
                  type="button"
                >
                  {de ? "Generieren" : "Generate"}
                </button>
              </div>
            </label>
            {password.length > 0 && (
              <div className={styles.passwordRules}>
                {passwordRules.map((rule) => (
                  <span key={rule.label} className={rule.passed ? styles.rulePassed : styles.ruleFailed}>
                    {rule.passed ? "✓" : "○"} {rule.label}
                  </span>
                ))}
              </div>
            )}
            <label>
              {de ? "Telefon" : "Phone"}
              <input className={styles.input} name="phone" type="tel" placeholder="+49 1234567890" />
              <span className={styles.fieldHint}>
                {de
                  ? "Internationales Format: +49 … (für Domain-Registrierungen erforderlich)"
                  : "International format: +49 … (required for domain registrations)"}
              </span>
            </label>
          </fieldset>

          <fieldset className={styles.fieldset}>
            <legend>{de ? "Unternehmen (optional)" : "Company (optional)"}</legend>
            <div className={styles.row}>
              <label>
                {de ? "Firmenname" : "Company Name"}
                <input className={styles.input} name="companyName" />
              </label>
              <label>
                {de ? "USt-IdNr." : "VAT ID"}
                <input className={styles.input} name="vatId" placeholder="DE123456789" />
              </label>
            </div>
          </fieldset>

          <fieldset className={styles.fieldset}>
            <legend>{de ? "Adresse" : "Address"}</legend>
            <label>
              {de ? "Straße und Hausnummer" : "Street Address"} *
              <input className={styles.input} name="address" required placeholder={de ? "Musterstraße 1" : "123 Main St"} />
            </label>
            <div className={styles.row}>
              <label>
                {de ? "PLZ" : "Postal Code"} *
                <input className={styles.input} name="postalCode" required placeholder="12345" />
              </label>
              <label>
                {de ? "Stadt" : "City"} *
                <input className={styles.input} name="city" required placeholder={de ? "Berlin" : "Munich"} />
              </label>
            </div>
            <div className={styles.row}>
              <label>
                {de ? "Bundesland / Region" : "State / Region"}
                <input className={styles.input} name="state" />
              </label>
              <label>
                {de ? "Land" : "Country"} *
                <select className={styles.input} name="countryCode" defaultValue="DE" required>
                  {countries.map((c) => (
                    <option key={c.code} value={c.code}>{c.flag} {c.name}</option>
                  ))}
                </select>
              </label>
            </div>
          </fieldset>

          <fieldset className={styles.fieldset}>
            <legend>{de ? "Sicherheit" : "Security"}</legend>
            {/* key={challengeKey} remounts BotCheck whenever the challenge refreshes,
                which clears the _bot_response input so the user types a fresh answer */}
            <BotCheck key={challengeKey} challenge={challenge} locale={locale} />
          </fieldset>

          <label className={styles.checkboxLabel}>
            <input name="acceptedTerms" type="checkbox" value="1" required />
            <span>
              {de ? "Ich akzeptiere die " : "I accept the "}
              <a href={`/${locale}/legal/agb`} target="_blank" rel="noreferrer">{de ? "AGB" : "Terms of Service"}</a>
              {de ? " und " : " and "}
              <a href={`/${locale}/legal/datenschutz`} target="_blank" rel="noreferrer">{de ? "Datenschutzerklärung" : "Privacy Policy"}</a>.
            </span>
          </label>

          {error ? <p className={styles.error} data-testid="form-error">{error}</p> : null}

          <Button type="submit">
            {loading ? (de ? "Bitte warten…" : "Please wait…") : (de ? "Konto erstellen" : "Create Account")}
          </Button>
        </form>
      </section>
    </main>
  );
}
