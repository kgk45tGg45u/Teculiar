"use client";

import type { BotChallenge } from "../../lib/bot-challenge";
import { getDictionary } from "../../lib/dictionary";
import styles from "./bot-check.module.css";

export type { BotChallenge };

/**
 * Pure presenter. Renders three anti-bot layers inside the parent <form>:
 *   1. Off-screen honeypot field (bots fill it, humans don't see it)
 *   2. Hidden timestamp + expected answer (set by the parent via `challenge` prop)
 *   3. Visible math question for the user
 *
 * Usage:
 *   // Generate challenge server-side (no hydration mismatch):
 *   const [challenge, setChallenge] = useState<BotChallenge>(initialChallenge);
 *   const [challengeKey, setChallengeKey] = useState(0);
 *   // On API failure, refresh:
 *   setChallenge(createChallenge(locale));
 *   setChallengeKey((key) => key + 1);
 *   // In JSX:
 *   <BotCheck key={challengeKey} challenge={challenge} locale={locale} />
 *
 * Call validateBotCheck(formData) inside the submit handler to verify.
 */
export function BotCheck({ challenge, locale = "en" }: { challenge: BotChallenge; locale?: string }) {
  return (
    <div className={styles.wrap}>
      {/* Honeypot: visually off-screen so CSS-aware bots still see it */}
      <div className={styles.honeypot} aria-hidden="true">
        <label>
          Leave blank
          <input autoComplete="off" name="_hp_website" tabIndex={-1} type="text" />
        </label>
      </div>

      {/* These values come from props — no hydration mismatch */}
      <input name="_bot_ts" type="hidden" value={String(challenge.startTime)} />
      <input name="_bot_answer" type="hidden" value={challenge.answer} />

      <label className={styles.challenge}>
        <span className={styles.questionText}>{challenge.text}</span>
        <input
          autoComplete="off"
          className={`input ${styles.answerInput}`}
          inputMode="numeric"
          maxLength={3}
          name="_bot_response"
          placeholder={getDictionary(locale).storefront.botCheck.placeholder}
          required
          type="text"
        />
      </label>
    </div>
  );
}

/** Call at the top of a form submit handler. Returns null on pass, an error string on fail. */
export function validateBotCheck(formData: FormData, locale = "en"): string | null {
  const copy = getDictionary(locale).storefront.botCheck;

  if (String(formData.get("_hp_website") ?? "").trim()) {
    return copy.botDetected;
  }

  const ts = Number(formData.get("_bot_ts") ?? 0);
  if (ts > 0 && Date.now() - ts < 3000) {
    return copy.tooFast;
  }

  const expected = String(formData.get("_bot_answer") ?? "");
  const response = String(formData.get("_bot_response") ?? "").trim();
  if (!expected || expected !== response) {
    return copy.wrongAnswer;
  }

  return null;
}
