import type { ReactNode } from "react";
import styles from "./card.module.css";

type CardProps = {
  children: ReactNode;
  tone?: "default" | "selected";
  className?: string;
};

export function Card({ children, tone = "default", className }: CardProps) {
  return <article className={[styles.card, styles[tone], className].filter(Boolean).join(" ")}>{children}</article>;
}
