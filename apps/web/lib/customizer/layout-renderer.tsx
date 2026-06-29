// One renderer for both the live storefront page (server) and the builder preview (client), so
// preview == live by construction. Walks the layout doc's node tree, looks up each node's
// ElementDef in the registry, resolves per-locale text/tokens (main-language fallback) inside the
// def's Render, and renders children recursively.
//
// An unregistered node type is skipped on the live site (so a doc referencing a not-yet-registered
// element never crashes a published page) and shown as a placeholder in preview mode.
import type { ReactNode } from "react";
import { getElementDef } from "./registry";
import type { RenderMode } from "./registry/types";
import type { LayoutDoc, Node } from "./types";

type RendererProps = {
  doc: LayoutDoc | null;
  locale: string;
  mainLocale: string;
  mode?: RenderMode;
};

export function LayoutRenderer({ doc, locale, mainLocale, mode = "live" }: RendererProps): ReactNode {
  if (!doc?.root?.length) {
    return null;
  }
  return (
    <>
      {doc.root.map((node) => (
        <RenderNode key={node.id} node={node} locale={locale} mainLocale={mainLocale} mode={mode} />
      ))}
    </>
  );
}

export function RenderNode({ node, locale, mainLocale, mode }: { node: Node; locale: string; mainLocale: string; mode: RenderMode }): ReactNode {
  const def = getElementDef(node.type);
  if (!def) {
    if (mode === "preview") {
      return <div className="customizer-unknown" data-type={node.type}>Unknown element: {node.type}</div>;
    }
    return null; // live: silently skip unregistered types so a published page never crashes
  }
  const children = node.children?.length
    ? node.children.map((child) => (
        <RenderNode key={child.id} node={child} locale={locale} mainLocale={mainLocale} mode={mode} />
      ))
    : null;
  return <def.Render node={node} locale={locale} mainLocale={mainLocale} mode={mode}>{children}</def.Render>;
}
