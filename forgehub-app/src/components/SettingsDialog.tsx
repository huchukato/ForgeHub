import { MessageSquare, RefreshCw, Settings, X, Zap } from "lucide-react";
import { useEffect, useState } from "react";
import type { ForgeHubClient } from "../api";
import { Button, Label, Select, TextInput } from "./ui";

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
            <Settings size={15} className="text-accent" /> Settings
          </div>
          <button onClick={onClose} className="rounded-md p-1.5 text-muted transition-colors hover:bg-panel-hover hover:text-text"><X size={16} /></button>
        </div>

        <div className="mb-3 flex items-center gap-2 border-b border-border pb-2 text-[11px] font-bold uppercase tracking-[0.08em] text-muted">
          <span className="flex h-5 w-5 items-center justify-center rounded-md border border-accent/40 bg-accent/15 text-accent">
            <Zap size={11} />
          </span>
          RunPod Serverless
        </div>
        <Label>Endpoint ID</Label>
        <TextInput
          value={endpointId}
          onChange={(e) => setEndpointId(e.target.value.trim())}
          placeholder="2zehy6ujr6peku"
          className="mb-3 font-mono"
        />
        <Label>
          API Key {keySet && <span className="normal-case text-accent">(set — empty = keep)</span>}
        </Label>
        <TextInput
          type="password"
          value={apiKey}
          onChange={(e) => setApiKey(e.target.value.trim())}
          placeholder="rpa_…"
          className="mb-5 font-mono"
        />

        <div className="mb-3 mt-5 flex items-center gap-2 border-b border-border pb-2 text-[11px] font-bold uppercase tracking-[0.08em] text-muted">
          <span className="flex h-5 w-5 items-center justify-center rounded-md border border-accent/40 bg-accent/15 text-accent">
            <MessageSquare size={11} />
          </span>
          Prompt assist (LLM)
        </div>
        <Label>Service</Label>
        <div className="mb-3">
          <Select value={service} onChange={(e) => onService(e.target.value)}>
            {LLM_SERVICES.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
          </Select>
        </div>
        {service === "custom" && (
          <>
            <Label>OpenAI-compatible endpoint</Label>
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
          Model
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
              <option value="">— select a model —</option>
              {models.map((m) => <option key={m} value={m}>{m}</option>)}
              <option value="__custom__">Custom (type manually)</option>
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
          <div className="mb-2 text-[10px] text-muted">Salva la API key sotto per elencare i modelli.</div>
        )}
        <div className="mb-3" />
        <Label>
          API Key {llmKeySet && <span className="normal-case text-accent">(set — empty = keep)</span>}
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
              Get your API key →
            </a>
          </div>
        )}

        {error && <div className="mb-3 rounded-lg bg-danger/10 px-3 py-2 text-[12px] text-danger">{error}</div>}

        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
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
                });
                setKeySet(s.runpod_api_key_set);
                setLlmKeySet(s.chat_llm_key_set);
                setApiKey("");
                setLlmKey("");
                onSaved(s.runpod_endpoint_id);
                onClose();
              } catch (e) {
                setError(String(e));
              } finally {
                setSaving(false);
              }
            }}
          >
            {saving ? "Saving…" : "Save"}
          </Button>
        </div>
      </div>
    </div>
  );
}
