// Resolve a lucide icon by name for element renders + the builder palette. Element defs reference an
// icon by its lucide export name (a plain string in the layout doc / def), kept theme-neutral.
import * as Icons from "lucide-react";
import { Square } from "lucide-react";
import type { ComponentType } from "react";

type IconProps = { size?: number; strokeWidth?: number; "aria-hidden"?: boolean };
const REGISTRY = Icons as unknown as Record<string, ComponentType<IconProps>>;
const FALLBACK = Square as unknown as ComponentType<IconProps>;

export function lucideIcon(name: string | undefined): ComponentType<IconProps> {
  return (name ? REGISTRY[name] : undefined) ?? FALLBACK;
}
