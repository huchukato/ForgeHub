import { HardDrive, MessageSquare, RefreshCw, Settings, X, Zap } from "lucide-react";
import { useEffect, useState } from "react";
import type { ForgeHubClient, ForgehubBridge, RunpodEndpoint, UpdateInfo } from "../api";
import { Button, Label, Select, TextInput } from "./ui";
import { LANGUAGES, Language, format, useLang, useT } from "../i18n";

const LLM_SERVICES = [
  { id: "openrouter", label: "OpenRouter", url: "https://openrouter.ai/api/v1" },
  { id: "openai", label: "OpenAI", url: "https://api.openai.com/v1" },
  { id: "groq", label: "Groq", url: "https://api.groq.com/openai/v1" },
  { id: "ollama", label: "Ollama (local)", url: "http://127.0.0.1:11434/v1", noKey: true },
  { id: "lmstudio", label: "LM Studio (local)", url: "http://127.0.0.1:1234/v1", noKey: true },
  { id: "custom", label: "Custom (OpenAI-compatible)", url: "" },
];

const KEY_URLS: Record<string, string> = {
  openrouter: "https://openrouter.ai/settings/keys",
  openai: "https://platform.openai.com/api-keys",
  groq: "https://console.groq.com/keys",
};

interface Props {
  client: ForgeHubClient;
  open: boolean;
  onClose: () => void;
  onSaved: (endpointId: string) => void;
}

