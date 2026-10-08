import { Camera, ChevronLeft, ChevronRight, Download, ImageDown, SkipForward, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { OutputFile } from "../api";
import { useT } from "../i18n";

interface Props {
  output: OutputFile | null;
  outputs: OutputFile[];
  onClose: () => void;
  onNavigate: (o: OutputFile) => void;
  canReference?: boolean;
  onUseAsInput?: (file: File) => Promise<void>;
}

function isVideo(name: string) {
  return /\.(mp4|webm|mov)$/i.test(name);
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

export default function OutputLightbox({ output, outputs, onClose, onNavigate, canReference, onUseAsInput }: Props) {
  const t = useT();
  const [capturing, setCapturing] = useState<"current" | "last" | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);

  const lbIdx = output ? outputs.findIndex((o) => keyOf(o) === keyOf(output)) : -1;

  function step(delta: number) {
    if (!output || outputs.length < 2) return;
    const idx = outputs.findIndex((o) => keyOf(o) === keyOf(output));
    if (idx === -1) return;
    onNavigate(outputs[(idx + delta + outputs.length) % outputs.length]);
  }

  useEffect(() => {
    if (!output) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      else if (e.key === "ArrowLeft") step(-1);
      else if (e.key === "ArrowRight") step(1);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [output, outputs]);

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
    if (!v || !output) return;
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
        await onUseAsInput?.(new File([blob], output.filename.replace(/\.\w+$/, suffix), { type: "image/jpeg" }));
      }
    } finally {
      setCapturing(null);
    }
  }

  if (!output) return null;

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 p-8 backdrop-blur-sm"
      onClick={onClose}
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
        {isVideo(output.filename) ? (
          <video ref={videoRef} src={output.url} controls autoPlay className="max-h-[80vh] rounded-xl ring-1 ring-border-strong shadow-[var(--shadow-pop)]" />
        ) : (
          <img src={output.url} alt={output.filename} className="max-h-[80vh] rounded-xl ring-1 ring-border-strong shadow-[var(--shadow-pop)]" />
        )}
        <div className="mx-auto mt-3 flex w-fit max-w-full flex-wrap items-center justify-center gap-2 rounded-xl border border-border bg-panel/90 px-3 py-2 text-[12px] text-muted shadow-[var(--shadow-pop)] backdrop-blur-md">
          {lbIdx >= 0 && outputs.length > 1 && (
            <span className="rounded-md border border-border bg-bg-elev px-1.5 py-0.5 text-[10px] tabular-nums text-faint">{lbIdx + 1}/{outputs.length}</span>
          )}
          <span className="max-w-64 truncate font-mono text-[11px]">{output.filename}</span>
          {canReference && isVideo(output.filename) && (
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
          {canReference && !isVideo(output.filename) && (
            <button
              onClick={() => useAsInput(null, output)}
              className="flex items-center gap-2 rounded-lg border border-accent/40 bg-accent/10 px-3 py-2 font-medium text-accent transition-colors hover:bg-accent/20 hover:shadow-[0_0_12px_rgb(124_92_255/0.2)]"
            >
              <ImageDown size={15} />
              {t.useAsRef}
            </button>
          )}
          <a
            href={output.url}
            download={output.filename}
            className="flex items-center gap-2 rounded-lg border border-border bg-bg-elev px-3 py-2 font-medium text-text transition-colors hover:border-accent/50 hover:text-accent"
          >
            <Download size={15} />
            Download
          </a>
        </div>
      </div>
    </div>,
    document.body,
  );
}
