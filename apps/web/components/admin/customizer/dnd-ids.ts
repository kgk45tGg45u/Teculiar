// Shared @dnd-kit identifier scheme for the builder (Phase 3c). Three id spaces never collide:
//  • palette items  → "palette:<type>"     (useDraggable, a new element to drop)
//  • containers     → "container:<id>"     (useDroppable; the special root is "container:root")
//  • element nodes  → the raw node id       (useSortable, an existing node)
//  • the trash zone → "trash"               (useDroppable; drop a node to delete it)
export const PALETTE_PREFIX = "palette:";
export const CONTAINER_PREFIX = "container:";
export const ROOT_CONTAINER = "root";
export const ROOT_DROPPABLE = `${CONTAINER_PREFIX}${ROOT_CONTAINER}`;
export const TRASH_DROPPABLE = "trash";

export const containerDroppableId = (containerId: string) => `${CONTAINER_PREFIX}${containerId}`;
export const isPaletteId = (id: string) => id.startsWith(PALETTE_PREFIX);
export const paletteType = (id: string) => id.slice(PALETTE_PREFIX.length);
export const isContainerId = (id: string) => id.startsWith(CONTAINER_PREFIX);
export const containerIdOf = (id: string) => id.slice(CONTAINER_PREFIX.length);
