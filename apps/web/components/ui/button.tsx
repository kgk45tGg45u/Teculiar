import Link from "next/link";
import type { ComponentType, ReactNode } from "react";
import type { LucideProps } from "lucide-react";
import styles from "./button.module.css";

type ButtonProps = {
  children: ReactNode;
  href?: string;
  icon?: ComponentType<LucideProps>;
  variant?: "primary" | "secondary" | "ghost";
  type?: "button" | "submit";
  onClick?: () => void;
  title?: string;
};

export function Button({
  children,
  href,
  icon: Icon,
  variant = "primary",
  type = "button",
  onClick,
  title
}: ButtonProps) {
  const className = `${styles.button} ${styles[variant]}`;
  const content = (
    <>
      {Icon ? <Icon aria-hidden size={18} strokeWidth={2.2} /> : null}
      <span>{children}</span>
    </>
  );

  if (href) {
    return (
      <Link className={className} href={href} title={title}>
        {content}
      </Link>
    );
  }

  return (
    <button className={className} type={type} onClick={onClick} title={title}>
      {content}
    </button>
  );
}
