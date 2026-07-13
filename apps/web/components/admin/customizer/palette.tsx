"use client";

import { useDraggable } from "@dnd-kit/core";
import { lucideIcon } from "@teculiar/web-core/lib/customizer/icons";
import { listElements } from "@teculiar/web-core/lib/customizer/registry";
import type { ElementCategory } from "@teculiar/web-core/lib/customizer/registry/types";
import { localized } from "@teculiar/web-core/lib/storefront-theme";
import { PALETTE_PREFIX } from "./dnd-ids";
import styles from "./customizer.module.css";
import type { CustomizerT } from "./types";

// Left rail: every registered element as a draggable chip, grouped by category. Drop onto the canvas
// to insert the def's example() node. Registry-driven, so 3d's expanded inventory shows automatically.
const CATEGORIES: ElementCategory[] = ["section", "card", "atom", "dynamic", "token"];

export function Palette({ locale, mainLocale, t }: { locale: string; mainLocale: string; t: CustomizerT }) {
  return (
    <aside className={styles.palette}>
      {CATEGORIES.map((category) => {
        const items = listElements(category);
        if (items.length === 0) {
          return null;
        }
        return (
          <div key={category}>
            <h3 className={styles.paletteTitle}>{t.categories[category]}</h3>
            <div className={styles.paletteList}>
              {items.map((def) => (
                <PaletteItem icon={def.icon} key={def.type} label={localized(def.label, locale, mainLocale)} type={def.type} />
              ))}
            </div>
          </div>
        );
      })}
    </aside>
  );
}

function PaletteItem({ type, label, icon }: { type: string; label: string; icon: string }) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: `${PALETTE_PREFIX}${type}` });
  const Icon = lucideIcon(icon);
  return (
    <button
      className={styles.paletteItem}
      data-element={type}
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
