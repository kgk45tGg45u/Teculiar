import type { ComponentPropsWithoutRef } from "react";

function joinClass(...classes: Array<string | undefined>) {
  return classes.filter(Boolean).join(" ");
}

export function Table({ className, ...props }: ComponentPropsWithoutRef<"table">) {
  return <table className={joinClass("compact-table", className)} {...props} />;
}

export function TableHead(props: ComponentPropsWithoutRef<"thead">) {
  return <thead {...props} />;
}

export function TableBody(props: ComponentPropsWithoutRef<"tbody">) {
  return <tbody {...props} />;
}

export function TableRow(props: ComponentPropsWithoutRef<"tr">) {
  return <tr {...props} />;
}

export function TableHeader(props: ComponentPropsWithoutRef<"th">) {
  return <th {...props} />;
}

export function TableCell(props: ComponentPropsWithoutRef<"td">) {
  return <td {...props} />;
}