export default function SettingsDialog({ client, open, onClose, onSaved }: Props) {
  const t = useT();
  const { lang, setLang } = useLang();
  const [endpointId, setEndpointId] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [keySet, setKeySet] = useState(false);
  const [service, setService] = useState("openrouter");
  const [llmUrl, setLlmUrl] = useState("");
  const [llmModel, setLlmModel] = useState("");
  const [llmKey, setLlmKey] = useState("");
  const [llmKeySet, setLlmKeySet] = useState(false);
  const [models, setModels] = useState<string[]>([]);
  const [modelsLoading, setModelsLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [endpoints, setEndpoints] = useState<RunpodEndpoint[]>([]);
  const [detecting, setDetecting] = useState(false);
  const [detectMsg, setDetectMsg] = useState("");
  const [s3AccessId, setS3AccessId] = useState("");
  const [s3AccessSecret, setS3AccessSecret] = useState("");
  const [s3IdSet, setS3IdSet] = useState(false);
  const [s3SecretSet, setS3SecretSet] = useState(false);
  const [s3Bucket, setS3Bucket] = useState("");
  const [s3Datacenter, setS3Datacenter] = useState("");
  const bridge = (window as { forgehub?: ForgehubBridge }).forgehub;
  const [upd, setUpd] = useState<UpdateInfo | null>(null);
  const [updChecking, setUpdChecking] = useState(false);

  const detect = async (key = apiKey) => {
    setDetecting(true);
    setDetectMsg("");
    try {
      const eps = await client.getRunpodEndpoints(key || undefined);
      setEndpoints(eps);
      if (eps.length === 0) {
        setDetectMsg(t.noEndpoints);
      } else if (eps.length === 1) {
        setEndpointId(eps[0].id);
        setDetectMsg(`Selected ${eps[0].name || eps[0].id}`);
      } else {
        setDetectMsg(`${eps.length} endpoints — pick one below`);
      }
    } catch (e) {
      setEndpoints([]);
      setDetectMsg(String(e).replace(/^Error:\s*/, "").slice(0, 160));
    } finally {
      setDetecting(false);
    }
  };

  const serviceNeedsKey = (id = service) =>
    !LLM_SERVICES.find((s) => s.id === id)?.noKey;

  const fetchModels = async (url: string, hasKey = llmKeySet) => {
    if (!url || (serviceNeedsKey() && !hasKey)) { setModels([]); return; }
    setModelsLoading(true);
    try {
      setModels(await client.getProviderModels(url));
    } catch {
      setModels([]);
    } finally {
      setModelsLoading(false);
    }
  };

  const load = async () => {
    try {
      const s = await client.getSettings();
      setEndpointId(s.runpod_endpoint_id);
      setKeySet(s.runpod_api_key_set);
      setApiKey("");
      const svc = LLM_SERVICES.find((x) => x.url === s.chat_llm_url);
      setService(svc?.id ?? (s.chat_llm_url ? "custom" : "openrouter"));
      setLlmUrl(s.chat_llm_url);
      setLlmModel(s.chat_llm_model);
      setLlmKeySet(s.chat_llm_key_set);
      setLlmKey("");
      setS3IdSet(s.runpod_s3_access_id_set);
      setS3SecretSet(s.runpod_s3_access_secret_set);
      setS3Bucket(s.runpod_s3_bucket);
      setS3Datacenter(s.runpod_s3_datacenter);
      setS3AccessId("");
      setS3AccessSecret("");
      if (s.runpod_api_key_set && !s.runpod_endpoint_id) detect("");
      if (s.chat_llm_url && (s.chat_llm_key_set || !serviceNeedsKey(svc?.id ?? "custom"))) {
        fetchModels(s.chat_llm_url, s.chat_llm_key_set || !serviceNeedsKey(svc?.id ?? "custom"));
      }
    } catch {
      /* backend without /settings */
    }
  };

  const onService = (id: string) => {
    setService(id);
    const svc = LLM_SERVICES.find((x) => x.id === id);
    if (svc?.url) {
      setLlmUrl(svc.url);
      fetchModels(svc.url, !serviceNeedsKey(id) || llmKeySet);
    } else {
      setModels([]);
    }
  };

  useEffect(() => {
    if (open) load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm" onClick={onClose}>
      <div
        className="max-h-[90vh] w-[440px] overflow-y-auto rounded-2xl border border-border-strong bg-panel p-6 shadow-[var(--shadow-pop)]"
        style={{ animation: "fh-fade-up .2s ease-out" }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-5 flex items-center justify-between">
          <div className="flex items-center gap-2 text-[14px] font-bold tracking-tight">
            <Settings size={15} className="text-accent" /> {t.settings}
          </div>
          <button onClick={onClose} className="rounded-md p-1.5 text-muted transition-colors hover:bg-panel-hover hover:text-text"><X size={16} /></button>
        </div>

        <div className="mb-5 flex items-center justify-between gap-3 rounded-lg border border-border bg-panel px-3 py-2">
          <span className="text-[11px] font-semibold uppercase tracking-[0.08em] text-muted">{t.language}</span>
          <Select
            value={lang}
            onChange={(e) => setLang(e.target.value as Language)}
            className="w-36 py-1 text-[12px]"
          >
            {LANGUAGES.map((l) => <option key={l.id} value={l.id}>{l.label}</option>)}
          </Select>
        </div>

        {bridge?.checkForUpdates && (
          <div className="mb-5 flex items-center justify-between gap-3 rounded-lg border border-border bg-panel px-3 py-2">
            <span className="text-[11px] font-semibold uppercase tracking-[0.08em] text-muted">
              ForgeHub{upd?.current ? ` v${upd.current}` : ""}
            </span>
            <span className="flex items-center gap-2 text-[11px]">
              {upd?.error && <span className="text-danger">{t.updateFailed}</span>}
              {upd?.upToDate && <span className="text-muted">{format(t.updateUpToDate, upd.current)}</span>}
              {upd && !upd.upToDate && !upd.error && (
                <button
                  onClick={() => bridge.openExternal?.(upd.downloadUrl ?? upd.releaseUrl ?? "")}
                  className="font-semibold text-accent hover:underline"
                >
                  v{upd.latest} → {t.updateDownload}
                </button>
              )}
              <button
                onClick={async () => {
                  setUpdChecking(true);
                  setUpd(null);
                  try {
                    setUpd(await bridge.checkForUpdates!());
                  } catch {
                    setUpd({ error: "failed" });
                  } finally {
                    setUpdChecking(false);
                  }
                }}
                disabled={updChecking}
                className="flex items-center gap-1 font-semibold text-accent hover:underline disabled:opacity-50"
              >
                <RefreshCw size={10} className={updChecking ? "animate-spin" : ""} />
                {t.updateCheck}
              </button>
            </span>
          </div>
        )}

        <div className="mb-3 flex items-center gap-2 border-b border-border pb-2 text-[11px] font-bold uppercase tracking-[0.08em] text-muted">
          <span className="flex h-5 w-5 items-center justify-center rounded-md border border-accent/40 bg-accent/15 text-accent">
            <Zap size={11} />
          </span>
          RunPod Serverless
        </div>
        <Label>
          {t.apiKey} {keySet && <span className="normal-case text-accent">{t.apiKeySet}</span>}
        </Label>
        <TextInput
          type="password"
          value={apiKey}
          onChange={(e) => setApiKey(e.target.value.trim())}
          placeholder="rpa_…"
          className="mb-1 font-mono"
        />
        <div className="mb-3 text-[11px]">
          <a href="https://console.runpod.io/user/settings" target="_blank" rel="noreferrer" className="text-accent hover:underline">
            {t.getApiKey}
          </a>
        </div>
        <div className="flex items-center justify-between">
          <Label>{t.endpointId}</Label>
          <button
            onClick={() => detect()}
            disabled={detecting}
            className="flex items-center gap-1 text-[11px] font-semibold text-accent hover:underline disabled:opacity-50"
          >
            <RefreshCw size={10} className={detecting ? "animate-spin" : ""} />
            {detecting ? t.detecting : t.detect}
          </button>
        </div>
        {endpoints.length > 1 && (
          <Select
            value={endpointId}
            onChange={(e) => setEndpointId(e.target.value)}
            className="mb-2 font-mono"
          >
            <option value="">{t.pickEndpoint}</option>
            {endpoints.map((ep) => (
              <option key={ep.id} value={ep.id}>
                {ep.name || ep.id}{ep.gpus ? ` · ${ep.gpus}` : ""} ({ep.id})
              </option>
            ))}
          </Select>
        )}
        <TextInput
          value={endpointId}
          onChange={(e) => setEndpointId(e.target.value.trim())}
          placeholder="2zehy6ujr6peku"
          className="mb-1 font-mono"
        />
        {detectMsg && <div className="mb-2 text-[10px] text-muted">{detectMsg}</div>}
        <div className="mb-4" />

        <div className="mb-3 mt-5 flex items-center gap-2 border-b border-border pb-2 text-[11px] font-bold uppercase tracking-[0.08em] text-muted">
          <span className="flex h-5 w-5 items-center justify-center rounded-md border border-accent/40 bg-accent/15 text-accent">
            <HardDrive size={11} />
          </span>
          {t.s3Section}
        </div>
        <div className="mb-3 text-[11px] text-muted">
          {t.s3Hint}{" "}
          <a href="https://console.runpod.io/user/settings" target="_blank" rel="noreferrer" className="text-accent hover:underline">
            {t.getApiKey}
          </a>
        </div>
        <Label>
          {t.s3AccessId} {s3IdSet && <span className="normal-case text-accent">{t.apiKeySet}</span>}
        </Label>
        <TextInput
          type="password"
          value={s3AccessId}
          onChange={(e) => setS3AccessId(e.target.value.trim())}
          placeholder="user_…"
          className="mb-3 font-mono"
        />
        <Label>
          {t.s3AccessSecret} {s3SecretSet && <span className="normal-case text-accent">{t.apiKeySet}</span>}
        </Label>
        <TextInput
          type="password"
          value={s3AccessSecret}
          onChange={(e) => setS3AccessSecret(e.target.value.trim())}
          placeholder="rps_…"
          className="mb-3 font-mono"
        />
        <Label>{t.s3Volume}</Label>
        <TextInput
          value={s3Bucket}
          onChange={(e) => setS3Bucket(e.target.value.trim())}
          placeholder="tm2zlohk8s"
          className="mb-3 font-mono"
        />
        <Label>{t.s3Datacenter}</Label>
        <TextInput
          value={s3Datacenter}
          onChange={(e) => setS3Datacenter(e.target.value.trim().toLowerCase())}
          placeholder="us-ne-1"
          className="mb-4 font-mono"
        />

        <div className="mb-3 mt-5 flex items-center gap-2 border-b border-border pb-2 text-[11px] font-bold uppercase tracking-[0.08em] text-muted">
          <span className="flex h-5 w-5 items-center justify-center rounded-md border border-accent/40 bg-accent/15 text-accent">
            <MessageSquare size={11} />
          </span>
          {t.promptAssist} (LLM)
        </div>
        <Label>{t.service}</Label>
        <div className="mb-3">
          <Select value={service} onChange={(e) => onService(e.target.value)}>
            {LLM_SERVICES.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
          </Select>
        </div>
        {service === "custom" && (
          <>
            <Label>{t.openaiCompat}</Label>
            <TextInput
              value={llmUrl}
              onChange={(e) => setLlmUrl(e.target.value.trim())}
              onBlur={() => fetchModels(llmUrl)}
              placeholder="https://your-provider.com/v1"
              className="mb-3 font-mono"
            />
          </>
        )}
        <Label>
          {t.model}
          {modelsLoading && <RefreshCw size={10} className="ml-1 inline animate-spin" />}
        </Label>
        {models.length > 0 ? (
          <>
            <Select
              value={models.includes(llmModel) ? llmModel : llmModel ? "__custom__" : ""}
              onChange={(e) => {
                const v = e.target.value;
                if (v === "__custom__") {
                  setLlmModel("");
                } else {
                  setLlmModel(v);
                }
              }}
              className="mb-1 font-mono"
            >
              <option value="">{t.selectModel}</option>
              {models.map((m) => <option key={m} value={m}>{m}</option>)}
              <option value="__custom__">{t.customModel}</option>
            </Select>
            {(llmModel === "" || !models.includes(llmModel)) && (
              <TextInput
                value={llmModel}
                onChange={(e) => setLlmModel(e.target.value)}
                placeholder="e.g. my-model:latest"
                className="mt-2 font-mono"
              />
            )}
          </>
        ) : (
          <TextInput
            value={llmModel}
            onChange={(e) => setLlmModel(e.target.value)}
            placeholder="openrouter/free"
            className="mb-1 font-mono"
          />
        )}
        {!llmKeySet && serviceNeedsKey() && (
          <div className="mb-2 text-[10px] text-muted">{t.saveKeyHint}</div>
        )}
        <div className="mb-3" />
        <Label>
          {t.apiKey} {llmKeySet && <span className="normal-case text-accent">{t.apiKeySet}</span>}
        </Label>
        <TextInput
          type="password"
          value={llmKey}
          onChange={(e) => setLlmKey(e.target.value.trim())}
          placeholder="sk-or-…"
          className="mb-1 font-mono"
        />
        {KEY_URLS[service] && (
          <div className="mb-3 text-[11px]">
            <a href={KEY_URLS[service]} target="_blank" rel="noreferrer" className="text-accent hover:underline">
              {t.getApiKey}
            </a>
          </div>
        )}

        {error && <div className="mb-3 rounded-lg bg-danger/10 px-3 py-2 text-[12px] text-danger">{error}</div>}

        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>{t.cancel}</Button>
          <Button
            disabled={saving}
            onClick={async () => {
              setSaving(true);
              setError("");
              try {
                const s = await client.saveSettings({
                  runpod_endpoint_id: endpointId || undefined,
                  runpod_api_key: apiKey || undefined,
                  chat_llm_url: llmUrl,
                  chat_llm_model: llmModel,
                  chat_llm_key: llmKey || undefined,
                  runpod_s3_access_id: s3AccessId || undefined,
                  runpod_s3_access_secret: s3AccessSecret || undefined,
                  runpod_s3_bucket: s3Bucket || undefined,
                  runpod_s3_datacenter: s3Datacenter || undefined,
                });
                setKeySet(s.runpod_api_key_set);
                setLlmKeySet(s.chat_llm_key_set);
                setS3IdSet(s.runpod_s3_access_id_set);
                setS3SecretSet(s.runpod_s3_access_secret_set);
                setApiKey("");
                setLlmKey("");
                setS3AccessId("");
                setS3AccessSecret("");
                onSaved(s.runpod_endpoint_id);
                onClose();
              } catch (e) {
                setError(String(e));
              } finally {
                setSaving(false);
              }
            }}
          >
            {saving ? t.saving : t.save}
          </Button>
        </div>
      </div>
    </div>
  );
}
