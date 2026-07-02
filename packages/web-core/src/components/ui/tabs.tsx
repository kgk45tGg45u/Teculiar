import type { ComponentPropsWithoutRef } from "react";

function joinClass(...classes: Array<string | undefined>) {
  return classes.filter(Boolean).join(" ");
}

export function Tabs({ className, ...props }: ComponentPropsWithoutRef<"div">) {
  return <div className={joinClass("tabs", className)} {...props} />;
}

export function TabList({ className, ...props }: ComponentPropsWithoutRef<"div">) {
  return <div className={joinClass("tab-list", className)} role="tablist" {...props} />;
}

export function TabButton({ className, ...props }: ComponentPropsWithoutRef<"button">) {
  const selected = props["aria-selected"] === true || props["aria-selected"] === "true";
  return (
    <button
      className={joinClass("tab-button", selected ? "active" : undefined, className)}
      role="tab"
      type="button"
      {...props}
    />
  );
}

export function TabPanel(props: ComponentPropsWithoutRef<"div">) {
  return <div role="tabpanel" {...props} />;
}
