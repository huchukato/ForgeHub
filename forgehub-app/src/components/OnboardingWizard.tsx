import { Check, ChevronRight, ExternalLink, Key, Languages, HardDrive, Rocket } from "lucide-react";
import { useState } from "react";
import type { ForgeHubClient } from "../api";
import { LANGUAGES } from "../i18n";
import { useContext } from "react";
import { LangContext } from "../i18n";

interface Props {
  client: ForgeHubClient;
  onDone: () => void;
}

const WORKERS = [
  { name: "MiniMax H3", desc: "Video+audio (T2V/I2V/FL2V/R2V)", url: "https://console.runpod.io/hub/huchukato/runpod-minimax-h3" },
  { name: "LTX 2.5", desc: "Video+audio, pose loops, fast", url: "https://console.runpod.io/hub/huchukato/runpod-ltx-25" },
  { name: "Qwen Image 2.1", desc: "T2I, edit, Pony checkpoints", url: "https://console.runpod.io/hub/huchukato/runpod-qwen21" },
];

export default function OnboardingWizard({ client, onDone }: Props) {
  const { lang, setLang } = useContext(LangContext);
  const [step, setStep] = useState(0);
  const [apiKey, setApiKey] = useState("");
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");

  const saveKey = async () => {
    if (!apiKey.trim()) return setErr("API key required — oppure salta questo step");
    setSaving(true);
    setErr("");
    try {
      await client.saveSettings({ runpod_api_key: apiKey.trim() });
      setStep(2);
    } catch (e) {
      setErr(String(e));
    } finally {
      setSaving(false);
    }
  };

  const steps = [
    { icon: Languages, title: "Language" },
    { icon: Key, title: "RunPod API key" },
    { icon: HardDrive, title: "Network volume" },
    { icon: Rocket, title: "Serverless workers" },
    { icon: HardDrive, title: "Attach volume" },
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm">
      <div className="w-full max-w-2xl rounded-2xl border border-border bg-panel p-6 shadow-[var(--shadow-pop)]">
        <div className="mb-4 flex items-center gap-2">
          {steps.map((_, i) => (
            <div key={i} className="flex items-center gap-2">
              <span className={`flex h-6 w-6 items-center justify-center rounded-full text-[10px] font-bold ${
                i < step ? "bg-accent/20 text-accent" : i === step ? "bg-accent text-white" : "bg-bg-elev text-faint"
              }`}>{i < step ? <Check size={12} /> : i + 1}</span>
              {i < steps.length - 1 && <span className="h-px w-4 bg-border" />}
            </div>
          ))}
        </div>

        <h2 className="mb-1 text-[15px] font-semibold">Welcome to ForgeHub</h2>
        <p className="mb-4 text-[13px] text-muted">{steps[step].title} — step {step + 1}/{steps.length}</p>

        {step === 1 && (
          <div className="space-y-3">
            <input
              type="password"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              placeholder="rpa_xxxxxxxxxxxxxxxx"
              className="w-full rounded-lg border border-border bg-bg-elev px-3 py-2 font-mono text-[12px] outline-none focus:border-accent/70"
            />
            <a href="https://console.runpod.io/user/settings" target="_blank" rel="noreferrer"
              className="flex items-center gap-1 text-[11px] text-accent hover:underline">
              <ExternalLink size={11} /> Create your key on console.runpod.io
            </a>
            {err && <p className="text-[11px] text-danger">{err}</p>}
            <div className="flex justify-between pt-2">
              <button onClick={() => setStep(2)} className="text-[11px] text-muted hover:text-text">Skip</button>
              <button onClick={saveKey} disabled={saving}
                className="rounded-lg bg-accent px-4 py-2 text-[13px] font-semibold text-white hover:brightness-110 disabled:opacity-50">
                {saving ? "…" : "Next"}
              </button>
            </div>
          </div>
        )}

        {step === 0 && (
          <div className="space-y-3">
            <div className="grid grid-cols-3 gap-2">
              {LANGUAGES.map((l) => (
                <button key={l.id} onClick={() => setLang(l.id)}
                  className={`rounded-lg border px-3 py-2.5 text-[12px] transition-colors ${
                    lang === l.id ? "border-accent bg-accent/10 text-accent" : "border-border text-muted hover:border-border-strong"
                  }`}>
                  {l.label}
                </button>
              ))}
            </div>
            <div className="flex justify-end pt-2">
              <button onClick={() => setStep(1)} className="rounded-lg bg-accent px-4 py-2 text-[13px] font-semibold text-white hover:brightness-110">Next</button>
            </div>
          </div>
        )}

        {step === 2 && (
          <div className="space-y-3">
            <p className="text-[13px] text-muted leading-relaxed">
              Workflows download models to your network volume on first boot. Create one (≥100&nbsp;GB) in the datacenter where you will deploy the endpoints.
            </p>
            <a href="https://console.runpod.io/user/storage/create" target="_blank" rel="noreferrer"
              className="flex items-center gap-1.5 rounded-lg border border-accent/40 bg-accent/10 px-3 py-2.5 text-[12px] text-accent hover:bg-accent/20">
              <HardDrive size={14} /> console.runpod.io → Create network volume
            </a>
            <div className="flex justify-end pt-2">
              <button onClick={() => setStep(3)} className="rounded-lg bg-accent px-4 py-2 text-[13px] font-semibold text-white hover:brightness-110">Next</button>
            </div>
          </div>
        )}

        {step === 4 && (
          <div className="space-y-3">
            <p className="text-[13px] text-muted leading-relaxed">
              One last step — each deployed endpoint needs the volume attached:
            </p>
            <ol className="list-decimal space-y-1.5 pl-4 text-[13px] text-muted leading-relaxed">
              <li>Open the endpoint page → <b className="text-text">Manage → Edit endpoint</b></li>
              <li>Expand <b className="text-text">Advanced → Network volumes</b></li>
              <li>Select your volume (mounted to <code className="text-[10px]">/runpod-volume</code>) and save</li>
            </ol>
            <div className="space-y-2">
              <img src="/wizard/storage-1.png" alt="Manage → Edit endpoint" className="rounded-lg border border-border" />
              <img src="/wizard/storage-2.png" alt="Advanced → Network volumes" className="rounded-lg border border-border" />
            </div>
            <button onClick={onDone}
              className="mt-2 w-full rounded-lg bg-accent px-4 py-2.5 text-[13px] font-semibold text-white hover:brightness-110">
              Done — start creating
            </button>
          </div>
        )}

        {step === 3 && (
          <div className="space-y-2.5">
            <p className="text-[13px] text-muted leading-relaxed">
              Deploy the workers you need from the RunPod Hub — then set the endpoint in Settings (or just use the Public Endpoints, no deploy needed).
            </p>
            {WORKERS.map((w) => (
              <a key={w.name} href={w.url} target="_blank" rel="noreferrer"
                className="flex items-center justify-between rounded-lg border border-border bg-bg-elev/50 px-3 py-2.5 transition-colors hover:border-accent/50">
                <span>
                  <span className="block text-[13px] font-medium">{w.name}</span>
                  <span className="block text-[11px] text-muted">{w.desc}</span>
                </span>
                <ChevronRight size={14} className="text-accent" />
              </a>
            ))}
            <div className="flex justify-end pt-2">
              <button onClick={() => setStep(4)} className="rounded-lg bg-accent px-4 py-2 text-[13px] font-semibold text-white hover:brightness-110">Next</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
