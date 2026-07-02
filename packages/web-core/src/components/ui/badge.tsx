import type { HTMLAttributes, ReactNode } from "react";

export type BadgeTone = "neutral" | "success" | "warning" | "danger" | "accent";

type BadgeProps = HTMLAttributes<HTMLSpanElement> & {
  children: ReactNode;
  tone?: BadgeTone;
};

const toneClass: Record<BadgeTone, string> = {
  neutral: "",
  success: "success",
  warning: "warning",
  danger: "danger",
  accent: "accent"
};

export function Badge({ children, tone = "neutral", className, ...props }: BadgeProps) {
  return (
    <span className={["status-badge", toneClass[tone], className].filter(Boolean).join(" ")} {...props}>
      {children}
    </span>
  );
}
