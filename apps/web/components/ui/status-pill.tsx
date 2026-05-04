import styles from "./status-pill.module.css";

type StatusPillProps = {
  label: string;
  tone?: "good" | "warn" | "neutral";
};

export function StatusPill({ label, tone = "neutral" }: StatusPillProps) {
  return <span className={`${styles.pill} ${styles[tone]}`}>{label}</span>;
}
