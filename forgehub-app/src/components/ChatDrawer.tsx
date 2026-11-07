import { CornerDownLeft, MessageSquare, Send, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import type { ChatMessage, ForgeHubClient } from "../api";
import { useT } from "../i18n";

interface Props {
  client: ForgeHubClient;
  workflowId: string;
  open: boolean;
  onClose: () => void;
  onInsertPrompt?: (text: string) => void;
}

/** Best-effort extraction of the prompt text from an assistant reply:
 *  drops a leading "Prompt:" label, prefers a quoted span, trims quotes. */
function extractPrompt(content: string): string {
  let s = content.trim()
    .replace(/^\**\s*Prompt\s*\**\s*:?\s*\**\s*/i, "")
    .split(/\*\*(Note|Edit Instruction|Edit|Additional)/)[0]
    .trim();
  // pick the first substantial paragraph (skip label-only fragments like "**")
  const paras = s.split(/\n\s*\n/).map(p => p.trim())
    .filter(p => p.replace(/\*/g, "").trim().length > 10);
  s = paras[0] || s;
  // strip outer quotes only when they wrap the whole span
  const m = s.match(/^(["“])([\s\S]*)\1$/);
  if (m) s = m[2].trim();
  return s || content.trim();
}

/** Turn "503: {"detail":"Chat request failed: ComfyUI 429: {...rate-limited...}"}"
 *  into a short human message shown inside the chat. */
function friendlyError(e: unknown): string {
  const raw = String(e instanceof Error ? e.message : e);
  const start = raw.indexOf("{");
  try {
    const detail = String(JSON.parse(raw.slice(start)).detail ?? raw);
    if (/429|rate.?limit/i.test(detail))
      return "Model is rate-limited right now — retry in a moment or pick another model in Settings.";
    return detail.slice(0, 200);
  } catch {
    return raw.slice(0, 200);
  }
}

export default function ChatDrawer({ client, workflowId, open, onClose, onInsertPrompt }: Props) {
  const t = useT();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, busy]);

  const send = async () => {
    const text = input.trim();
    if (!text || busy) return;
    setInput("");
    const next = [...messages, { role: "user" as const, content: text }];
    setMessages(next);
    setBusy(true);
    try {
      const res = await client.chat(next, {}, workflowId || undefined);
      setMessages([...next, { role: "assistant", content: res.message, thinking: res.thinking, choices: res.choices }]);
    } catch (e) {
      setMessages([...next, { role: "assistant", content: friendlyError(e), error: true }]);
    } finally {
      setBusy(false);
    }
  };

  if (!open) return null;

  return (
    <div className="flex w-[340px] shrink-0 flex-col border-l border-border bg-bg-elev/70 backdrop-blur-md">
      <div className="flex items-center justify-between border-b border-border px-4 py-3">
        <div className="flex items-center gap-2 text-[13px] font-semibold tracking-tight">
          <MessageSquare size={14} className="text-accent" /> Prompt assist
        </div>
        <button onClick={onClose} className="rounded-md p-1.5 text-muted transition-colors hover:bg-panel-hover hover:text-text"><X size={15} /></button>
      </div>

      <div className="flex-1 space-y-3 overflow-y-auto p-4">
        {messages.length === 0 && (
          <div className="rounded-xl border border-dashed border-border-strong bg-panel/40 p-5 text-center text-[12px] leading-relaxed text-faint">
            Ask for help writing your prompt — the reply can be pasted into the form's Prompt field.
          </div>
        )}
        {messages.map((m, i) => (
          <div
            key={i}
            className={
              m.error
                ? "mr-8 rounded-xl rounded-bl-sm border border-danger/40 bg-danger/10 px-3 py-2 text-[12px] text-danger"
                : m.role === "user"
                ? "ml-8 rounded-xl rounded-br-sm border border-accent/30 bg-accent/15 px-3 py-2 text-[13px] shadow-[var(--shadow-panel)]"
                : "mr-8 rounded-xl rounded-bl-sm border border-border bg-panel px-3 py-2 text-[13px] shadow-[var(--shadow-panel)]"
            }
          >
            <div>{m.content}</div>
            {m.role === "assistant" && !m.error && onInsertPrompt && (
              <button
                onClick={() => onInsertPrompt(extractPrompt(m.content))}
                className="mt-2 flex items-center gap-1 rounded-md border border-accent/40 bg-accent/10 px-2 py-1 text-[11px] text-accent transition-colors hover:bg-accent/20"
              >
                <CornerDownLeft size={11} /> Use as prompt
              </button>
            )}
          </div>
        ))}
        {busy && (
          <div className="mr-8 flex items-center gap-1.5 rounded-xl rounded-bl-sm border border-border bg-panel px-3 py-2.5">
            {[0, 1, 2].map((d) => (
              <span
                key={d}
                className="h-1.5 w-1.5 rounded-full bg-accent/70"
                style={{ animation: `fh-pulse 1.2s ease-in-out ${d * 0.2}s infinite` }}
              />
            ))}
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      <div className="border-t border-border bg-panel/40 p-3">
        <div className="flex gap-2">
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && send()}
            placeholder={t.typePlaceholder}
            className="flex-1 rounded-lg border border-border bg-bg-elev px-3 py-2 text-[13px] outline-none transition-all placeholder:text-faint hover:border-border-strong focus:border-accent/70 focus:shadow-[var(--shadow-glow)]"
          />
          <button
            onClick={send}
            disabled={busy}
            className="rounded-lg bg-gradient-to-b from-accent-hover to-accent p-2 text-white shadow-[0_2px_10px_rgb(124_92_255/0.3)] transition-all hover:brightness-110 disabled:opacity-50 disabled:shadow-none"
          >
            <Send size={15} />
          </button>
        </div>
      </div>
    </div>
  );
}
