import { Camera, Check, ChevronLeft, ChevronRight, Download, Film, ImageDown, Images, ListChecks, Play, SkipForward, Trash2, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { OutputFile } from "../api";
import { useT } from "../i18n";

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

// Seek and resolve only once OUR seek has actually landed on the target time —
// a pending earlier seek (e.g. autoPlay initial seek) can also fire "seeked".
function seekVideo(v: HTMLVideoElement, target: number): Promise<void> {
  return new Promise((resolve) => {
    let settled = false;
    const finish = () => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      v.removeEventListener("seeked", onSeeked);
      resolve();
    };
    const onSeeked = () => {
      if (!v.seeking && Math.abs(v.currentTime - target) < 0.25) finish();
    };
    const timer = setTimeout(finish, 8000);
    v.addEventListener("seeked", onSeeked);
    v.currentTime = target;
    if (!v.seeking && Math.abs(v.currentTime - target) < 0.25) finish();
  });
}

// Wait for the seeked frame to be presented — bounded: on a paused video
// requestVideoFrameCallback may never fire, so cap at 250ms.
function nextPresentedFrame(v: HTMLVideoElement): Promise<void> {
  const rvfc = (v as HTMLVideoElement & { requestVideoFrameCallback?: (cb: () => void) => void })
    .requestVideoFrameCallback;
  const wait = rvfc
    ? new Promise<void>((r) => rvfc.call(v, () => r()))
    : new Promise<void>((r) => setTimeout(r, 120));
  return Promise.race([wait, new Promise<void>((r) => setTimeout(r, 250))]).then(() => {});
}

