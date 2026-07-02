import type { HTMLAttributes, ReactNode } from "react";

type DialogProps = HTMLAttributes<HTMLDivElement> & {
  children: ReactNode;
};

function joinClass(...classes: Array<string | undefined>) {
  return classes.filter(Boolean).join(" ");
}

export function DialogBackdrop({ children, className, ...props }: DialogProps) {
  return (
    <div className={joinClass("dialog-backdrop", className)} {...props}>
      {children}
    </div>
  );
}

export function DialogPanel({ children, className, ...props }: DialogProps) {
  return (
    <div className={joinClass("dialog-panel", className)} role="document" {...props}>
      {children}
    </div>
  );
}

export function Dialog({ children, className, ...props }: DialogProps) {
  return (
    <DialogBackdrop>
      <div aria-modal="true" className={className} role="dialog" {...props}>
        <DialogPanel>{children}</DialogPanel>
      </div>
    </DialogBackdrop>
  );
}

export const Modal = Dialog;
