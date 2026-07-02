"use client";

import { Check, Copy, Eye, EyeOff } from "lucide-react";
import { useState } from "react";
import { API_BASE_URL, storeAuth, type AuthPayload } from "@dezhost/web-core/lib/api";
import { createChallenge, type BotChallenge } from "@dezhost/web-core/lib/bot-challenge";
import { getDictionary } from "@dezhost/web-core/lib/dictionary";
import { BotCheck, validateBotCheck } from "@dezhost/web-core/components/ui/bot-check";
import { Button } from "@dezhost/web-core/components/ui/button";
import { notify } from "@dezhost/web-core/components/ui/toast-provider";
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

  const t = getDictionary(locale).storefront.signup;

  const passwordRules = [
    { label: t.ruleLength, passed: password.length >= 9 && password.length <= 16 },
    { label: t.ruleUpper, passed: /[A-Z]/.test(password) },
    { label: t.ruleLower, passed: /[a-z]/.test(password) },
    { label: t.ruleNumber, passed: /\d/.test(password) },
    { label: t.ruleSpecial, passed: /[~*!@$#%_+.?:,{}]/.test(password) }
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
      setError(t.passwordWeak);
      return;
    }
    if (!formData.get("acceptedTerms")) {
      setError(t.termsRequired);
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
        : t.registrationFailed;
      setError(message);
      notify.error(message);
      // Fresh challenge after API failure: new question, timestamp=0 bypasses the
      // 3-second timing guard so the user is not blocked on a quick re-submit.
      setChallenge({ ...createChallenge(locale), startTime: 0 });
      setChallengeKey((key) => key + 1);
      return;
    }

    storeAuth(payload as AuthPayload, "client");
    notify.success(t.accountCreated);
    window.location.assign("/client");
  }

  return (
    <main className={styles.shell}>
      <section className={styles.card}>
        <div className={styles.cardHead}>
          <span className="eyebrow">{t.eyebrow}</span>
          <h1>{t.title}</h1>
          <p>{t.alreadyCustomer} <a href="/login">{t.logIn}</a></p>
        </div>

        <form
          className={styles.form}
          onSubmit={async (e) => {
            e.preventDefault();
            await submit(new FormData(e.currentTarget));
          }}
        >
          <fieldset className={styles.fieldset}>
            <legend>{t.personalDetails}</legend>
            <div className={styles.row}>
              <label>
                {t.fullName} *
                <input className={styles.input} name="name" required placeholder={t.namePlaceholder} />
              </label>
              <label>
                {t.email} *
                <input autoComplete="email" className={styles.input} name="email" required type="email" placeholder="mail@example.com" />
              </label>
            </div>
            <label>
              {t.password} *
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
                      aria-label={t.copyPassword}
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
                      aria-label={showPassword ? t.hidePassword : t.showPassword}
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
                  {t.generate}
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
              {t.phone}
              <input className={styles.input} name="phone" type="tel" placeholder="+49 1234567890" />
              <span className={styles.fieldHint}>
                {t.phoneHint}
              </span>
            </label>
          </fieldset>

          <fieldset className={styles.fieldset}>
            <legend>{t.companyOptional}</legend>
            <div className={styles.row}>
              <label>
                {t.companyName}
                <input className={styles.input} name="companyName" />
              </label>
              <label>
                {t.vatId}
                <input className={styles.input} name="vatId" placeholder="DE123456789" />
              </label>
            </div>
          </fieldset>

          <fieldset className={styles.fieldset}>
            <legend>{t.address}</legend>
            <label>
              {t.street} *
              <input className={styles.input} name="address" required placeholder={t.streetPlaceholder} />
            </label>
            <div className={styles.row}>
              <label>
                {t.postalCode} *
                <input className={styles.input} name="postalCode" required placeholder="12345" />
              </label>
              <label>
                {t.city} *
                <input className={styles.input} name="city" required placeholder={t.cityPlaceholder} />
              </label>
            </div>
            <div className={styles.row}>
              <label>
                {t.state}
                <input className={styles.input} name="state" />
              </label>
              <label>
                {t.country} *
                <select className={styles.input} name="countryCode" defaultValue="DE" required>
                  {countries.map((c) => (
                    <option key={c.code} value={c.code}>{c.flag} {c.name}</option>
                  ))}
                </select>
              </label>
            </div>
          </fieldset>

          <fieldset className={styles.fieldset}>
            <legend>{t.security}</legend>
            {/* key={challengeKey} remounts BotCheck whenever the challenge refreshes,
                which clears the _bot_response input so the user types a fresh answer */}
            <BotCheck key={challengeKey} challenge={challenge} locale={locale} />
          </fieldset>

          <label className={styles.checkboxLabel}>
            <input name="acceptedTerms" type="checkbox" value="1" required />
            <span>
              {t.termsPrefix}
              <a href={`/${locale}/legal/agb`} target="_blank" rel="noreferrer">{t.termsLink}</a>
              {t.termsAnd}
              <a href={`/${locale}/legal/datenschutz`} target="_blank" rel="noreferrer">{t.privacyLink}</a>.
            </span>
          </label>

          {error ? <p className={styles.error} data-testid="form-error">{error}</p> : null}

          <Button type="submit">
            {loading ? t.pleaseWait : t.createAccount}
          </Button>
        </form>
      </section>
    </main>
  );
}
