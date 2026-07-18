import Link from "next/link";
import type { Route } from "next";
import type { ComponentType, ReactNode } from "react";
import type { LucideProps } from "lucide-react";
import styles from "./button.module.css";

type ButtonProps = {
  children: ReactNode;
  href?: string;
  icon?: ComponentType<LucideProps>;
  variant?: "primary" | "secondary" | "ghost" | "danger";
  size?: "sm" | "md";
  /** Square button showing only the icon; children become the screen-reader label. */
  iconOnly?: boolean;
  className?: string;
  type?: "button" | "submit";
  onClick?: () => void;
  title?: string;
  disabled?: boolean;
};

export function Button({
  children,
  href,
  icon: Icon,
  variant = "primary",
  size = "md",
  iconOnly = false,
  className,
  type = "button",
  onClick,
  title,
  disabled = false
}: ButtonProps) {
  const buttonClassName = [styles.button, styles[variant], styles[size], iconOnly ? styles.iconOnly : undefined, className]
    .filter(Boolean)
    .join(" ");
  const content = (
    <>
      {Icon ? <Icon aria-hidden size={16} strokeWidth={2.2} /> : null}
      <span className={iconOnly ? "sr-only" : undefined}>{children}</span>
    </>
  );

  if (href) {
    return (
      <Link className={buttonClassName} href={href as Route} title={title} aria-disabled={disabled || undefined}>
        {content}
      </Link>
    );
  }

  return (
    <button className={buttonClassName} type={type} onClick={onClick} title={title} disabled={disabled}>
      {content}
    </button>
  );
}
