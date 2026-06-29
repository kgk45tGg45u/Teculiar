// Shared types for the Customizer builder components (Phase 3c).
import type { Dictionary } from "../../../lib/dictionary";

/** The admin.customizer pack group (en is the source-of-truth shape). */
export type CustomizerT = Dictionary["admin"]["customizer"];

/** Read-only context threaded through the canvas for rendering + per-node controls. */
export type CanvasContext = {
  locale: string;
  mainLocale: string;
  selectedId: string | null;
  activeId: string | null;
  onSelect: (id: string) => void;
  onDelete: (id: string) => void;
  emptyHint: string;
};
