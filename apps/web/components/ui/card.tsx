import type { ReactNode } from "react";
import styles from "./card.module.css";

type CardProps = {
  children: ReactNode;
  tone?: "default" | "selected";
};

export function Card({ children, tone = "default" }: CardProps) {
  return <article className={`${styles.card} ${styles[tone]}`}>{children}</article>;
}
