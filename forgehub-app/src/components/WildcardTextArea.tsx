import { ChevronLeft, ChevronRight, Loader2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import type { ForgeHubClient } from "../api";
import { useT } from "../i18n";
import { TextArea } from "./ui";

interface Props {
  client: ForgeHubClient;
  value: string;
  onChange: (v: string) => void;
  presetPrefix?: string; // e.g. "qwen21/" → shows quick-insert chips for __prefix/*__ wildcards
}

// Textarea with TagForge wildcard autocomplete: typing "__" opens a
// dropdown filtrato sul token corrente; Enter/Tab/click inseriscono __key__.
// → (o click sulla chevron) apre le opzioni della wildcard selezionata e
// permette di inserire un valore letterale invece del placeholder random.
export default function WildcardTextArea({ client, value, onChange, presetPrefix }: Props) {
  const t = useT();
  const [catalog, setCatalog] = useState<string[]>([]);
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [tokenStart, setTokenStart] = useState(-1);
  const [index, setIndex] = useState(0);
  const [browse, setBrowse] = useState<{ wildcard: string; options: string[]; span: { start: number; end: number } } | null>(null);
  const [browseLoading, setBrowseLoading] = useState(false);
  const areaRef = useRef<HTMLTextAreaElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    client.listWildcards().then(setCatalog).catch(() => setCatalog([]));
  }, [client]);

  useEffect(() => {
    listRef.current?.querySelector("[data-active]")?.scrollIntoView({ block: "nearest" });
  }, [index]);

  const updateSuggestions = (text: string, cursor: number) => {
    const before = text.slice(0, cursor);
    const m = before.match(/__([\w.\-/\\]*)$/);
    if (!m) {
      setSuggestions([]);
      setTokenStart(-1);
      setBrowse(null);
      return;
    }
    // While browsing options, exit if the caret moves before/inside the token
    // or the user starts a new token/choice after it.
    if (browse) {
      const tail = cursor >= browse.span.end ? text.slice(browse.span.end, cursor) : null;
      if (tail === null || tail.startsWith(" ") || tail.includes("__") || tail.includes("{")) {
        setBrowse(null);
      }
    }
    const p = m[1].toLowerCase();
    const full = `__${m[1]}`;
    // Match anywhere in the wildcard path: "__pmp/prmpt" keeps prefix priority,
    // "__rndm" finds every wildcard containing "rndm" (e.g. .../rndmlctns__).
    const rank = (w: string) => {
      const body = w.replace(/^__|__$/g, "").toLowerCase();
      if (!p || body.startsWith(p)) return 0;
      if (body.includes(`/${p}`)) return 1;
      return 2;
    };
    const hits = catalog
      .filter((w) => !p || w.replace(/^__|__$/g, "").toLowerCase().includes(p))
      .sort((a, b) => rank(a) - rank(b) || a.localeCompare(b))
      .slice(0, 12);
    setSuggestions(hits);
    setTokenStart(cursor - full.length);
    setIndex(0);
  };

  const openBrowse = async (w: string, span: { start: number; end: number }) => {
    setBrowseLoading(true);
    try {
      const options = await client.listWildcardValues(w);
      if (options.length) {
        setBrowse({ wildcard: w, options, span });
        setIndex(0);
      }
    } catch {
      /* keep dropdown on paths */
    } finally {
      setBrowseLoading(false);
    }
  };

  const applyText = (next: string, pos: number) => {
    onChange(next);
    requestAnimationFrame(() => {
      const el = areaRef.current;
      el?.focus();
      el?.setSelectionRange(pos, pos);
    });
  };

  // Inserts the wildcard token and immediately opens its option list,
  // like ComfyUI: pick a literal value or Esc/keep __x__ for random.
  const accept = (w: string) => {
    if (tokenStart < 0) return;
    const cursor = areaRef.current?.selectionStart ?? value.length;
    const next = value.slice(0, tokenStart) + w + value.slice(cursor);
    const end = tokenStart + w.length;
    applyText(next, end);
    void openBrowse(w, { start: tokenStart, end });
  };

  // Replaces the whole __x__ token span (plus any filter chars typed after it)
  // with the chosen literal option.
  const acceptOption = (text: string) => {
    if (!browse) return;
    const cursor = areaRef.current?.selectionStart ?? value.length;
    const next = value.slice(0, browse.span.start) + text + " " + value.slice(cursor);
    const pos = browse.span.start + text.length + 1;
    applyText(next, pos);
    setSuggestions([]);
    setBrowse(null);
    setTokenStart(-1);
  };

  const presets = presetPrefix
    ? catalog.filter((w) => w.startsWith(`__${presetPrefix}`) && w.endsWith("__")).sort()
    : [];

  const insertWildcard = (w: string) => {
    const el = areaRef.current;
    const cursor = el?.selectionStart ?? value.length;
    const next = value.slice(0, cursor) + w + " " + value.slice(cursor);
    onChange(next);
    requestAnimationFrame(() => {
      el?.focus();
      el?.setSelectionRange(cursor + w.length + 1, cursor + w.length + 1);
    });
  };

  // Only characters typed AFTER the token span filter the options — the path
  // query ("rndm") never matches option text and must not hide them.
  const optionFilter = browse
    ? value.slice(browse.span.end, areaRef.current?.selectionStart ?? value.length)
    : "";
  const filteredOptions = browse
    ? browse.options.filter((o) => !optionFilter || o.toLowerCase().includes(optionFilter.toLowerCase())).slice(0, 40)
    : [];

  return (
    <div className={`relative ${presets.length ? "rounded-xl border border-border bg-panel shadow-[var(--shadow-panel)] transition-colors focus-within:border-accent/60 focus-within:shadow-[var(--shadow-glow)]" : ""}`}>
      {presets.length > 0 && (
        <div className="flex gap-1.5 overflow-x-auto border-b border-border px-2.5 py-2">
          {presets.map((w) => {
            const name = w.slice(2 + presetPrefix!.length, -2);
            const active = value.includes(w);
            return (
              <button
                key={w}
                type="button"
                title={w}
                onClick={() => {
                  if (active) {
                    onChange(value.split(w).join("").replace(/ {2,}/g, " ").trim());
                  } else {
                    insertWildcard(w);
                  }
                }}
                className={`shrink-0 rounded-md border px-2 py-1 font-mono text-[10px] transition-all duration-150 ${
                  active
                    ? "border-accent/60 bg-accent/15 text-accent-hover shadow-[0_0_8px_rgb(124_92_255/0.15)]"
                    : "border-border bg-bg-elev text-muted hover:border-border-strong hover:text-text"
                }`}
              >
                {name}
              </button>
            );
          })}
        </div>
      )}
      <TextArea
        ref={areaRef}
        value={value}
        className={presets.length ? "!border-0 !bg-transparent" : undefined}
        placeholder={t.promptPlaceholder}
        onChange={(e) => {
          onChange(e.target.value);
          updateSuggestions(e.target.value, e.target.selectionStart ?? e.target.value.length);
        }}
        onKeyDown={(e) => {
          if (browse) {
            if (e.key === "ArrowDown") { e.preventDefault(); setIndex((i) => Math.min(i + 1, filteredOptions.length - 1)); }
            else if (e.key === "ArrowUp") { e.preventDefault(); setIndex((i) => Math.max(i - 1, 0)); }
            else if (e.key === "Enter" || e.key === "Tab") { e.preventDefault(); const o = filteredOptions[index]; if (o !== undefined) acceptOption(o); }
            else if (e.key === "Escape") { e.preventDefault(); setBrowse(null); setSuggestions([]); setTokenStart(-1); }
            else if (e.key === "ArrowLeft") { e.preventDefault(); setBrowse(null); setIndex(0); }
            return;
          }
          if (!suggestions.length) return;
          if (e.key === "ArrowDown") { e.preventDefault(); setIndex((i) => (i + 1) % suggestions.length); }
          else if (e.key === "ArrowUp") { e.preventDefault(); setIndex((i) => (i - 1 + suggestions.length) % suggestions.length); }
          else if (e.key === "ArrowRight") {
            e.preventDefault();
            const cursor = areaRef.current?.selectionStart ?? value.length;
            openBrowse(suggestions[index], { start: tokenStart, end: cursor });
          }
          else if (e.key === "Enter" || e.key === "Tab") { e.preventDefault(); accept(suggestions[index]); }
          else if (e.key === "Escape") { setSuggestions([]); setTokenStart(-1); }
        }}
        onBlur={() => setTimeout(() => { setSuggestions([]); setBrowse(null); }, 150)}
      />
      {(suggestions.length > 0 || browse || browseLoading) && tokenStart >= 0 && (
        <div
          ref={listRef}
          className="absolute left-0 top-full z-40 mt-1 max-h-64 w-full overflow-y-auto rounded-xl border border-border-strong bg-panel/95 p-1 shadow-[var(--shadow-pop)] backdrop-blur-md"
          style={{ animation: "fh-fade-up .15s ease-out" }}
        >
          {browse ? (
            <>
              <button
                onMouseDown={(e) => { e.preventDefault(); setBrowse(null); setIndex(0); }}
                className="flex w-full items-center gap-1.5 rounded-md px-2.5 py-1.5 text-left font-mono text-[11px] text-accent transition-colors hover:bg-panel-hover"
              >
                <ChevronLeft size={12} /> {browse.wildcard}
                <span className="ml-auto text-faint">{browse.options.length} opzioni</span>
              </button>
              {filteredOptions.length === 0 && (
                <div className="px-3 py-2 text-[11px] text-faint">Nessuna opzione filtra "{optionFilter}"</div>
              )}
              {filteredOptions.map((o, i) => (
                <button
                  key={i}
                  data-active={i === index || undefined}
                  onMouseDown={(e) => { e.preventDefault(); acceptOption(o); }}
                  className={`block w-full truncate rounded-md px-3 py-1.5 text-left text-[12px] transition-colors ${
                    i === index ? "bg-accent/20 text-accent-hover" : "text-text/80 hover:bg-panel-hover hover:text-text"
                  }`}
                >
                  {o}
                </button>
              ))}
            </>
          ) : (
            <>
              {browseLoading && (
                <div className="flex items-center gap-2 px-3 py-2 text-[11px] text-muted">
                  <Loader2 size={12} className="animate-spin" /> Carico opzioni…
                </div>
              )}
              {suggestions.map((w, i) => (
                <div key={w} className={`group/wrow flex items-center rounded-md transition-colors ${
                  i === index ? "bg-accent/20" : "hover:bg-panel-hover"
                }`}>
                  <button
                    data-active={i === index || undefined}
                    onMouseDown={(e) => { e.preventDefault(); accept(w); }}
                    className={`block min-w-0 flex-1 truncate px-3 py-1.5 text-left font-mono text-[12px] transition-colors ${
                      i === index ? "text-accent-hover" : "text-text/80 group-hover/wrow:text-text"
                    }`}
                  >
                    {w}
                  </button>
                  <button
                    onMouseDown={(e) => {
                      e.preventDefault();
                      const cursor = areaRef.current?.selectionStart ?? value.length;
                      openBrowse(w, { start: tokenStart, end: cursor });
                    }}
                    title={t.browseOptions}
                    className="mr-1 shrink-0 rounded p-1 text-faint opacity-0 transition-all hover:bg-accent/20 hover:text-accent group-hover/wrow:opacity-100"
                  >
                    <ChevronRight size={12} />
                  </button>
                </div>
              ))}
            </>
          )}
        </div>
      )}
    </div>
  );
}
