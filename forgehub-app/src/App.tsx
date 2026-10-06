import { ChevronRight, Images, MessageSquare, Play, Settings, Square } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { ForgeHubClient, OutputFile, Workflow } from "./api";
import ChatDrawer from "./components/ChatDrawer";
import OutputsGallery from "./components/OutputsGallery";
import RecipeForm from "./components/RecipeForm";
import SettingsDialog from "./components/SettingsDialog";
import Sidebar from "./components/Sidebar";

export default function App() {
  const [backendUrl] = useState(
    () =>
      // Inside Electron the bundled backend is authoritative — a stale
      // localStorage override (e.g. an old remote URL) must not win.
      (window as { forgehub?: { backendUrl?: string } }).forgehub?.backendUrl ??
      localStorage.getItem("forgehub.backend") ??
      ""
  );
  const client = useMemo(() => new ForgeHubClient(backendUrl), [backendUrl]);

  const [workflows, setWorkflows] = useState<Workflow[]>([]);
  const [selectedId, setSelectedId] = useState("");
  const [endpointId, setEndpointId] = useState("");
  const [error, setError] = useState("");

  const [values, setValues] = useState<Record<string, unknown>>({});
  const [imageSlots, setImageSlots] = useState<Record<string, string[]>>({});

  const [jobs, setJobs] = useState<Record<string, { state: string; elapsedS: number }>>({});
  const pollers = useRef<Record<string, number>>({});

  const [outputs, setOutputs] = useState<OutputFile[]>([]);
  const [jobTexts, setJobTexts] = useState<Record<string, string>>({});
  const [lastOutputs, setLastOutputs] = useState<OutputFile[]>([]);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [chatOpen, setChatOpen] = useState(false);
  const [galleryOpen, setGalleryOpen] = useState(false);

  const workflow = workflows.find((w) => w.id === selectedId) || null;

  // Bootstrap: workflows + settings + output history
  useEffect(() => {
    (async () => {
      try {
        const list = await client.listWorkflows();
        setWorkflows(list);
        setSelectedId((prev) => prev || list[0]?.id || "");
      } catch (e) {
        setError(`Backend non raggiungibile: ${e}`);
      }
      client.getSettings().then((s) => setEndpointId(s.runpod_endpoint_id)).catch(() => {});
      // Backend may still be starting up (electron cold start): retry listOutputs briefly.
      (async () => {
        for (let i = 0; i < 6; i++) {
          try {
            const outs = await client.listOutputs();
            setOutputs(outs);
            return;
          } catch {
            await new Promise((r) => window.setTimeout(r, 1000));
          }
        }
      })();
    })();
    return () => {
      Object.values(pollers.current).forEach(window.clearInterval);
    };
  }, [client]);

  // On workflow switch: reset form to declared defaults.
  useEffect(() => {
    const defaults: Record<string, unknown> = {};
    for (const p of workflow?.parameters || []) {
      if (p.default !== undefined && p.default !== null) defaults[p.key] = p.default;
    }
    setValues(defaults);
    setImageSlots({});
    setError("");
  }, [selectedId]);

  const setValue = (key: string, value: unknown) =>
    setValues((prev) => ({ ...prev, [key]: value }));

  const imageParam = (workflow?.parameters || []).find((p) => p.type === "images");

  const useAsInput = async (file: File) => {
    if (!imageParam) return;
    try {
      const res = await client.uploadImage(file);
      const max = imageParam.max ?? 1;
      setImageSlots((prev) => ({
        ...prev,
        [imageParam.key]: [...(prev[imageParam.key] ?? []), res.filename].slice(-max),
      }));
    } catch (e) {
      setError(String(e));
    }
  };

  const startPolling = (jobId: string) => {
    setJobs((prev) => ({ ...prev, [jobId]: { state: "IN_QUEUE", elapsedS: 0 } }));
    pollers.current[jobId] = window.setInterval(async () => {
      try {
        const st = await client.getExecutionStatus(jobId);
        if (st.status === "running") {
          setJobs((prev) => ({
            ...prev,
            [jobId]: { state: st.remote_status ?? "RUNNING", elapsedS: Math.round((st.elapsed_ms ?? 0) / 1000) },
          }));
          return;
        }
        window.clearInterval(pollers.current[jobId]);
        setJobs((prev) => { const { [jobId]: _, ...rest } = prev; return rest; });
        if (st.status === "success") {
          setOutputs((prev) => [...st.outputs, ...prev]);
          setLastOutputs(st.outputs);
          if (st.texts && Object.keys(st.texts).length) setJobTexts(st.texts);
        } else if (st.status !== "cancelled") {
          setError(st.error || "Esecuzione fallita");
        }
      } catch (e) {
        window.clearInterval(pollers.current[jobId]);
        setJobs((prev) => { const { [jobId]: _, ...rest } = prev; return rest; });
        setError(String(e));
      }
    }, 4000);
  };

  const PRESETS_NEEDING_IMG2 = new Set([
  "faceswap", "headswap", "eyeswap", "hairswap", "makeupswap", "outfitswap",
  "multiref", "poseswap", "expressionswap", "backgroundswap",
]);

function presetInPrompt(text: string): string | null {
  const m = text.match(/__qwen21\/([a-z0-9_]+)__/i);
  return m ? m[1].toLowerCase() : null;
}

const stopJobs = async () => {
    const ids = Object.keys(jobs);
    if (!ids.length) return;
    for (const jobId of ids) {
      window.clearInterval(pollers.current[jobId]);
      delete pollers.current[jobId];
    }
    setJobs({});
    await Promise.all(ids.map((id) => client.cancelExecution(id).catch(() => {})));
  };

const execute = async () => {
    if (!workflow) return;
    setError("");
    setLastOutputs([]);
    try {
      const params: Record<string, unknown> = {};
      const images: string[] = [];
      let video: string | undefined;
      for (const p of workflow.parameters || []) {
        const v = values[p.key];
        if (p.type === "images") {
          images.push(...(imageSlots[p.key] ?? []));
        } else if (p.type === "video") {
          video = String(v ?? "") || undefined;
        } else if (v !== undefined) {
          params[p.key] = v;
        }
      }
      const preset = presetInPrompt(String(params.prompt ?? ""));
      if (preset && PRESETS_NEEDING_IMG2.has(preset) && images.length < 2) {
        throw new Error(`Il preset "${preset}" richiede 2 immagini (carica anche image2).`);
      }
      const res = await client.executeWorkflow(workflow.id, params, images, video);
      startPolling(res.prompt_id);
    } catch (e) {
      setError(String(e));
    }
  };

  return (
    <div className="flex h-full text-text">
      <Sidebar
        workflows={workflows}
        selectedId={selectedId}
        onSelect={setSelectedId}
        endpointId={endpointId}
      />

      <div className="flex min-w-0 flex-1 flex-col">
        {/* Header */}
        <header className="flex items-center justify-between border-b border-border bg-panel/70 px-6 py-3.5 backdrop-blur-md">
          <div className="min-w-0">
            <div className="truncate text-[15px] font-bold tracking-tight">
              {workflow ? workflow.name : "Select a workflow"}
            </div>
            {workflow?.description && (
              <div className="mt-0.5 truncate text-[12px] text-muted">{workflow.description}</div>
            )}
          </div>
          <div className="flex items-center gap-2">
            {([
              { icon: <Images size={15} />, title: "Outputs", active: galleryOpen, onClick: () => setGalleryOpen((o) => !o), badge: outputs.length },
              { icon: <MessageSquare size={15} />, title: "Prompt assist", active: chatOpen, onClick: () => setChatOpen((o) => !o) },
              { icon: <Settings size={15} />, title: "Settings", active: settingsOpen, onClick: () => setSettingsOpen(true) },
            ]).map((b) => (
              <button
                key={b.title}
                onClick={b.onClick}
                title={b.title}
                className={`relative rounded-lg border p-2 transition-all duration-150 ${
                  b.active
                    ? "border-accent/60 bg-accent/10 text-accent shadow-[0_0_14px_rgb(124_92_255/0.18)]"
                    : "border-border bg-panel text-muted hover:border-border-strong hover:bg-panel-hover hover:text-text"
                }`}
              >
                {b.icon}
                {!!b.badge && (
                  <span className="absolute -right-1.5 -top-1.5 rounded-full bg-accent px-1 text-[9px] font-bold text-white shadow-[0_0_8px_rgb(124_92_255/0.5)]">
                    {b.badge}
                  </span>
                )}
              </button>
            ))}
            <button
              onClick={execute}
              disabled={!workflow}
              className="ml-1 flex items-center gap-2 rounded-lg bg-gradient-to-b from-accent-hover to-accent px-5 py-2 text-[13px] font-bold text-white shadow-[0_1px_0_rgb(255_255_255/0.18)_inset,0_4px_18px_rgb(124_92_255/0.35)] transition-all duration-150 hover:shadow-[0_1px_0_rgb(255_255_255/0.25)_inset,0_6px_26px_rgb(124_92_255/0.5)] hover:brightness-110 active:scale-[0.98] disabled:cursor-default disabled:opacity-50 disabled:shadow-none"
            >
              <Play size={14} />
              Execute
            </button>
          </div>
        </header>

        {/* Active jobs — pinned under header, visible on any workflow */}
        {Object.keys(jobs).length > 0 && (
          <div className="border-b border-border bg-panel/70 px-6 py-2 backdrop-blur-md">
            <div className="flex items-center justify-between text-[11px] text-muted">
              <span className="flex items-center gap-2">
                <span className="h-1.5 w-1.5 rounded-full bg-accent" style={{ animation: "fh-pulse 1.6s ease-in-out infinite" }} />
                {Object.keys(jobs).length} job{Object.keys(jobs).length > 1 ? "s" : ""} —{" "}
                {Object.values(jobs).some((j) => j.state === "IN_PROGRESS") ? "generating" : "queued / cold start"}
              </span>
              <span className="flex items-center gap-2">
                <span className="tabular-nums">{Math.max(...Object.values(jobs).map((j) => j.elapsedS))}s</span>
                <button
                  onClick={stopJobs}
                  title="Cancel running generation"
                  className="flex items-center gap-1 rounded-md border border-danger/40 bg-danger/10 px-2 py-1 text-[10px] font-semibold text-danger transition-colors hover:bg-danger/20"
                >
                  <Square size={9} />
                  Stop
                </button>
              </span>
            </div>
            <div className="mt-1.5 h-1 overflow-hidden rounded-full bg-bg">
              <div className="relative h-full w-full">
                <div
                  className="absolute h-full w-1/3 rounded-full bg-gradient-to-r from-accent to-magenta"
                  style={{ animation: "fh-shimmer 1.8s ease-in-out infinite" }}
                />
              </div>
            </div>
          </div>
        )}

        {/* Main */}
        <main className="flex-1 overflow-y-auto p-6">
          <div className="mx-auto max-w-3xl space-y-5">
            {error && (
              <div className="rounded-xl border border-danger/40 bg-danger/10 px-4 py-3 text-[13px] text-danger shadow-[var(--shadow-panel)]" style={{ animation: "fh-fade-up .25s ease-out" }}>
                {error}
              </div>
            )}
            {lastOutputs.length > 0 && (
              <div className="rounded-xl border border-border bg-panel p-4 shadow-[var(--shadow-panel)]">
                <div className="mb-3 flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.08em] text-muted">
                  <span className="h-1 w-1 rounded-full bg-success" />
                  Output
                </div>
                <div className="space-y-3">
                  {lastOutputs.map((o) => (
                    /\.(mp4|webm|mov)$/i.test(o.filename) ? (
                      <video key={o.filename} src={o.url} controls className="w-full rounded-lg border border-border" />
                    ) : /\.(wav|mp3|flac|ogg)$/i.test(o.filename) ? (
                      <audio key={o.filename} src={o.url} controls className="w-full" />
                    ) : (
                      <img key={o.filename} src={o.url} alt={o.filename} className="w-full rounded-lg border border-border" />
                    )
                  ))}
                </div>
              </div>
            )}
            {Object.keys(jobTexts).length > 0 && (
              <div className="rounded-xl border border-border bg-panel p-4 shadow-[var(--shadow-panel)]">
                <div className="mb-3 text-[11px] font-semibold uppercase tracking-[0.08em] text-muted">
                  Prompt trace
                </div>
                <div className="space-y-2">
                  {Object.entries(jobTexts).map(([label, text]) => (
                    <details key={label} className="group rounded-lg border border-border bg-bg-elev transition-colors open:border-border-strong">
                      <summary className="flex cursor-pointer select-none items-center gap-2 px-3 py-2 text-[12px] font-medium text-muted transition-colors hover:text-text">
                        <ChevronRight size={12} className="transition-transform group-open:rotate-90" />
                        {label}
                      </summary>
                      <pre className="max-h-48 overflow-y-auto whitespace-pre-wrap break-words border-t border-border px-3 py-2 font-mono text-[11px] leading-relaxed text-text/80">
                        {text}
                      </pre>
                    </details>
                  ))}
                </div>
              </div>
            )}
            {workflow && (
              <RecipeForm
                client={client}
                parameters={workflow.parameters || []}
                values={values}
                setValue={setValue}
                imageSlots={imageSlots}
                setImageSlots={setImageSlots}
                onError={setError}
              />
            )}
            {!workflow && !error && (
              <div className="py-20 text-center text-[13px] text-muted">Loading workflows…</div>
            )}
          </div>
        </main>
      </div>

      <OutputsGallery
        outputs={outputs}
        open={galleryOpen}
        onClose={() => setGalleryOpen(false)}
        canReference={!!imageParam}
        onUseAsInput={useAsInput}
        onDelete={(o) => client.deleteOutput(o)}
        onChanged={() => client.listOutputs().then(setOutputs).catch(() => {})}
      />

      <ChatDrawer
        client={client}
        workflowId={selectedId}
        open={chatOpen}
        onClose={() => setChatOpen(false)}
      />

      <SettingsDialog
        client={client}
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        onSaved={setEndpointId}
      />
    </div>
  );
}
