import { Check, Download, Film, ImageDown, Images, ListChecks, Play, Trash2, X } from "lucide-react";
import { useState } from "react";
import type { OutputFile } from "../api";
import { useT } from "../i18n";
import OutputLightbox from "./OutputLightbox";

interface Props {
  outputs: OutputFile[];
  open: boolean;
  onClose: () => void;
  canReference?: boolean;
  onUseAsInput?: (file: File) => Promise<void>;
  onDelete?: (o: OutputFile) => Promise<void>;
  onChanged?: () => void;
}

function isVideo(name: string) {
  return /\.(mp4|webm|mov)$/i.test(name);
}

function fmtSize(bytes?: number) {
  if (!bytes) return "";
  return bytes >= 1 << 20 ? `${(bytes / (1 << 20)).toFixed(1)} MB` : `${(bytes / 1024).toFixed(0)} KB`;
}

function keyOf(o: OutputFile) {
  return `${o.subfolder}/${o.filename}`;
}

export default function OutputsGallery({ outputs, open, onClose, canReference, onUseAsInput, onDelete, onChanged }: Props) {
  const t = useT();
  const [lightbox, setLightbox] = useState<OutputFile | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [selecting, setSelecting] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [batchDeleting, setBatchDeleting] = useState(false);
  const [batchDownloading, setBatchDownloading] = useState(false);

  if (!open) return null;

  async function useAsInput(e: React.MouseEvent | null, o: OutputFile) {
    e?.stopPropagation();
    try {
      const blob = await (await fetch(o.url)).blob();
      await onUseAsInput?.(new File([blob], o.filename, { type: blob.type }));
    } catch {
      /* parent surfaces errors */
    }
  }

  async function remove(e: React.MouseEvent, o: OutputFile) {
    e.stopPropagation();
    if (!window.confirm(`Delete ${o.filename}?`)) return;
    setDeleting(o.filename);
    try {
      await onDelete?.(o);
      if (lightbox?.filename === o.filename) setLightbox(null);
      onChanged?.();
    } catch {
      /* ignore */
    } finally {
      setDeleting(null);
    }
  }

  function toggleSelect(o: OutputFile) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(keyOf(o))) next.delete(keyOf(o));
      else next.add(keyOf(o));
      return next;
    });
  }

  function exitSelect() {
    setSelecting(false);
    setSelected(new Set());
  }

  function toggleSelectAll() {
    setSelected((prev) =>
      prev.size === outputs.length ? new Set() : new Set(outputs.map(keyOf)),
    );
  }

  async function downloadSelected() {
    const targets = outputs.filter((o) => selected.has(keyOf(o)));
    if (!targets.length) return;
    setBatchDownloading(true);
    try {
      for (const o of targets) {
        const a = document.createElement("a");
        a.href = o.url;
        a.download = o.filename;
        document.body.appendChild(a);
        a.click();
        a.remove();
        // Browsers throttle/ignore back-to-back programmatic downloads.
        await new Promise((r) => setTimeout(r, 250));
      }
    } finally {
      setBatchDownloading(false);
    }
  }

  async function removeSelected() {
    const targets = outputs.filter((o) => selected.has(keyOf(o)));
    if (!targets.length) return;
    if (!window.confirm(`Delete ${targets.length} output${targets.length > 1 ? "s" : ""}?`)) return;
    setBatchDeleting(true);
    try {
      for (const o of targets) {
        try {
          await onDelete?.(o);
          if (lightbox?.filename === o.filename) setLightbox(null);
        } catch {
          /* keep going */
        }
      }
      onChanged?.();
      exitSelect();
    } finally {
      setBatchDeleting(false);
    }
  }

  return (
    <div className="flex w-[400px] shrink-0 flex-col border-l border-border bg-bg-elev/70 backdrop-blur-md">
      <div className="flex items-center justify-between border-b border-border px-4 py-3">
        <div className="flex items-center gap-2 text-[13px] font-semibold tracking-tight">
          <Images size={14} className="text-accent" /> {t.outputsTitle}
          <span className="rounded-md border border-border bg-panel px-1.5 text-[10px] tabular-nums text-muted">{outputs.length}</span>
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={() => (selecting ? exitSelect() : setSelecting(true))}
            title={selecting ? t.exitSelection : t.selectMultiple}
            className={`rounded-md p-1.5 transition-all duration-150 ${
              selecting ? "bg-accent/15 text-accent" : "text-muted hover:bg-panel-hover hover:text-text"
            }`}
          >
            <ListChecks size={15} />
          </button>
          <button onClick={onClose} className="rounded-md p-1.5 text-muted transition-colors hover:bg-panel-hover hover:text-text"><X size={15} /></button>
        </div>
      </div>
      <div className="flex-1 overflow-y-auto p-3">
      {outputs.length === 0 && (
        <div className="rounded-xl border border-dashed border-border-strong bg-panel/40 p-6 text-center text-[12px] text-faint">
          {t.outputsEmptyLib}
        </div>
      )}
      <div className="grid grid-cols-2 gap-2">
        {outputs.map((o, i) => {
          const isSel = selected.has(keyOf(o));
          return (
          <div
            key={`${o.filename}-${i}`}
            className={`group relative aspect-video overflow-hidden rounded-lg border bg-bg transition-all duration-150 ${
              isSel
                ? "border-accent ring-1 ring-accent shadow-[0_0_14px_rgb(124_92_255/0.25)]"
                : "border-border hover:border-border-strong hover:shadow-[var(--shadow-panel)]"
            }`}
          >
            <button
              onClick={() => (selecting ? toggleSelect(o) : setLightbox(o))}
              className="block h-full w-full"
            >
              {o.thumb ? (
                <img src={o.thumb} alt={o.filename} className="h-full w-full object-cover transition-transform duration-200 group-hover:scale-[1.03]" loading="lazy" />
              ) : isVideo(o.filename) ? (
                <div className="flex h-full w-full items-center justify-center text-muted">
                  <Film size={20} />
                </div>
              ) : (
                <img src={o.url} alt={o.filename} className="h-full w-full object-cover transition-transform duration-200 group-hover:scale-[1.03]" loading="lazy" />
              )}
              {isVideo(o.filename) && !selecting && (
                <span className="absolute inset-0 flex items-center justify-center">
                  <span className="rounded-full bg-black/60 p-2 text-text backdrop-blur-sm">
                    <Play size={14} />
                  </span>
                </span>
              )}
            </button>
            {selecting && (
              <span
                className={`absolute left-1.5 top-1.5 flex h-4 w-4 items-center justify-center rounded-full border transition-colors ${
                  isSel ? "border-accent bg-accent text-white shadow-[0_0_8px_rgb(124_92_255/0.5)]" : "border-white/60 bg-black/50"
                }`}
              >
                {isSel && <Check size={10} />}
              </span>
            )}
            {!selecting && (
            <div className="pointer-events-none absolute inset-x-0 bottom-0 flex items-center justify-between gap-1 bg-gradient-to-t from-black/85 via-black/40 to-transparent px-1.5 pb-1 pt-5 opacity-0 transition-opacity duration-150 group-hover:opacity-100">
              <span className="truncate text-[9px] text-white/80">
                {fmtSize(o.size)}
              </span>
              <span className="flex gap-1">
                {canReference && !isVideo(o.filename) && (
                  <button
                    onClick={(e) => useAsInput(e, o)}
                    className="pointer-events-auto rounded-md bg-black/60 p-1 text-white/80 backdrop-blur-sm transition-colors hover:text-accent"
                    title={t.useAsInput}
                  >
                    <ImageDown size={11} />
                  </button>
                )}
                <a
                  href={o.url}
                  download={o.filename}
                  onClick={(e) => e.stopPropagation()}
                  className="pointer-events-auto rounded-md bg-black/60 p-1 text-white/80 backdrop-blur-sm transition-colors hover:text-white"
                  title={t.download}
                >
                  <Download size={11} />
                </a>
                <button
                  onClick={(e) => remove(e, o)}
                  disabled={deleting === o.filename}
                  className="pointer-events-auto rounded-md bg-black/60 p-1 text-white/80 backdrop-blur-sm transition-colors hover:text-danger"
                  title={t.delete}
                >
                  <Trash2 size={11} />
                </button>
              </span>
            </div>
            )}
          </div>
          );
        })}
      </div>
      </div>

      {selecting && (
        <div className="flex items-center justify-between gap-2 border-t border-border bg-panel/60 px-4 py-2.5">
          <button
            onClick={toggleSelectAll}
            className="rounded-lg border border-border px-2.5 py-1 text-[11px] text-muted transition-colors hover:border-accent/50 hover:text-text"
          >
            {selected.size === outputs.length ? t.deselectAll : t.selectAll}
          </button>
          <div className="flex items-center gap-2">
            <span className="text-[11px] font-medium tabular-nums text-muted">{selected.size}</span>
            <button
              onClick={downloadSelected}
              disabled={selected.size === 0 || batchDownloading}
              className="flex items-center gap-1 rounded-lg border border-accent/40 bg-accent/15 px-2.5 py-1 text-[11px] font-semibold text-accent transition-colors hover:bg-accent/25 disabled:opacity-40"
            >
              <Download size={11} />
              {batchDownloading ? "…" : t.download}
            </button>
            <button
              onClick={exitSelect}
              className="rounded-lg border border-border px-2.5 py-1 text-[11px] text-muted transition-colors hover:border-border-strong hover:text-text"
            >
              {t.cancel}
            </button>
            <button
              onClick={removeSelected}
              disabled={selected.size === 0 || batchDeleting}
              className="flex items-center gap-1 rounded-lg border border-danger/40 bg-danger/15 px-2.5 py-1 text-[11px] font-semibold text-danger transition-colors hover:bg-danger/25 disabled:opacity-40"
            >
              <Trash2 size={11} />
              {batchDeleting ? "…" : t.delete}
            </button>
          </div>
        </div>
      )}

      <OutputLightbox
        output={lightbox}
        outputs={outputs}
        onClose={() => setLightbox(null)}
        onNavigate={setLightbox}
        canReference={canReference}
        onUseAsInput={onUseAsInput}
      />
    </div>
  );
}
