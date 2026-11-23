"use client";

import { EyeOff, ExternalLink, RotateCcw } from "lucide-react";
import type { SourceMeta } from "@/types/dayboard";
import { cn } from "@/lib/cn";
import { useApp } from "./app-context";
import { useCanvas } from "./canvas-provider";
import { Button, Notice } from "./ui";

type Kind = "assignment" | "exam" | "event";

/** Small "Canvas" tag on imported items. (Words only — no Canvas logo.) */
export function CanvasBadge({ meta, show, className }: { meta?: SourceMeta; show?: boolean; className?: string }) {
  if (!meta && !show) return null;
  return (
    <span className={cn("inline-flex shrink-0 items-center rounded-full border border-line bg-surface-2 px-2 py-0.5 text-[11px] font-semibold uppercase tracking-[0.04em] text-ink-2", className)} title="Imported from Canvas">
      Canvas
    </span>
  );
}

function setMeta(store: ReturnType<typeof useApp>["store"], kind: Kind, id: string, meta: SourceMeta) {
  if (kind === "assignment") store.updateAssignment(id, { sourceMeta: meta });
  else if (kind === "exam") store.updateExam(id, { sourceMeta: meta });
  else {
    const event = store.data.events.find((entry) => entry.id === id);
    if (event) {
      const { id: _id, ...rest } = event;
      store.updateEvent(id, { ...rest, sourceMeta: meta });
    }
  }
}

/** "Due date changed in Canvas" / "No longer in Canvas" notes, shown on the item. */
export function CanvasNotices({ kind, id, meta }: { kind: Kind; id: string; meta?: SourceMeta }) {
  const { store } = useApp();
  if (!meta || (!meta.dateChanged && !meta.removedFromSource)) return null;
  return (
    <div className="grid gap-2">
      {meta.dateChanged ? (
        <Notice tone="amber" className="flex items-center justify-between gap-3">
          <span>Due date changed in Canvas.</span>
          <button type="button" className="shrink-0 text-[13px] font-semibold underline" onClick={() => setMeta(store, kind, id, { ...meta, dateChanged: false })}>
            Got it
          </button>
        </Notice>
      ) : null}
      {meta.removedFromSource ? <Notice tone="neutral">No longer in Canvas. It&apos;s kept here because you worked on it.</Notice> : null}
    </div>
  );
}

/** Open in Canvas · Hide · Reset to Canvas version. */
export function CanvasActions({ kind, id, meta, onHidden }: { kind: Kind; id: string; meta?: SourceMeta; onHidden?: () => void }) {
  const { store, showToast } = useApp();
  const canvas = useCanvas();
  if (!meta) return null;
  const edited = meta.editedFields.length > 0;

  return (
    <div className="flex flex-wrap items-center gap-2">
      {meta.externalUrl ? (
        <Button size="sm" href={meta.externalUrl} icon={<ExternalLink className="h-4 w-4" />}>
          Open in Canvas
        </Button>
      ) : null}
      <Button
        size="sm"
        variant="ghost"
        icon={<EyeOff className="h-4 w-4" />}
        onClick={() => {
          store.setImportHidden(kind, id, true);
          showToast("Hidden. It won't come back on future syncs.", () => store.setImportHidden(kind, id, false));
          onHidden?.();
        }}
      >
        Hide
      </Button>
      {edited ? (
        <Button
          size="sm"
          variant="ghost"
          icon={<RotateCcw className="h-4 w-4" />}
          onClick={async () => {
            // Forget the student's edits and the last fingerprint, so the next sync restores Canvas's values.
            setMeta(store, kind, id, { ...meta, editedFields: [], hash: undefined, dateChanged: false });
            const message = canvas.status?.connected ? await canvas.syncNow({ auto: true, force: true }) : "";
            showToast(message && !/less than a minute/i.test(message) ? "Restored the Canvas version." : "Reset. The Canvas version comes back on the next sync.");
          }}
        >
          Reset to Canvas version
        </Button>
      ) : null}
    </div>
  );
}
