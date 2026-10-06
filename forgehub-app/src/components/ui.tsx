import clsx from "clsx";
import * as React from "react";
import type { ReactNode } from "react";

export function Card({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className={clsx("rounded-xl border border-border bg-gradient-to-b from-panel-hover/80 to-panel p-4 shadow-[var(--shadow-panel)]", className)}>
      {children}
    </div>
  );
}

export function Label({ children }: { children: ReactNode }) {
  return (
    <label className="mb-1.5 block text-[11px] font-semibold uppercase tracking-[0.08em] text-muted">
      {children}
    </label>
  );
}

const inputBase =
  "w-full rounded-lg border border-border bg-bg-elev px-3 py-2 text-[13px] text-text outline-none transition-all duration-150 hover:border-border-strong focus:border-accent/70 focus:shadow-[var(--shadow-glow)] focus:ring-0 placeholder:text-faint";

export function TextInput(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} className={clsx(inputBase, props.className)} />;
}

export const TextArea = React.forwardRef<HTMLTextAreaElement, React.TextareaHTMLAttributes<HTMLTextAreaElement>>(
  function TextArea(props, ref) {
    return <textarea ref={ref} {...props} className={clsx(inputBase, "min-h-[90px] resize-y leading-relaxed", props.className)} />;
  }
);

export function Select(props: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select
      {...props}
      className={clsx(inputBase, "cursor-pointer appearance-none pr-8 bg-[url('data:image/svg+xml;utf8,<svg xmlns=%22http://www.w3.org/2000/svg%22 width=%2212%22 height=%2212%22 viewBox=%220 0 24 24%22 fill=%22none%22 stroke=%22%238f8fa3%22 stroke-width=%222%22><path d=%22m6 9 6 6 6-6%22/></svg>')] bg-no-repeat bg-[position:right_10px_center]")}
    />
  );
}

export function Toggle({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className={clsx(
        "relative h-5 w-9 shrink-0 rounded-full border transition-colors duration-150",
        checked ? "border-accent/60 bg-accent shadow-[0_0_10px_rgb(124_92_255/0.35)]" : "border-border-strong bg-bg",
      )}
    >
      <span
        className={clsx(
          "absolute top-0.5 h-3.5 w-3.5 rounded-full transition-all duration-150",
          checked ? "left-[19px] bg-white" : "left-0.5 bg-muted",
        )}
      />
    </button>
  );
}

export function Button({
  variant = "primary",
  className,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: "primary" | "ghost" | "danger" }) {
  return (
    <button
      {...props}
      className={clsx(
        "rounded-lg px-4 py-2 text-[13px] font-semibold transition-all duration-150 disabled:cursor-default disabled:opacity-50",
        variant === "primary" &&
          "bg-gradient-to-b from-accent-hover to-accent text-white shadow-[0_1px_0_rgb(255_255_255/0.15)_inset,0_4px_16px_rgb(124_92_255/0.30)] hover:shadow-[0_1px_0_rgb(255_255_255/0.2)_inset,0_6px_22px_rgb(124_92_255/0.45)] hover:brightness-110 active:brightness-95",
        variant === "ghost" &&
          "border border-border bg-panel text-muted hover:border-border-strong hover:bg-panel-hover hover:text-text",
        variant === "danger" &&
          "border border-danger/30 bg-danger/10 text-danger hover:bg-danger/20",
        className,
      )}
    />
  );
}

export function Badge({ children, tone = "accent" }: { children: ReactNode; tone?: "accent" | "muted" | "success" | "warning" }) {
  return (
    <span
      className={clsx(
        "inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.06em]",
        tone === "accent" && "border-accent/40 bg-accent/15 text-accent-hover",
        tone === "muted" && "border-border bg-panel-hover text-muted",
        tone === "success" && "border-success/30 bg-success/10 text-success",
        tone === "warning" && "border-warning/30 bg-warning/10 text-warning",
      )}
    >
      {children}
    </span>
  );
}