export default function OutputsGallery({ outputs, open, onClose, canReference, onUseAsInput, onDelete, onChanged }: Props) {
  const t = useT();
  const [lightbox, setLightbox] = useState<OutputFile | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [capturing, setCapturing] = useState<"current" | "last" | null>(null);
  const [selecting, setSelecting] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [batchDeleting, setBatchDeleting] = useState(false);
  const [batchDownloading, setBatchDownloading] = useState(false);
  const videoRef = useRef<HTMLVideoElement | null>(null);

  useEffect(() => {
    if (!lightbox) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setLightbox(null);
      else if (e.key === "ArrowLeft") step(-1);
      else if (e.key === "ArrowRight") step(1);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [lightbox, outputs]);

  if (!open) return null;

  const lbIdx = lightbox ? outputs.findIndex((o) => keyOf(o) === keyOf(lightbox)) : -1;

  function step(delta: number) {
    if (!lightbox || outputs.length < 2) return;
    const idx = outputs.findIndex((o) => keyOf(o) === keyOf(lightbox));
    if (idx === -1) return;
    setLightbox(outputs[(idx + delta + outputs.length) % outputs.length]);
  }

  async function useAsInput(e: React.MouseEvent | null, o: OutputFile) {
    e?.stopPropagation();
    try {
      const blob = await (await fetch(o.url)).blob();
      await onUseAsInput?.(new File([blob], o.filename, { type: blob.type }));
    } catch {
      /* parent surfaces errors */
    }
  }

  async function captureFrame(position: "current" | "last") {
    const v = videoRef.current;
    if (!v || !lightbox) return;
    setCapturing(position);
    try {
      if (position === "last") {
        if (!Number.isFinite(v.duration) || v.duration <= 0) return;
        const lastTime = Math.max(0, v.duration - 1 / 30);
        // A seek on a paused video may never settle in this engine — keep
        // playback running until the target lands, then freeze and capture.
        await v.play().catch(() => {});
        await seekVideo(v, lastTime);
        v.pause();
        await nextPresentedFrame(v);
      } else {
        v.pause();
      }
      const canvas = document.createElement("canvas");
      canvas.width = v.videoWidth;
      canvas.height = v.videoHeight;
      canvas.getContext("2d")?.drawImage(v, 0, 0);
      const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.92));
      if (blob) {
        const suffix = position === "last" ? "_last-frame.jpg" : "_frame.jpg";
        await onUseAsInput?.(new File([blob], lightbox.filename.replace(/\.\w+$/, suffix), { type: "image/jpeg" }));
      }
    } finally {
      setCapturing(null);
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

      {lightbox && createPortal(
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 p-8 backdrop-blur-sm"
          onClick={() => setLightbox(null)}
          style={{ animation: "fh-fade-up .18s ease-out" }}
        >
          <button className="absolute right-5 top-5 rounded-full border border-border bg-panel/80 p-2 text-muted backdrop-blur-md transition-colors hover:border-border-strong hover:text-text">
            <X size={18} />
          </button>
          {outputs.length > 1 && (
            <>
              <button
                onClick={(e) => { e.stopPropagation(); step(-1); }}
                className="absolute left-4 top-1/2 -translate-y-1/2 rounded-full border border-border bg-panel/80 p-2 text-muted backdrop-blur-md transition-all hover:border-accent/50 hover:text-text"
                title={t.previous}
              >
                <ChevronLeft size={20} />
              </button>
              <button
                onClick={(e) => { e.stopPropagation(); step(1); }}
                className="absolute right-4 top-1/2 -translate-y-1/2 rounded-full border border-border bg-panel/80 p-2 text-muted backdrop-blur-md transition-all hover:border-accent/50 hover:text-text"
                title={t.next}
              >
                <ChevronRight size={20} />
              </button>
            </>
          )}
          <div onClick={(e) => e.stopPropagation()} className="max-h-full max-w-4xl">
            {isVideo(lightbox.filename) ? (
              <video ref={videoRef} src={lightbox.url} controls autoPlay className="max-h-[80vh] rounded-xl ring-1 ring-border-strong shadow-[var(--shadow-pop)]" />
            ) : (
              <img src={lightbox.url} alt={lightbox.filename} className="max-h-[80vh] rounded-xl ring-1 ring-border-strong shadow-[var(--shadow-pop)]" />
            )}
            <div className="mx-auto mt-3 flex w-fit max-w-full flex-wrap items-center justify-center gap-2 rounded-xl border border-border bg-panel/90 px-3 py-2 text-[12px] text-muted shadow-[var(--shadow-pop)] backdrop-blur-md">
              {lbIdx >= 0 && outputs.length > 1 && (
                <span className="rounded-md border border-border bg-bg-elev px-1.5 py-0.5 text-[10px] tabular-nums text-faint">{lbIdx + 1}/{outputs.length}</span>
              )}
              <span className="max-w-64 truncate font-mono text-[11px]">{lightbox.filename}</span>
              {canReference && isVideo(lightbox.filename) && (
                <>
                  <button
                    onClick={() => captureFrame("current")}
                    disabled={capturing !== null}
                    className="flex items-center gap-2 rounded-lg border border-accent/40 bg-accent/10 px-3 py-2 font-medium text-accent transition-colors hover:bg-accent/20 hover:shadow-[0_0_12px_rgb(124_92_255/0.2)] disabled:opacity-50"
                  >
                    <Camera size={15} />
                    {capturing === "current" ? t.capturing : t.setCurrentFrame}
                  </button>
                  <button
                    onClick={() => captureFrame("last")}
                    disabled={capturing !== null}
                    className="flex items-center gap-2 rounded-lg border border-accent/40 bg-accent/10 px-3 py-2 font-medium text-accent transition-colors hover:bg-accent/20 hover:shadow-[0_0_12px_rgb(124_92_255/0.2)] disabled:opacity-50"
                  >
                    <SkipForward size={15} />
                    {capturing === "last" ? t.capturing : t.setLastFrame}
                  </button>
                </>
              )}
              {canReference && !isVideo(lightbox.filename) && (
                <button
                  onClick={() => useAsInput(null, lightbox)}
                  className="flex items-center gap-2 rounded-lg border border-accent/40 bg-accent/10 px-3 py-2 font-medium text-accent transition-colors hover:bg-accent/20 hover:shadow-[0_0_12px_rgb(124_92_255/0.2)]"
                >
                  <ImageDown size={15} />
                  {t.useAsRef}
                </button>
              )}
              <a
                href={lightbox.url}
                download={lightbox.filename}
                className="flex items-center gap-2 rounded-lg border border-border bg-bg-elev px-3 py-2 font-medium text-text transition-colors hover:border-accent/50 hover:text-accent"
              >
                <Download size={15} />
                Download
              </a>
            </div>
          </div>
        </div>,
        document.body,
      )}
    </div>
  );
}
