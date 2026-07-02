// Pure, immutable helpers for editing a layout doc's node tree (Phase 3c builder). Every mutation
// returns a new tree so the in-memory doc is never mutated in place — nothing is lost mid-drag and
// React re-renders cleanly. `containerId` is "root" for the top level, else a container node's id.
import type { LayoutDoc, Node } from "@dezhost/web-core/lib/customizer/types";
import { ROOT_CONTAINER } from "./dnd-ids";

/** Find a node anywhere in the tree by id. */
export function findNode(nodes: Node[], id: string): Node | null {
  for (const node of nodes) {
    if (node.id === id) {
      return node;
    }
    const hit = node.children ? findNode(node.children, id) : null;
    if (hit) {
      return hit;
    }
  }
  return null;
}

/** The container ("root" or a container node id) that directly holds `id`, or null if absent. */
export function parentContainerId(nodes: Node[], id: string, container: string = ROOT_CONTAINER): string | null {
  for (const node of nodes) {
    if (node.id === id) {
      return container;
    }
    const hit = node.children ? parentContainerId(node.children, id, node.id) : null;
    if (hit) {
      return hit;
    }
  }
  return null;
}

/** The children array of a container ("root" → doc.root, else the container node's children). */
export function childrenOf(doc: LayoutDoc, containerId: string): Node[] {
  if (containerId === ROOT_CONTAINER) {
    return doc.root;
  }
  return findNode(doc.root, containerId)?.children ?? [];
}

/** Index of `id` within its container, or -1. */
export function indexInContainer(doc: LayoutDoc, containerId: string, id: string): number {
  return childrenOf(doc, containerId).findIndex((node) => node.id === id);
}

/** True when `id` is `node` itself or one of its descendants (guards dropping a container into itself). */
export function containsId(node: Node, id: string): boolean {
  if (node.id === id) {
    return true;
  }
  return (node.children ?? []).some((child) => containsId(child, id));
}

/** Remove a node by id, returning the new tree and the removed node. */
export function removeNode(nodes: Node[], id: string): { nodes: Node[]; removed: Node | null } {
  let removed: Node | null = null;
  const next: Node[] = [];
  for (const node of nodes) {
    if (node.id === id) {
      removed = node;
      continue;
    }
    if (node.children) {
      const result = removeNode(node.children, id);
      if (result.removed) {
        removed = result.removed;
        next.push({ ...node, children: result.nodes });
        continue;
      }
    }
    next.push(node);
  }
  return { nodes: next, removed };
}

/** Insert `node` into a container at `index` (clamped). containerId "root" → top level. */
export function insertNode(nodes: Node[], containerId: string, index: number, node: Node): Node[] {
  if (containerId === ROOT_CONTAINER) {
    const next = nodes.slice();
    next.splice(clamp(index, next.length), 0, node);
    return next;
  }
  return nodes.map((current) => {
    if (current.id === containerId) {
      const children = current.children ? current.children.slice() : [];
      children.splice(clamp(index, children.length), 0, node);
      return { ...current, children };
    }
    if (current.children) {
      return { ...current, children: insertNode(current.children, containerId, index, node) };
    }
    return current;
  });
}

/** Replace the node with `id` by `patch(node)` (immutably, anywhere in the tree). */
export function updateNode(nodes: Node[], id: string, patch: (node: Node) => Node): Node[] {
  return nodes.map((node) => {
    if (node.id === id) {
      return patch(node);
    }
    if (node.children) {
      return { ...node, children: updateNode(node.children, id, patch) };
    }
    return node;
  });
}

function clamp(index: number, max: number): number {
  if (!Number.isFinite(index) || index < 0) {
    return 0;
  }
  return index > max ? max : index;
}
