import { Download, Images, MessageSquare, Music, Play, Settings, Square, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { ForgeHubClient, ForgehubBridge, OutputFile, UpdateInfo, Workflow } from "./api";
import ChatDrawer from "./components/ChatDrawer";
import OutputsGallery from "./components/OutputsGallery";
import OutputLightbox from "./components/OutputLightbox";
import RecipeForm from "./components/RecipeForm";
import SettingsDialog from "./components/SettingsDialog";
import Sidebar from "./components/Sidebar";
import { LangContext, Language, format, getStoredLang, storeLang, useT } from "./i18n";

export default function App() {
  const [lang, setLangState] = useState<Language>(getStoredLang);
  const setLang = (l: Language) => {
    setLangState(l);
    storeLang(l);
  };
  const t = useT();

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

  const [jobs, setJobs] = useState<Record<string, { state: string; startedAt: number }>>({});
  const pollers = useRef<Record<string, number>>({});
  const [now, setNow] = useState(Date.now());

  const [outputs, setOutputs] = useState<OutputFile[]>([]);
  const [jobTexts, setJobTexts] = useState<Record<string, string>>({});
  const [previewKey, setPreviewKey] = useState<string | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [chatOpen, setChatOpen] = useState(false);
  const [galleryOpen, setGalleryOpen] = useState(false);
  const [heroLightbox, setHeroLightbox] = useState<OutputFile | null>(null);
  const [update, setUpdate] = useState<UpdateInfo | null>(null);

  const workflow = workflows.find((w) => w.id === selectedId) || null;

  const bridge = (window as { forgehub?: ForgehubBridge }).forgehub;
  useEffect(() => {
    bridge?.checkForUpdates?.()
      .then((i) => { if (!i.upToDate && !i.error) setUpdate(i); })
      .catch(() => {});
  }, []);

  // Two-note completion chime — Web Audio, no asset needed.
  const playDone = () => {
    try {
      const ctx = new AudioContext();
      [660, 990].forEach((freq, i) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = "sine";
        osc.frequency.value = freq;
        gain.gain.setValueAtTime(0.0001, ctx.currentTime + i * 0.12);
        gain.gain.exponentialRampToValueAtTime(0.12, ctx.currentTime + i * 0.12 + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + i * 0.12 + 0.35);
        osc.connect(gain).connect(ctx.destination);
        osc.start(ctx.currentTime + i * 0.12);
        osc.stop(ctx.currentTime + i * 0.12 + 0.4);
      });
    } catch {
      /* audio blocked — ignore */
    }
  };

  const fmtElapsed = (s: number) => {
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    const sec = s % 60;
    return h
      ? `${h}:${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}`
      : `${m}:${String(sec).padStart(2, "0")}`;
  };

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

  const jobsActive = Object.keys(jobs).length > 0;

  // Local wall-clock ticker — RunPod's delayTime/executionTime are unreliable
  // for UX purposes, so elapsed time is measured from submission.
  useEffect(() => {
    if (!jobsActive) return;
    setNow(Date.now());
    const t = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(t);
  }, [jobsActive]);

  const startPolling = (jobId: string) => {
    setJobs((prev) => ({ ...prev, [jobId]: { state: "IN_QUEUE", startedAt: Date.now() } }));
    pollers.current[jobId] = window.setInterval(async () => {
      try {
        const st = await client.getExecutionStatus(jobId);
        if (st.status === "running") {
          setJobs((prev) =>
            prev[jobId] ? { ...prev, [jobId]: { ...prev[jobId], state: st.remote_status ?? "RUNNING" } } : prev,
          );
          return;
        }
        window.clearInterval(pollers.current[jobId]);
        setJobs((prev) => { const { [jobId]: _, ...rest } = prev; return rest; });
        if (st.status === "success") {
          setOutputs((prev) => [...st.outputs, ...prev]);
          setPreviewKey(null); // follow the freshest output
          if (st.texts && Object.keys(st.texts).length) setJobTexts(st.texts);
          playDone();
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
    setJobTexts({});
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
    <LangContext.Provider value={{ lang, setLang }}>
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
              { icon: <Images size={15} />, title: t.outputsTitle, active: galleryOpen, onClick: () => setGalleryOpen((o) => !o), badge: outputs.length },
              { icon: <MessageSquare size={15} />, title: t.promptAssist, active: chatOpen, onClick: () => setChatOpen((o) => !o) },
              { icon: <Settings size={15} />, title: t.settings, active: settingsOpen, onClick: () => setSettingsOpen(true) },
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
              {t.execute}
            </button>
          </div>
        </header>

        {/* Update banner — appears when a newer GitHub release exists */}
        {update && (
          <div className="flex items-center justify-between border-b border-border bg-accent/10 px-6 py-2 text-[12px] backdrop-blur-md">
            <span className="flex items-center gap-2 text-accent-hover">
              <span className="h-1.5 w-1.5 rounded-full bg-accent" />
              {format(t.updateAvailable, update.latest)}
            </span>
            <span className="flex items-center gap-2">
              <button
                onClick={() => bridge?.openExternal?.(update.downloadUrl ?? update.releaseUrl ?? "")}
                className="rounded-md border border-accent/50 bg-accent/15 px-2.5 py-1 text-[10px] font-semibold text-accent-hover transition-colors hover:bg-accent/25"
              >
                {t.updateDownload}
              </button>
              <button
                onClick={() => bridge?.openExternal?.(update.releaseUrl ?? "")}
                className="rounded-md border border-border px-2.5 py-1 text-[10px] font-medium text-muted transition-colors hover:text-text"
              >
                {t.updateDetails}
              </button>
              <button onClick={() => setUpdate(null)} className="rounded p-1 text-faint transition-colors hover:text-text">
                <X size={12} />
              </button>
            </span>
          </div>
        )}

        {/* Active jobs — pinned under header, visible on any workflow */}
        {Object.keys(jobs).length > 0 && (
          <div className="border-b border-border bg-panel/70 px-6 py-2 backdrop-blur-md">
            <div className="flex items-center justify-between text-[11px] text-muted">
              <span className="flex items-center gap-2">
                <span className="h-1.5 w-1.5 rounded-full bg-accent" style={{ animation: "fh-pulse 1.6s ease-in-out infinite" }} />
                {Object.keys(jobs).length} job{Object.keys(jobs).length > 1 ? "s" : ""} —{" "}
                {Object.values(jobs).some((j) => j.state === "IN_PROGRESS") ? t.jobsGenerating : t.jobsQueued}
              </span>
              <span className="flex items-center gap-2">
                <span className="tabular-nums">
                  {fmtElapsed(Math.max(...Object.values(jobs).map((j) => Math.floor((now - j.startedAt) / 1000))))}
                </span>
                <button
                  onClick={stopJobs}
                  title={t.stop}
                  className="flex items-center gap-1 rounded-md border border-danger/40 bg-danger/10 px-2 py-1 text-[10px] font-semibold text-danger transition-colors hover:bg-danger/20"
                >
                  <Square size={9} />
                  {t.stop}
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
          <div className="mx-auto flex max-w-[1440px] items-start gap-6">
            {/* Latest output hero + recent filmstrip — fills the left gutter */}
            <aside className="sticky top-0 hidden w-[460px] shrink-0 xl:block 2xl:w-[540px]">
              <div className="rounded-xl border border-border bg-panel p-3 shadow-[var(--shadow-panel)]">
                <div className="mb-2 flex items-center justify-between px-1">
                  <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.08em] text-muted">
                    <span className="h-3 w-[3px] rounded-full bg-gradient-to-b from-accent to-magenta" />
                    {t.outputsTitle}
                  </div>
                  <button
                    onClick={() => setGalleryOpen(true)}
                    className="flex items-center gap-1 rounded-md border border-border px-2 py-1 text-[10px] font-medium text-muted transition-colors hover:border-accent/50 hover:text-text"
                  >
                    <Images size={11} />
                    {t.library}
                  </button>
                </div>
                {outputs.length === 0 ? (
                  <div className="rounded-lg border border-dashed border-border py-14 text-center text-[11px] leading-relaxed text-faint whitespace-pre-line">
                    {t.outputsEmpty}
                  </div>
                ) : (
                  <>
                    {(() => {
                      const hero = outputs.find((o) => `${o.subfolder}/${o.filename}` === previewKey) ?? outputs[0];
                      const heroVideo = /\.(mp4|webm|mov)$/i.test(hero.filename);
                      const heroAudio = /\.(wav|mp3|flac|ogg)$/i.test(hero.filename);
                      return (
                        <div className="overflow-hidden rounded-lg border border-border bg-bg">
                          {heroVideo ? (
                            <video src={hero.url} controls className="max-h-[68vh] w-full object-contain" />
                          ) : heroAudio ? (
                            <span className="flex h-40 w-full flex-col items-center justify-center gap-2 text-muted">
                              <Music size={22} />
                              <audio src={hero.url} controls className="w-4/5" />
                            </span>
                          ) : (
                            <button onClick={() => setHeroLightbox(hero)} title={hero.filename} className="block w-full cursor-zoom-in">
                              <img src={hero.url} alt={hero.filename} className="max-h-[68vh] w-full object-contain" />
                            </button>
                          )}
                          <div className="flex items-center gap-2 border-t border-border/60 bg-panel/60 px-2.5 py-1.5">
                            <span className="min-w-0 flex-1 truncate font-mono text-[10px] text-muted">{hero.filename}</span>
                            <a
                              href={hero.url}
                              download={hero.filename}
                              onClick={(e) => e.stopPropagation()}
                              title={t.download}
                              className="rounded p-1 text-muted transition-colors hover:text-accent"
                            >
                              <Download size={12} />
                            </a>
                          </div>
                        </div>
                      );
                    })()}
                    {outputs.length > 1 && (
                      <div className="mt-2 flex gap-1.5 overflow-x-auto pb-1">
                        {outputs.slice(0, 8).map((o) => {
                          const k = `${o.subfolder}/${o.filename}`;
                          const active = k === (previewKey ?? `${outputs[0].subfolder}/${outputs[0].filename}`);
                          const isAudio = /\.(wav|mp3|flac|ogg)$/i.test(o.filename);
                          return (
                            <button
                              key={k}
                              onClick={() => setPreviewKey(k)}
                              title={o.filename}
                              className={`relative h-14 w-14 shrink-0 overflow-hidden rounded-md border transition-all duration-150 ${
                                active
                                  ? "border-accent ring-1 ring-accent shadow-[0_0_10px_rgb(124_92_255/0.35)]"
                                  : "border-border opacity-70 hover:opacity-100 hover:border-border-strong"
                              }`}
                            >
                              {isAudio ? (
                                <span className="flex h-full w-full items-center justify-center text-muted"><Music size={14} /></span>
                              ) : (
                                <img src={o.thumb ?? o.url} alt={o.filename} loading="lazy" className="h-full w-full object-cover" />
                              )}
                            </button>
                          );
                        })}
                        {outputs.length > 8 && (
                          <button
                            onClick={() => setGalleryOpen(true)}
                            title={t.library}
                            className="flex h-14 w-14 shrink-0 items-center justify-center rounded-md border border-dashed border-border text-[10px] font-semibold text-muted transition-colors hover:border-accent/60 hover:text-accent"
                          >
                            +{outputs.length - 8}
                          </button>
                        )}
                      </div>
                    )}
                  </>
                )}
              </div>
            </aside>

            <div className="mx-auto w-full min-w-0 max-w-3xl space-y-5">
              {error && (
                <div className="rounded-xl border border-danger/40 bg-danger/10 px-4 py-3 text-[13px] text-danger shadow-[var(--shadow-panel)]" style={{ animation: "fh-fade-up .25s ease-out" }}>
                  {error}
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
                  jobTexts={jobTexts}
                />
              )}
              {!workflow && !error && (
                <div className="py-20 text-center text-[13px] text-muted">{t.loadingWorkflows}</div>
              )}
            </div>
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

      <OutputLightbox
        output={heroLightbox}
        outputs={outputs}
        onClose={() => setHeroLightbox(null)}
        onNavigate={setHeroLightbox}
        canReference={!!imageParam}
        onUseAsInput={useAsInput}
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
    </LangContext.Provider>
  );
}
