import type { ComponentPropsWithoutRef, ReactNode } from "react";

type DropdownProps = ComponentPropsWithoutRef<"div"> & {
  children: ReactNode;
};

function joinClass(...classes: Array<string | undefined>) {
  return classes.filter(Boolean).join(" ");
}

export function Dropdown({ children, className, ...props }: DropdownProps) {
  return (
    <div className={joinClass("dropdown-panel", className)} {...props}>
      {children}
    </div>
  );
}

export function DropdownItem({ className, ...props }: ComponentPropsWithoutRef<"button">) {
  return <button className={joinClass("dropdown-item", className)} type="button" {...props} />;
}
