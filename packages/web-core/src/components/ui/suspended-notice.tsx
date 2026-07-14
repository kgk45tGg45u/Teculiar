import { getDictionary } from "../../lib/dictionary";
import styles from "./suspended-notice.module.css";

type SuspendedNoticeProps = {
  locale: string;
  /** "admin" shows the pay-to-reactivate copy; "client" the neutral unavailable copy. */
  scope: "admin" | "client";
  /** Where the outstanding Teculiar invoice lives (from the API's 403 payload), if configured. */
  billingUrl?: string | null;
};

/**
 * Full-page notice shown when the API refuses a dashboard with 403 code TENANT_SUSPENDED
 * (Phase 3.4) — the tenant's Teculiar subscription lapsed. Rendered by both the admin (SSR)
 * and client (browser fetch) dashboards; works in server and client components.
 */
export function SuspendedNotice({ locale, scope, billingUrl }: SuspendedNoticeProps) {
  const copy = getDictionary(locale).common.suspended;
  return (
    <div className={styles.wrap} role="alert">
      <div className={styles.card}>
        <h1>{copy.title}</h1>
        <p>{scope === "admin" ? copy.adminBody : copy.clientBody}</p>
        {scope === "admin" && billingUrl ? (
          <a className={styles.cta} href={billingUrl}>
            {copy.payCta}
          </a>
        ) : null}
      </div>
    </div>
  );
}
