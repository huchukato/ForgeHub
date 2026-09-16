import { useEffect, useMemo, useRef, useState } from "react";
import { ChatMessage, ChatOptions, ForgeHubClient, OutputFile, Workflow } from "./api";
import { format, Language, translations, Translations } from "./i18n";

const CATEGORIES = [
  { id: "agent", label: "Agent", icon: "🤖" },
  { id: "video", label: "Video", icon: "🎬" },
  { id: "image", label: "Image", icon: "🖼️" },
  { id: "audio", label: "Audio", icon: "🎵" },
  { id: "other", label: "Other", icon: "📦" },
] as const;

// Node types to hide from the workflow inspector (not user-editable).
const SKIP_NODE_TYPES = new Set([
  "Note", "MarkdownNote", "Reroute", "PrimitiveNode",
  "Fast Groups Bypasser (rgthree)", "Reroute (rgthree)",
]);
// Widget names to hide (metadata, not real parameters).
const SKIP_WIDGETS = new Set([
  "control_after_generate", "PowerLoraLoaderHeaderWidget", "divider",
  "➕ Add Lora", "label", "button",
]);

interface WorkflowViewProps {
  rawWorkflow: Record<string, unknown>;
  overrides: Record<string, unknown>;
  setOverrides: React.Dispatch<React.SetStateAction<Record<string, unknown>>>;
  executing: boolean;
  onExecute: () => void;
}

function WorkflowView({ rawWorkflow, overrides, setOverrides, executing, onExecute }: WorkflowViewProps) {
  const nodes = (rawWorkflow as Record<string, unknown>).nodes;
  const nodeList = Array.isArray(nodes) ? nodes as Array<Record<string, unknown>> : [];

  const getWidgetValue = (nodeId: unknown, name: string, original: unknown): unknown => {
    const key = `${nodeId}:${name}`;
    return key in overrides ? overrides[key] : original;
  };

  const setWidgetValue = (nodeId: unknown, name: string, value: unknown) => {
    const key = `${nodeId}:${name}`;
    setOverrides((prev) => ({ ...prev, [key]: value }));
  };

  const renderWidget = (nodeId: unknown, name: string, value: unknown) => {
    if (SKIP_WIDGETS.has(name)) return null;
    const currentValue = getWidgetValue(nodeId, name, value);
    const inputStyle: React.CSSProperties = {
      width: "100%", background: COLORS.panel, color: COLORS.text,
      border: `1px solid ${COLORS.border}`, borderRadius: 6,
      padding: "6px 8px", fontSize: 12, boxSizing: "border-box",
    };
    const labelStyle: React.CSSProperties = {
      fontSize: 10, color: COLORS.muted, marginBottom: 3, display: "block",
    };

    // Long text (prompts, descriptions) → textarea
    if (typeof value === "string" && value.length > 60) {
      return (
        <div key={name} style={{ marginBottom: 10 }}>
          <label style={labelStyle}>{name}</label>
          <textarea
            value={String(currentValue ?? "")}
            onChange={(e) => setWidgetValue(nodeId, name, e.target.value)}
            rows={Math.min(8, Math.ceil(value.length / 60))}
            style={{ ...inputStyle, resize: "vertical", fontFamily: "monospace" }}
          />
        </div>
      );
    }
    // Boolean → checkbox
    if (typeof value === "boolean") {
      return (
        <label key={name} style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 10, fontSize: 12, color: COLORS.text, cursor: "pointer" }}>
          <input
            type="checkbox"
            checked={Boolean(currentValue)}
            onChange={(e) => setWidgetValue(nodeId, name, e.target.checked)}
            style={{ accentColor: COLORS.accent }}
          />
          {name}
        </label>
      );
    }
    // Number → number input
    if (typeof value === "number") {
      return (
        <div key={name} style={{ marginBottom: 10 }}>
          <label style={labelStyle}>{name}</label>
          <input
            type="number"
            value={Number(currentValue ?? 0)}
            step={typeof value === "number" && !Number.isInteger(value) ? 0.1 : 1}
            onChange={(e) => setWidgetValue(nodeId, name, Number(e.target.value))}
            style={inputStyle}
          />
        </div>
      );
    }
    // String (short) → text input
    return (
      <div key={name} style={{ marginBottom: 10 }}>
        <label style={labelStyle}>{name}</label>
        <input
          type="text"
          value={String(currentValue ?? "")}
          onChange={(e) => setWidgetValue(nodeId, name, e.target.value)}
          style={inputStyle}
        />
      </div>
    );
  };

  return (
    <div style={{ flex: 1, overflow: "auto", padding: "20px 32px" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
        <div style={{ fontSize: 14, fontWeight: 700, color: COLORS.text }}>
          ⚙️ Workflow Parameters
        </div>
        <button
          onClick={onExecute}
          disabled={executing}
          style={{
            background: executing ? COLORS.border : COLORS.accent,
            color: "#fff",
            border: "none",
            borderRadius: 8,
            padding: "8px 20px",
            fontSize: 13,
            fontWeight: 700,
            cursor: executing ? "default" : "pointer",
          }}
        >
          {executing ? "⏳ Running..." : "▶ Execute"}
        </button>
      </div>
      {nodeList
        .filter((n) => {
          const t = String(n.type || "");
          return !SKIP_NODE_TYPES.has(t);
        })
        .map((node) => {
          const wvn = node.widgets_values_named as Record<string, unknown> | undefined;
          if (!wvn || typeof wvn !== "object") return null;
          const entries = Object.entries(wvn).filter(([k]) => !SKIP_WIDGETS.has(k));
          if (entries.length === 0) return null;
          return (
            <div key={String(node.id)} style={{
              background: COLORS.panel, border: `1px solid ${COLORS.border}`,
              borderRadius: 10, padding: 16, marginBottom: 12,
            }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: COLORS.accent, marginBottom: 10 }}>
                {node.title ? String(node.title) : String(node.type)}
              </div>
              {entries.map(([name, value]) => renderWidget(node.id, name, value))}
            </div>
          );
        })}
    </div>
  );
}

