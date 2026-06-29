"use client";

import { useDraggable } from "@dnd-kit/core";
import * as Icons from "lucide-react";
import type { ComponentType } from "react";
import { listElements } from "../../../lib/customizer/registry";
import { localized } from "../../../lib/storefront-theme";
import { PALETTE_PREFIX } from "./dnd-ids";
import styles from "./customizer.module.css";
import type { CustomizerT } from "./types";

// Left rail: every registered element as a draggable chip. Drop onto the canvas to insert the def's
// example() node. The element inventory is registry-driven, so 3d expands this list automatically.
export function Palette({ locale, mainLocale, t }: { locale: string; mainLocale: string; t: CustomizerT }) {
  return (
    <aside className={styles.palette}>
      <h3 className={styles.paletteTitle}>{t.elements}</h3>
      <div className={styles.paletteList}>
        {listElements().map((def) => (
          <PaletteItem icon={def.icon} key={def.type} label={localized(def.label, locale, mainLocale)} type={def.type} />
        ))}
      </div>
    </aside>
  );
}

function PaletteItem({ type, label, icon }: { type: string; label: string; icon: string }) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: `${PALETTE_PREFIX}${type}` });
  const Icon = (Icons as unknown as Record<string, ComponentType<{ size?: number }>>)[icon] ?? Icons.Square;
  return (
    <button
      className={styles.paletteItem}
      ref={setNodeRef}
      style={{ opacity: isDragging ? 0.4 : 1 }}
      type="button"
      {...listeners}
      {...attributes}
    >
      <Icon size={16} />
      {label}
    </button>
  );
}
