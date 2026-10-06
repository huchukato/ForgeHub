import { Loader2 } from "lucide-react";

interface Props {
  remoteState: string;
  elapsedS: number;
}

export default function JobCard({ remoteState, elapsedS }: Props) {
  const inProgress = remoteState === "IN_PROGRESS";
  return (
    <div className="rounded-xl border border-border bg-panel p-4">
      <div className="flex items-center gap-2 text-[13px] font-medium">
        <Loader2 size={14} className="animate-spin text-accent" />
        {inProgress ? `Generating — ${elapsedS}s` : `Queued / cold start — ${elapsedS}s`}
      </div>
      <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-bg">
        <div
          className="h-full rounded-full bg-accent transition-[width] duration-[2000ms] ease-linear"
          style={{
            width: inProgress ? `${Math.min(95, (elapsedS / 180) * 100)}%` : "8%",
            animation: inProgress ? "none" : "fh-pulse 1.6s ease-in-out infinite",
          }}
        />
      </div>
      <div className="mt-2 text-[11px] text-muted">
        {inProgress
          ? "Worker active (bar estimates ~3 min)"
          : "Waiting for worker — first boot can take minutes"}
      </div>
    </div>
  );
}
