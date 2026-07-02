import Link from "next/link";
import type { Route } from "next";
import type { ComponentType, HTMLAttributes, ReactNode } from "react";
import type { LucideProps } from "lucide-react";

function joinClass(...classes: Array<string | undefined>) {
  return classes.filter(Boolean).join(" ");
}

type SidebarNavProps = HTMLAttributes<HTMLElement> & {
  children: ReactNode;
};

type SidebarNavItemProps = {
  children: ReactNode;
  href: string;
  active?: boolean;
  icon?: ComponentType<LucideProps>;
  className?: string;
};

export function SidebarNav({ children, className, ...props }: SidebarNavProps) {
  return (
    <nav className={joinClass("sidebar-nav", className)} {...props}>
      {children}
    </nav>
  );
}

export function SidebarNavItem({ children, href, active = false, icon: Icon, className }: SidebarNavItemProps) {
  return (
    <Link
      aria-current={active ? "page" : undefined}
      className={joinClass("sidebar-nav-item", active ? "active" : undefined, className)}
      href={href as Route}
    >
      {Icon ? <Icon aria-hidden size={15} strokeWidth={2.1} /> : null}
      <span>{children}</span>
    </Link>
  );
}
