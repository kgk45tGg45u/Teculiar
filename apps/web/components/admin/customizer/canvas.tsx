"use client";

import { useDroppable } from "@dnd-kit/core";
import { SortableContext, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { GripVertical, Pencil, Trash2 } from "lucide-react";
import { getElementDef } from "@teculiar/web-core/lib/customizer/registry";
import type { Node } from "@teculiar/web-core/lib/customizer/types";
import { containerDroppableId, ROOT_CONTAINER } from "./dnd-ids";
import styles from "./customizer.module.css";
import type { CanvasContext } from "./types";

// The center canvas: the layout doc rendered with the SAME element registry as the live storefront
// (mode="preview"), but each node wrapped in a sortable, selectable, deletable frame. Containers host
// a nested droppable + SortableContext so elements can be dropped into / reordered within them.
export function Canvas({ root, ctx }: { root: Node[]; ctx: CanvasContext }) {
  return (
    <div className={styles.canvas}>
      <Container containerId={ROOT_CONTAINER} ctx={ctx} nodes={root} />
    </div>
  );
}

function Container({ nodes, containerId, ctx }: { nodes: Node[]; containerId: string; ctx: CanvasContext }) {
  const { setNodeRef, isOver } = useDroppable({ id: containerDroppableId(containerId) });
  return (
    <SortableContext id={containerDroppableId(containerId)} items={nodes.map((node) => node.id)} strategy={verticalListSortingStrategy}>
      <div className={`${styles.dropZone}${isOver ? ` ${styles.dropZoneOver}` : ""}`} ref={setNodeRef}>
        {nodes.length === 0 ? <p className={styles.emptyHint}>{ctx.emptyHint}</p> : null}
        {nodes.map((node) => (
          <CanvasNode ctx={ctx} key={node.id} node={node} />
        ))}
      </div>
    </SortableContext>
  );
}

function CanvasNode({ node, ctx }: { node: Node; ctx: CanvasContext }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: node.id });
  const def = getElementDef(node.type);
  const selected = ctx.selectedId === node.id;
  const style = { transform: CSS.Translate.toString(transform), transition, opacity: isDragging ? 0.4 : 1 };

  const rendered = def ? (
    <def.Render locale={ctx.locale} mainLocale={ctx.mainLocale} mode="preview" node={node}>
      {def.isContainer ? <Container containerId={node.id} ctx={ctx} nodes={node.children ?? []} /> : null}
    </def.Render>
  ) : (
    <div className={styles.unknown}>Unknown element: {node.type}</div>
  );

  return (
    <div
      className={`${styles.node}${selected ? ` ${styles.nodeSelected}` : ""}`}
      data-node-type={node.type}
      onClick={(event) => {
        event.stopPropagation();
        ctx.onSelect(node.id);
      }}
      ref={setNodeRef}
      style={style}
    >
      <div className={styles.nodeBar}>
        <button aria-label="Drag" className={styles.handle} type="button" {...listeners} {...attributes}>
          <GripVertical size={14} />
        </button>
        <span className={styles.nodeType}>{def?.type ?? node.type}</span>
        <button
          aria-label="Edit"
          className={styles.nodeBtn}
          onClick={(event) => {
            event.stopPropagation();
            ctx.onSelect(node.id);
          }}
          type="button"
        >
          <Pencil size={13} />
        </button>
        <button
          aria-label="Delete"
          className={styles.nodeBtnDanger}
          onClick={(event) => {
            event.stopPropagation();
            ctx.onDelete(node.id);
          }}
          type="button"
        >
          <Trash2 size={13} />
        </button>
      </div>
      {rendered}
    </div>
  );
}
