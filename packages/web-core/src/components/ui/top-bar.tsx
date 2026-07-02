import type { HTMLAttributes, ReactNode } from "react";

type TopBarProps = HTMLAttributes<HTMLElement> & {
  left?: ReactNode;
  right?: ReactNode;
};

function joinClass(...classes: Array<string | undefined>) {
  return classes.filter(Boolean).join(" ");
}

export function TopBar({ left, right, children, className, ...props }: TopBarProps) {
  return (
    <header className={joinClass("top-bar", className)} {...props}>
      <div>{left ?? children}</div>
      {right ? <div>{right}</div> : null}
    </header>
  );
}
