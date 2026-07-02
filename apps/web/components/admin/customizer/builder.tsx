"use client";

import {
  closestCenter,
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent
} from "@dnd-kit/core";
import { sortableKeyboardCoordinates } from "@dnd-kit/sortable";
import { ArrowLeft, History, Trash2, UploadCloud } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { getElementDef } from "@dezhost/web-core/lib/customizer/registry";
import { asLayoutDoc, emptyLayout, type LayoutDoc, type Node } from "@dezhost/web-core/lib/customizer/types";
import { getDictionary } from "@dezhost/web-core/lib/dictionary";
import { localized } from "@dezhost/web-core/lib/storefront-theme";
import { useLocale } from "@dezhost/web-core/components/layout/locale-provider";
import { Button } from "@dezhost/web-core/components/ui/button";
import { notifyResponse } from "@dezhost/web-core/components/ui/toast-provider";
import { getPage, publish, saveDraft } from "./api";
import { Canvas } from "./canvas";
import {
  containerIdOf,
  isContainerId,
  isPaletteId,
  paletteType,
  ROOT_CONTAINER,
  ROOT_DROPPABLE,
  TRASH_DROPPABLE
} from "./dnd-ids";
import { EditModal } from "./edit-modal";
import { clearBuffer, loadBuffer, saveBuffer } from "./idb";
import { Palette } from "./palette";
import { childrenOf, containsId, findNode, indexInContainer, insertNode, parentContainerId, removeNode, updateNode } from "./tree";
import { VersionsModal } from "./versions-modal";
import styles from "./customizer.module.css";

export type BuilderProps = {
  pageId: string;
  pageKey: string;
  pageName: string;
  published: boolean; // a layout has been published → the live page renders the doc (not the built-in renderer)
  locales: string[];
  mainLocale: string;
  canTranslate: boolean;
  initialDoc: LayoutDoc;
  draftUpdatedAt: string | null;
  layoutVersion: number;
};

