import type { ComponentPropsWithoutRef, LabelHTMLAttributes, ReactNode } from "react";

type FieldProps = LabelHTMLAttributes<HTMLLabelElement> & {
  label?: ReactNode;
  hint?: ReactNode;
  error?: ReactNode;
};

function joinClass(...classes: Array<string | undefined>) {
  return classes.filter(Boolean).join(" ");
}

export function Field({ label, hint, error, children, className, ...props }: FieldProps) {
  return (
    <label className={joinClass("form-field", error ? "field-error" : undefined, className)} {...props}>
      {label ? <span>{label}</span> : null}
      {children}
      {hint ? <small className="muted-text">{hint}</small> : null}
      {error ? <small className="status-badge danger">{error}</small> : null}
    </label>
  );
}

export function Input({ className, ...props }: ComponentPropsWithoutRef<"input">) {
  return <input className={joinClass("input", className)} {...props} />;
}

export function Select({ className, ...props }: ComponentPropsWithoutRef<"select">) {
  return <select className={joinClass("input", className)} {...props} />;
}

export function Textarea({ className, ...props }: ComponentPropsWithoutRef<"textarea">) {
  return <textarea className={joinClass("input", className)} {...props} />;
}