const COLORS = {
  bg: "#0a0a0f",
  panel: "#12121a",
  panelHover: "#1a1a25",
  border: "#252532",
  text: "#e8e8ed",
  muted: "#8b8b9a",
  accent: "#7c5cff",
  accentHover: "#9178ff",
  danger: "#ff5c5c",
  success: "#3ddc84",
};

function formatThinking(thinking: string) {
  return thinking.trim();
}

export default function App() {
  const [lang, setLang] = useState<Language>((localStorage.getItem("forgehub.lang") as Language) || "en");
  const t: Translations = translations[lang];

  // Empty URL = same origin (GUI served by the backend). In `vite dev` we
  // still default to the local backend on :8484.
  const defaultBackendUrl =
    window.location.hostname === "localhost" && window.location.port === "5173"
      ? "http://localhost:8484"
      : "";
  const [backendUrl, setBackendUrl] = useState(
    localStorage.getItem("forgehub.backendUrl") ?? defaultBackendUrl
  );
  const [workflows, setWorkflows] = useState<Workflow[]>([]);
  const [activeCategory, setActiveCategory] = useState<string>("image");
  const [selectedId, setSelectedId] = useState<string>("");
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [chatOptions, setChatOptions] = useState<ChatOptions>({
    backend: "gguf",
    model: "",
    max_tokens: 1024,
    temperature: 0.2,
    thinking: false,
  });
  const [chatModels, setChatModels] = useState<{ hf: string[]; gguf: string[] }>({
    hf: [],
    gguf: [],
  });
  const [outputs, setOutputs] = useState<OutputFile[]>([]);
  const [uploads, setUploads] = useState<Array<{ filename: string; url: string }>>([]);
  const [viewMode, setViewMode] = useState<"chat" | "workflow">("chat");
  const [rawWorkflow, setRawWorkflow] = useState<Record<string, unknown> | null>(null);
  const [wfOverrides, setWfOverrides] = useState<Record<string, unknown>>({});
  const [executing, setExecuting] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const client = useMemo(() => new ForgeHubClient(backendUrl), [backendUrl]);

  useEffect(() => {
    localStorage.setItem("forgehub.lang", lang);
  }, [lang]);

  useEffect(() => {
    client
      .listWorkflows()
      .then((list) => {
        setWorkflows(list);
        if (!selectedId && list.length > 0) {
          setSelectedId(list[0].id);
          const cat = CATEGORIES.find((c) => c.id === list[0].category)?.id || "other";
          setActiveCategory(cat);
        }
      })
      .catch((e) => setError(String(e)));
  }, [client, selectedId]);

  useEffect(() => {
    localStorage.setItem("forgehub.backendUrl", backendUrl);
  }, [backendUrl]);

  useEffect(() => {
    client
      .getChatModels()
      .then(setChatModels)
      .catch(() => setChatModels({ hf: [], gguf: [] }));
  }, [client]);

  const modelsForBackend =
    chatModels[chatOptions.backend === "hf" ? "hf" : "gguf"] ?? [];

  useEffect(() => {
    if (modelsForBackend.length > 0 && !modelsForBackend.includes(chatOptions.model ?? "")) {
      setChatOptions((o) => ({ ...o, model: modelsForBackend[0] }));
    }
  }, [modelsForBackend, chatOptions.model]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading]);

  const selectedWorkflow = useMemo(
    () => workflows.find((w) => w.id === selectedId),
    [workflows, selectedId]
  );

  // Fetch raw workflow when selection changes (for the Workflow view).
  useEffect(() => {
    if (!selectedId) { setRawWorkflow(null); setWfOverrides({}); return; }
    client.getWorkflowRaw(selectedId)
      .then((data) => { setRawWorkflow(data); setWfOverrides({}); })
      .catch((e) => { setError(String(e)); setRawWorkflow(null); });
  }, [client, selectedId]);

  const groupedWorkflows = useMemo(() => {
    const groups: Record<string, Workflow[]> = {};
    for (const cat of CATEGORIES) groups[cat.id] = [];
    for (const w of workflows) {
      const cat = CATEGORIES.find((c) => c.id === w.category)?.id || "other";
      groups[cat].push(w);
    }
    return groups;
  }, [workflows]);

  async function sendMessage(text?: string) {
    const content = (text ?? input).trim();
    if (!content || loading) return;
    const userMsg: ChatMessage = { role: "user", content };
    const nextMessages = [...messages, userMsg].slice(-20);
    setMessages(nextMessages);
    setInput("");
    setLoading(true);
    setError(null);

    try {
      const result = await client.chat(
        nextMessages,
        chatOptions,
        selectedId || undefined,
        uploads.map((u) => u.filename)
      );
      setMessages([
        ...nextMessages,
        {
          role: "assistant",
          content: result.message,
          thinking: result.thinking ? formatThinking(result.thinking) : undefined,
          choices: result.choices?.length ? result.choices : undefined,
        },
      ]);

      if (selectedWorkflow && result.actions?.length) {
        const queue = result.actions.some((a) => a.type === "queue_workflow");
        if (queue) {
          const exec = await client.executeActions(selectedWorkflow.id, result.actions);
          const execOutputs = exec.outputs || [];
          if (execOutputs.length) {
            setOutputs((prev) => [...prev, ...execOutputs]);
          }
        }
      }
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  }

  async function handleFile(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    try {
      const result = await client.uploadImage(file);
      setUploads((prev) => [...prev, result]);
    } catch (e) {
      setError(String(e));
    } finally {
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  function removeUpload(index: number) {
    setUploads((prev) => prev.filter((_, i) => i !== index));
  }

  return (
    <div
      style={{
        display: "flex",
        height: "100vh",
        fontFamily:
          '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif',
        background: COLORS.bg,
        color: COLORS.text,
        overflow: "hidden",
      }}
    >
      {/* Sidebar */}
      <aside
        style={{
          width: 340,
          display: "flex",
          flexDirection: "column",
          borderRight: `1px solid ${COLORS.border}`,
          background: COLORS.panel,
        }}
      >
        {/* Header */}
        <div style={{ padding: "20px 18px", borderBottom: `1px solid ${COLORS.border}` }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 18 }}>
            <img
              src="./logo.png"
              alt={t.appName}
              style={{ width: 34, height: 34, borderRadius: 10, objectFit: "cover" }}
            />
            <div>
              <h1 style={{ margin: 0, fontSize: 18, fontWeight: 700, letterSpacing: -0.3 }}>{t.appName}</h1>
              <div style={{ fontSize: 11, color: COLORS.muted, marginTop: 2 }}>{t.tagline}</div>
            </div>
          </div>

          <div>
            <label
              style={{
                fontSize: 10,
                color: COLORS.muted,
                textTransform: "uppercase",
                letterSpacing: 0.5,
              }}
            >
              {t.backendUrl}
            </label>
            <input
              type="text"
              value={backendUrl}
              placeholder={t.backendUrlHint}
              onChange={(e) => setBackendUrl(e.target.value)}
              style={{
                width: "100%",
                marginTop: 6,
                background: COLORS.bg,
                color: COLORS.text,
                border: `1px solid ${COLORS.border}`,
                borderRadius: 8,
                padding: "8px 10px",
                fontSize: 12,
                outline: "none",
                boxSizing: "border-box",
              }}
            />
          </div>
        </div>

        {/* Category tabs */}
        <div
          style={{
            display: "flex",
            gap: 6,
            padding: "12px 16px 0",
            borderBottom: `1px solid ${COLORS.border}`,
          }}
        >
          {CATEGORIES.map((cat) => {
            const count = groupedWorkflows[cat.id]?.length || 0;
            const active = activeCategory === cat.id;
            const label = t.categories[cat.id as keyof Translations["categories"]];
            return (
              <button
                key={cat.id}
                onClick={() => setActiveCategory(cat.id)}
                style={{
                  background: active ? `${COLORS.accent}22` : "transparent",
                  color: active ? COLORS.accent : COLORS.muted,
                  border: "none",
                  borderBottom: active ? `2px solid ${COLORS.accent}` : "2px solid transparent",
                  padding: "8px 0",
                  fontSize: 12,
                  fontWeight: 600,
                  cursor: "pointer",
                  display: "flex",
                  alignItems: "center",
                  gap: 4,
                  flex: 1,
                  justifyContent: "center",
                }}
              >
                <span>{cat.icon}</span>
                <span>{label}</span>
                {count > 0 && (
                  <span
                    style={{
                      fontSize: 10,
                      background: active ? `${COLORS.accent}33` : COLORS.border,
                      padding: "1px 5px",
                      borderRadius: 10,
                    }}
                  >
                    {count}
                  </span>
                )}
              </button>
            );
          })}
        </div>

        {/* Workflow list OR chat settings (Agent tab) */}
        <div style={{ flex: 1, overflow: "auto", padding: "12px 14px" }}>
          {activeCategory === "agent" ? (
            /* Chat model settings — shown only in the Agent tab */
            <div style={{ padding: "8px 4px" }}>
              <div
                style={{
                  fontSize: 10,
                  color: COLORS.muted,
                  textTransform: "uppercase",
                  letterSpacing: 0.5,
                  marginBottom: 10,
                }}
              >
                {t.chatModel}
              </div>
              <select
                value={chatOptions.backend}
                onChange={(e) => setChatOptions((o) => ({ ...o, backend: e.target.value }))}
                style={{
                  width: "100%",
                  marginBottom: 10,
                  background: COLORS.panel,
                  color: COLORS.text,
                  border: `1px solid ${COLORS.border}`,
                  borderRadius: 8,
                  padding: "8px 10px",
                  fontSize: 12,
                }}
              >
                <option value="gguf">{t.backendGguf}</option>
                <option value="hf">{t.backendHf}</option>
              </select>
              {modelsForBackend.length > 0 && (
                <>
                  <label style={{ fontSize: 10, color: COLORS.muted }}>{t.model}</label>
                  <select
                    value={chatOptions.model}
                    onChange={(e) => setChatOptions((o) => ({ ...o, model: e.target.value }))}
                    style={{
                      width: "100%",
                      marginTop: 4,
                      marginBottom: 10,
                      background: COLORS.panel,
                      color: COLORS.text,
                      border: `1px solid ${COLORS.border}`,
                      borderRadius: 8,
                      padding: "8px 10px",
                      fontSize: 12,
                    }}
                  >
                    {modelsForBackend.map((m) => (
                      <option key={m} value={m}>
                        {m}
                      </option>
                    ))}
                  </select>
                </>
              )}
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                <div>
                  <label style={{ fontSize: 10, color: COLORS.muted }}>{t.maxTokens}</label>
                  <input
                    type="number"
                    value={chatOptions.max_tokens}
                    onChange={(e) => setChatOptions((o) => ({ ...o, max_tokens: Number(e.target.value) }))}
                    style={{
                      width: "100%",
                      marginTop: 4,
                      background: COLORS.panel,
                      color: COLORS.text,
                      border: `1px solid ${COLORS.border}`,
                      borderRadius: 8,
                      padding: "6px 8px",
                      fontSize: 12,
                      boxSizing: "border-box",
                    }}
                  />
                </div>
                <div>
                  <label style={{ fontSize: 10, color: COLORS.muted }}>{t.temperature}</label>
                  <input
                    type="number"
                    step={0.1}
                    value={chatOptions.temperature}
                    onChange={(e) => setChatOptions((o) => ({ ...o, temperature: Number(e.target.value) }))}
                    style={{
                      width: "100%",
                      marginTop: 4,
                      background: COLORS.panel,
                      color: COLORS.text,
                      border: `1px solid ${COLORS.border}`,
                      borderRadius: 8,
                      padding: "6px 8px",
                      fontSize: 12,
                      boxSizing: "border-box",
                    }}
                  />
                </div>
              </div>
              <label
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  marginTop: 12,
                  fontSize: 12,
                  color: COLORS.text,
                  cursor: "pointer",
                }}
              >
                <input
                  type="checkbox"
                  checked={chatOptions.thinking}
                  onChange={(e) => setChatOptions((o) => ({ ...o, thinking: e.target.checked }))}
                  style={{ accentColor: COLORS.accent }}
                />
                {t.enableThinking}
              </label>
            </div>
          ) : (
            <>
              {groupedWorkflows[activeCategory]?.length === 0 && (
                <div style={{ color: COLORS.muted, fontSize: 12, textAlign: "center", marginTop: 24 }}>
                  {t.noWorkflows}
                </div>
              )}
              {groupedWorkflows[activeCategory]?.map((w) => {
                const selected = selectedId === w.id;
                return (
                  <div
                    key={w.id}
                    onClick={() => setSelectedId(w.id)}
                    style={{
                      padding: "12px 14px",
                      borderRadius: 10,
                      cursor: "pointer",
                      background: selected ? `${COLORS.accent}18` : "transparent",
                      border: `1px solid ${selected ? `${COLORS.accent}44` : "transparent"}`,
                      marginBottom: 8,
                      transition: "background 0.15s, border 0.15s",
                    }}
                    onMouseEnter={(e) => {
                      if (!selected) e.currentTarget.style.background = COLORS.panelHover;
                    }}
                    onMouseLeave={(e) => {
                      if (!selected) e.currentTarget.style.background = "transparent";
                    }}
                  >
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                      <div style={{ fontWeight: 600, fontSize: 13, color: COLORS.text }}>{w.name}</div>
                      {selected && (
                        <div
                          style={{
                            width: 18,
                            height: 18,
                            borderRadius: "50%",
                            background: COLORS.accent,
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            fontSize: 10,
                          }}
                        >
                          ✓
                        </div>
                      )}
                    </div>
                    <div style={{ fontSize: 11, color: COLORS.muted, marginTop: 4, lineHeight: 1.4 }}>
                      {w.description || w.outputs.join(", ") || "Workflow"}
                    </div>
                  </div>
                );
              })}
            </>
          )}
        </div>
      </aside>

      {/* Main */}
      <main style={{ flex: 1, display: "flex", flexDirection: "column", minWidth: 0 }}>
        {/* Top bar */}
        <header
          style={{
            padding: "16px 24px",
            borderBottom: `1px solid ${COLORS.border}`,
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            background: COLORS.panel,
          }}
        >
          <div>
            <div style={{ fontSize: 16, fontWeight: 700 }}>
              {selectedWorkflow ? selectedWorkflow.name : t.noWorkflowSelected}
            </div>
            {selectedWorkflow && (
              <div style={{ fontSize: 12, color: COLORS.muted, marginTop: 3 }}>
                {selectedWorkflow.description || selectedWorkflow.outputs.join(", ")}
              </div>
            )}
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            {selectedWorkflow && (
              <div style={{ display: "flex", background: COLORS.bg, borderRadius: 8, border: `1px solid ${COLORS.border}`, overflow: "hidden" }}>
                <button
                  onClick={() => setViewMode("chat")}
                  style={{
                    background: viewMode === "chat" ? COLORS.accent : "transparent",
                    color: viewMode === "chat" ? "#fff" : COLORS.muted,
                    border: "none",
                    padding: "6px 14px",
                    fontSize: 12,
                    fontWeight: 600,
                    cursor: "pointer",
                  }}
                >
                  💬 Chat
                </button>
                <button
                  onClick={() => setViewMode("workflow")}
                  style={{
                    background: viewMode === "workflow" ? COLORS.accent : "transparent",
                    color: viewMode === "workflow" ? "#fff" : COLORS.muted,
                    border: "none",
                    padding: "6px 14px",
                    fontSize: 12,
                    fontWeight: 600,
                    cursor: "pointer",
                  }}
                >
                  ⚙️ Workflow
                </button>
              </div>
            )}
            <button
              onClick={() => setLang((l) => (l === "en" ? "it" : "en"))}
              style={{
                background: COLORS.panel,
                color: COLORS.text,
                border: `1px solid ${COLORS.border}`,
                borderRadius: 8,
                padding: "6px 12px",
                cursor: "pointer",
                fontSize: 12,
                fontWeight: 600,
              }}
            >
              {lang === "en" ? "EN → IT" : "IT → EN"}
            </button>
            <div
              style={{
                background: COLORS.accent,
                color: "#fff",
                padding: "6px 12px",
                borderRadius: 20,
                fontSize: 11,
                fontWeight: 700,
                textTransform: "uppercase",
                letterSpacing: 0.5,
              }}
            >
              {selectedWorkflow ? selectedWorkflow.category : "—"}
            </div>
          </div>
        </header>

        {/* Chat + outputs OR Workflow view */}
        {viewMode === "workflow" && selectedWorkflow && rawWorkflow ? (
          <WorkflowView
            rawWorkflow={rawWorkflow}
            overrides={wfOverrides}
            setOverrides={setWfOverrides}
            executing={executing}
            onExecute={async () => {
              if (!selectedWorkflow) return;
              setExecuting(true);
              setError(null);
              try {
                const result = await client.executeWorkflow(selectedWorkflow.id, wfOverrides);
                const status = await client.getExecutionStatus(result.prompt_id, result.prompt_id);
                if (status.outputs.length > 0) setOutputs(status.outputs);
                if (status.error) setError(status.error);
                setViewMode("chat");
              } catch (e) {
                setError(String(e));
              } finally {
                setExecuting(false);
              }
            }}
          />
        ) : (
        <>
        <div style={{ flex: 1, overflow: "auto", padding: "24px 32px" }}>
          {messages.length === 0 && (
            <div
              style={{
                height: "100%",
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                justifyContent: "center",
                color: COLORS.muted,
              }}
            >
              <div style={{ fontSize: 40, marginBottom: 16 }}>{"\u2728"}</div>
              <div style={{ fontSize: 16, fontWeight: 600, color: COLORS.text, marginBottom: 8 }}>
                {t.welcomeTitle}
              </div>
              <div style={{ fontSize: 14, textAlign: "center", maxWidth: 400 }}>{t.welcomeBody}</div>
            </div>
          )}

          {messages.map((m, i) => (
            <div
              key={i}
              style={{
                display: "flex",
                gap: 12,
                marginBottom: 20,
                flexDirection: m.role === "user" ? "row-reverse" : "row",
              }}
            >
              <div
                style={{
                  width: 32,
                  height: 32,
                  borderRadius: "50%",
                  background: m.role === "user" ? COLORS.accent : "#2a2a3a",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: 13,
                  fontWeight: 700,
                  flexShrink: 0,
                }}
              >
                {m.role === "user" ? t.userInitial : t.assistantInitial}
              </div>
              <div style={{ maxWidth: "70%" }}>
                <div
                  style={{
                    background: m.role === "user" ? `${COLORS.accent}22` : COLORS.panel,
                    border: `1px solid ${m.role === "user" ? `${COLORS.accent}44` : COLORS.border}`,
                    borderRadius: 14,
                    borderTopRightRadius: m.role === "user" ? 4 : 14,
                    borderTopLeftRadius: m.role === "user" ? 14 : 4,
                    padding: "12px 16px",
                    fontSize: 14,
                    lineHeight: 1.5,
                    whiteSpace: "pre-wrap",
                  }}
                >
                  {m.content}
                </div>
                {m.choices && m.choices.length > 0 && (
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 8 }}>
                    {m.choices.map((c, j) => (
                      <button
                        key={j}
                        onClick={() => sendMessage(c.send)}
                        disabled={loading}
                        style={{
                          background: `${COLORS.accent}22`,
                          border: `1px solid ${COLORS.accent}66`,
                          color: COLORS.text,
                          borderRadius: 10,
                          padding: "6px 12px",
                          fontSize: 13,
                          cursor: loading ? "default" : "pointer",
                        }}
                      >
                        {c.label}
                      </button>
                    ))}
                  </div>
                )}
                {m.thinking && (
                  <details style={{ marginTop: 8 }}>
                    <summary
                      style={{
                        fontSize: 11,
                        color: COLORS.muted,
                        cursor: "pointer",
                        listStyle: "none",
                        userSelect: "none",
                      }}
                    >
                      {"\u25B6"} {t.thinking}
                    </summary>
                    <pre
                      style={{
                        fontSize: 12,
                        color: COLORS.muted,
                        background: COLORS.panel,
                        padding: 12,
                        borderRadius: 8,
                        whiteSpace: "pre-wrap",
                        marginTop: 8,
                        border: `1px solid ${COLORS.border}`,
                      }}
                    >
                      {m.thinking}
                    </pre>
                  </details>
                )}
              </div>
            </div>
          ))}

          {loading && (
            <div style={{ display: "flex", alignItems: "center", gap: 10, color: COLORS.muted, marginBottom: 16 }}>
              <div
                style={{
                  width: 18,
                  height: 18,
                  border: `2px solid ${COLORS.border}`,
                  borderTop: `2px solid ${COLORS.accent}`,
                  borderRadius: "50%",
                  animation: "spin 1s linear infinite",
                }}
              />
              <span style={{ fontSize: 13 }}>{t.thinkingStatus}</span>
            </div>
          )}

          {error && (
            <div
              style={{
                background: `${COLORS.danger}18`,
                color: COLORS.danger,
                border: `1px solid ${COLORS.danger}44`,
                borderRadius: 10,
                padding: "10px 14px",
                fontSize: 13,
                marginBottom: 16,
              }}
            >
              {format(t.errorPrefix, error)}
            </div>
          )}

          {outputs.length > 0 && (
            <div style={{ marginTop: 28 }}>
              <div
                style={{
                  fontSize: 12,
                  color: COLORS.muted,
                  textTransform: "uppercase",
                  letterSpacing: 0.5,
                  marginBottom: 12,
                }}
              >
                {t.output}
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))", gap: 14 }}>
                {outputs.map((o, i) => (
                  <a
                    key={i}
                    href={`${backendUrl}${o.url}`}
                    target="_blank"
                    rel="noreferrer"
                    style={{
                      display: "block",
                      background: COLORS.panel,
                      border: `1px solid ${COLORS.border}`,
                      borderRadius: 12,
                      overflow: "hidden",
                      textDecoration: "none",
                    }}
                  >
                    {o.type === "image" ? (
                      <img
                        src={`${backendUrl}${o.url}`}
                        alt={o.filename}
                        style={{ width: "100%", height: 160, objectFit: "cover", display: "block" }}
                      />
                    ) : (
                      <div
                        style={{
                          height: 160,
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          color: COLORS.accent,
                          fontSize: 32,
                        }}
                      >
                        {o.type === "video" ? "\u25B6" : "\u266A"}
                      </div>
                    )}
                    <div
                      style={{
                        padding: "10px 12px",
                        fontSize: 11,
                        color: COLORS.muted,
                        borderTop: `1px solid ${COLORS.border}`,
                      }}
                    >
                      {o.filename}
                    </div>
                  </a>
                ))}
              </div>
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>

        {/* Input area */}
        <div style={{ padding: "18px 32px", borderTop: `1px solid ${COLORS.border}`, background: COLORS.panel }}>
          {uploads.length > 0 && (
            <div style={{ display: "flex", gap: 8, marginBottom: 10, flexWrap: "wrap" }}>
              {uploads.map((u, idx) => (
                <div
                  key={idx}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 6,
                    background: `${COLORS.accent}22`,
                    border: `1px solid ${COLORS.accent}44`,
                    borderRadius: 16,
                    padding: "4px 10px",
                    fontSize: 11,
                    color: COLORS.text,
                  }}
                >
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <rect x="3" y="3" width="18" height="18" rx="2" />
                    <circle cx="8.5" cy="8.5" r="1.5" />
                    <path d="m21 15-5-5L5 21" />
                  </svg>
                  <span>{u.filename}</span>
                  <button
                    onClick={() => removeUpload(idx)}
                    style={{
                      background: "none",
                      border: "none",
                      color: COLORS.muted,
                      cursor: "pointer",
                      fontSize: 12,
                      padding: 0,
                    }}
                  >
                    ×
                  </button>
                </div>
              ))}
            </div>
          )}
          <div style={{ display: "flex", gap: 10, alignItems: "flex-end" }}>
            <input type="file" accept="image/*" ref={fileRef} onChange={handleFile} style={{ display: "none" }} />
            <button
              onClick={() => fileRef.current?.click()}
              style={{
                background: COLORS.panel,
                color: COLORS.text,
                border: `1px solid ${COLORS.border}`,
                borderRadius: 12,
                padding: "12px 14px",
                cursor: "pointer",
                fontSize: 18,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
              title={t.addImage}
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <rect x="3" y="3" width="18" height="18" rx="2" />
                <circle cx="8.5" cy="8.5" r="1.5" />
                <path d="m21 15-5-5L5 21" />
              </svg>
            </button>
            <textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  sendMessage();
                }
              }}
              placeholder={t.placeholder}
              style={{
                flex: 1,
                minHeight: 52,
                maxHeight: 160,
                background: COLORS.bg,
                color: COLORS.text,
                border: `1px solid ${COLORS.border}`,
                borderRadius: 14,
                padding: "14px 16px",
                fontSize: 14,
                lineHeight: 1.4,
                resize: "vertical",
                outline: "none",
                fontFamily: "inherit",
              }}
            />
            <button
              onClick={() => sendMessage()}
              disabled={loading || !input.trim()}
              style={{
                background: loading || !input.trim() ? "#2a2a3a" : COLORS.accent,
                color: "#fff",
                border: "none",
                borderRadius: 12,
                padding: "12px 22px",
                fontSize: 14,
                fontWeight: 600,
                cursor: loading || !input.trim() ? "not-allowed" : "pointer",
                height: 52,
              }}
            >
              {t.send}
            </button>
          </div>
        </div>
        </>
        )}
      </main>

      {/* Keyframes */}
      <style>{`
        @keyframes spin {
          0% { transform: rotate(0deg); }
          100% { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
}