export function CustomizerBuilder(props: BuilderProps) {
  const { pageId, pageKey, pageName, locales, mainLocale, canTranslate, initialDoc, draftUpdatedAt } = props;
  const uiLocale = useLocale();
  const t = getDictionary(uiLocale).admin.customizer;
  const adminLocale = locales.includes(uiLocale) ? uiLocale : mainLocale;

  const [doc, setDoc] = useState<LayoutDoc>(initialDoc);
  const [dirty, setDirty] = useState(false);
  const [published, setPublished] = useState(props.published);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [previewLocale, setPreviewLocale] = useState(adminLocale);
  const [restore, setRestore] = useState<LayoutDoc | null>(null);
  const [saving, setSaving] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [showVersions, setShowVersions] = useState(false);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  const apply = useCallback((producer: (current: LayoutDoc) => LayoutDoc) => {
    setDoc((current) => producer(current));
    setDirty(true);
  }, []);

  // ── Storage layer 1: browser IndexedDB buffer (recovery before an explicit Save) ──
  useEffect(() => {
    let active = true;
    void loadBuffer(pageId).then((buffer) => {
      if (!active || !buffer) {
        return;
      }
      const serverMs = draftUpdatedAt ? new Date(draftUpdatedAt).getTime() : 0;
      if (buffer.savedAt > serverMs + 1000) {
        setRestore(buffer.doc); // local edits newer than the server draft → offer to restore
      }
    });
    return () => {
      active = false;
    };
  }, [pageId, draftUpdatedAt]);

  useEffect(() => {
    if (!dirty) {
      return;
    }
    const handle = setTimeout(() => void saveBuffer(pageId, doc), 1000);
    return () => clearTimeout(handle);
  }, [doc, dirty, pageId]);

  // beforeunload guard while there are unsaved (server-side) changes.
  useEffect(() => {
    if (!dirty) {
      return;
    }
    const handler = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [dirty]);

  // ── Drag handling — palette drop / reorder / move-between-containers / trash ──
  function onDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    setActiveId(null);
    if (!over) {
      return;
    }
    const activeKey = String(active.id);
    const overKey = String(over.id);

    if (isPaletteId(activeKey)) {
      if (overKey === TRASH_DROPPABLE) {
        return; // dropping a fresh element on the trash is a no-op
      }
      const def = getElementDef(paletteType(activeKey));
      if (!def) {
        return;
      }
      const node = def.example();
      apply((current) => {
        const target = resolveTarget(current, overKey);
        return { ...current, root: insertNode(current.root, target.containerId, target.index, node) };
      });
      return;
    }

    if (overKey === TRASH_DROPPABLE) {
      handleDelete(activeKey);
      return;
    }
    if (activeKey === overKey) {
      return;
    }

    apply((current) => {
      const { nodes: without, removed } = removeNode(current.root, activeKey);
      if (!removed) {
        return current;
      }
      const target = resolveTarget({ ...current, root: without }, overKey);
      if (target.containerId !== ROOT_CONTAINER && containsId(removed, target.containerId)) {
        return current; // never drop a container into its own subtree
      }
      return { ...current, root: insertNode(without, target.containerId, target.index, removed) };
    });
  }

  const handleDelete = useCallback(
    (id: string) => {
      apply((current) => ({ ...current, root: removeNode(current.root, id).nodes }));
      setSelectedId((selected) => (selected === id ? null : selected));
    },
    [apply]
  );

  async function onSave() {
    setSaving(true);
    const response = await saveDraft(pageId, doc);
    await notifyResponse(response, t.savedDraft, t.saveFailed);
    if (response.ok) {
      setDirty(false);
      await clearBuffer(pageId);
    }
    setSaving(false);
  }

  async function onPublish() {
    setPublishing(true);
    const response = await publish(pageId, doc);
    await notifyResponse(response, t.published, t.publishFailed);
    if (response.ok) {
      setDirty(false);
      setPublished(true);
      await clearBuffer(pageId);
    }
    setPublishing(false);
  }

  async function reloadAfterRevert() {
    const data = await getPage(pageId);
    if (!data) {
      return;
    }
    setDoc(asLayoutDoc(data.draftLayout) ?? asLayoutDoc(data.publishedLayout) ?? emptyLayout());
    setPublished(data.publishedLayout != null);
    setDirty(false);
    await clearBuffer(pageId);
  }

  const selectedNode = selectedId ? findNode(doc.root, selectedId) : null;
  const selectedDef = selectedNode ? getElementDef(selectedNode.type) : undefined;

  const overlayLabel = useMemo(() => {
    if (!activeId) {
      return null;
    }
    if (isPaletteId(activeId)) {
      const def = getElementDef(paletteType(activeId));
      return def ? localized(def.label, adminLocale, mainLocale) : paletteType(activeId);
    }
    const node = findNode(doc.root, activeId);
    const def = node ? getElementDef(node.type) : undefined;
    return def ? localized(def.label, adminLocale, mainLocale) : node?.type ?? "";
  }, [activeId, doc, adminLocale, mainLocale]);

  return (
    <div className={styles.shell}>
      {restore ? (
        <div className={styles.restore}>
          <span>{t.restoreBody}</span>
          <span className={styles.restoreSpacer} />
          <button
            onClick={() => {
              setDoc(restore);
              setDirty(true);
              setRestore(null);
            }}
            style={{ padding: "6px 12px", borderRadius: 8, border: "1px solid #8a6d1a", background: "transparent", color: "#8a6d1a", cursor: "pointer" }}
            type="button"
          >
            {t.restore}
          </button>
          <button
            onClick={() => {
              void clearBuffer(pageId);
              setRestore(null);
            }}
            style={{ padding: "6px 12px", borderRadius: 8, border: "none", background: "transparent", color: "#8a6d1a", cursor: "pointer" }}
            type="button"
          >
            {t.discard}
          </button>
        </div>
      ) : null}

      <DndContext
        collisionDetection={closestCenter}
        id="customizer-builder"
        onDragEnd={onDragEnd}
        onDragStart={(event: DragStartEvent) => setActiveId(String(event.active.id))}
        sensors={sensors}
      >
        <div className={styles.topbar}>
          <Button href="/admin/theme" icon={ArrowLeft} variant="ghost">{t.back}</Button>
          <h1 className={styles.title}>{pageName}</h1>
          <span className={styles.badge}>{pageKey}</span>
          <span className={published ? `${styles.badge} ${styles.badgeLive}` : styles.badge}>
            {published ? t.liveCustom : t.builtIn}
          </span>
          {dirty ? <span className={`${styles.badge} ${styles.badgeDirty}`}>{t.unsaved}</span> : null}
          <span className={styles.spacer} />
          <TrashZone active={!!activeId && !isPaletteId(activeId)} label={t.dragToDelete} />
          <select
            aria-label={t.previewLanguage}
            className={styles.localeSelect}
            onChange={(event) => setPreviewLocale(event.target.value)}
            value={previewLocale}
          >
            {locales.map((locale) => (
              <option key={locale} value={locale}>{locale.toUpperCase()}</option>
            ))}
          </select>
          <Button icon={History} onClick={() => setShowVersions(true)} variant="ghost">{t.versions}</Button>
          <Button disabled={saving || !dirty} onClick={() => void onSave()} variant="secondary">{saving ? t.saving : t.save}</Button>
          <Button disabled={publishing} icon={UploadCloud} onClick={() => void onPublish()}>{publishing ? t.publishing : t.publish}</Button>
        </div>

        <div className={styles.body}>
          <Palette locale={adminLocale} mainLocale={mainLocale} t={t} />
          <div className={styles.canvasScroll} onClick={() => setSelectedId(null)}>
            <Canvas
              ctx={{
                locale: previewLocale,
                mainLocale,
                selectedId,
                activeId,
                onSelect: setSelectedId,
                onDelete: handleDelete,
                emptyHint: t.emptyCanvas
              }}
              root={doc.root}
            />
          </div>
        </div>

        <DragOverlay>{overlayLabel ? <div className={styles.overlayChip}>{overlayLabel}</div> : null}</DragOverlay>
      </DndContext>

      {selectedNode && selectedDef ? (
        <EditModal
          adminLocale={adminLocale}
          canTranslate={canTranslate}
          def={selectedDef}
          key={selectedNode.id}
          locales={locales}
          mainLocale={mainLocale}
          node={selectedNode}
          onChange={(next: Node) => apply((current) => ({ ...current, root: updateNode(current.root, next.id, () => next) }))}
          onClose={() => setSelectedId(null)}
          t={t}
        />
      ) : null}

      <VersionsModal onClose={() => setShowVersions(false)} onReverted={() => void reloadAfterRevert()} open={showVersions} pageId={pageId} t={t} />
    </div>
  );
}

function TrashZone({ active, label }: { active: boolean; label: string }) {
  const { setNodeRef, isOver } = useDroppable({ id: TRASH_DROPPABLE });
  return (
    <div className={`${styles.trash}${active ? ` ${styles.trashActive}` : ""}${isOver ? ` ${styles.trashOver}` : ""}`} ref={setNodeRef}>
      <Trash2 size={14} /> {label}
    </div>
  );
}

// Where a drop lands: a container's empty drop zone → append; over a node → before that node.
function resolveTarget(doc: LayoutDoc, overId: string): { containerId: string; index: number } {
  if (overId === ROOT_DROPPABLE || isContainerId(overId)) {
    const containerId = containerIdOf(overId);
    return { containerId, index: childrenOf(doc, containerId).length };
  }
  const containerId = parentContainerId(doc.root, overId) ?? ROOT_CONTAINER;
  const index = indexInContainer(doc, containerId, overId);
  return { containerId, index: index < 0 ? childrenOf(doc, containerId).length : index };
}
