import { ImagePlus, X } from "lucide-react";
import { useEffect, useRef } from "react";
import type { ForgeHubClient, WorkflowParam } from "../api";
import { Card, Label, Select, TextArea, TextInput, Toggle } from "./ui";
import WildcardTextArea from "./WildcardTextArea";

// Aspect-ratio → size presets for the `image_size` param (Pixaroma-style picker).
const SIZE_PRESETS: Record<string, string[]> = {
  "16:9": ["1344x768", "1536x864", "1920x1088", "2048x1152"],
  "4:3": ["1152x864", "1440x1088", "2048x1536"],
  "1:1": ["1024x1024", "1152x1152", "1344x1344", "2048x2048"],
  "3:4": ["864x1152", "1088x1440", "1536x2048"],
  "9:16": ["768x1344", "864x1536", "1088x1920", "1152x2048"],
  "2:3": ["768x1152", "832x1248", "1344x2016"],
  "3:2": ["1152x768", "1248x832", "2016x1344"],
  "21:9": ["1536x640", "2016x864", "2528x1088"],
};

// MiniMax resolution node: [w, h, tier] per aspect ratio (ComfyUI-PerfectVideoResolution).
const VIDEO_PRESETS: Record<string, [number, number, string][]> = {
  "1:1": [[512,512,"Fast Draft"],[640,640,"Preview"],[768,768,"High Detail"],[1024,1024,"Native"],[1152,1152,"1.5K"],[1440,1440,"1080P Class"],[1536,1536,"2K"]],
  "3:4": [[448,576,"Fast Draft"],[576,736,"Preview"],[672,896,"High Detail"],[864,1184,"Native"],[992,1344,"1.5K"],[1248,1664,"1080P Class"],[1344,1760,"2K"]],
  "4:3": [[576,448,"Fast Draft"],[736,576,"Preview"],[896,672,"High Detail"],[1184,864,"Native"],[1344,992,"1.5K"],[1664,1248,"1080P Class"],[1760,1344,"2K"]],
  "9:16": [[384,672,"Fast Draft"],[480,864,"Preview"],[576,1024,"High Detail"],[768,1344,"Native"],[864,1536,"1.5K"],[1088,1920,"1080P Class"],[1152,2048,"2K"]],
  "16:9": [[672,384,"Fast Draft"],[864,480,"Preview"],[1024,576,"High Detail"],[1344,768,"Native"],[1536,864,"1.5K"],[1920,1088,"1080P Class"],[2048,1152,"2K"]],
  "21:9": [[768,320,"Fast Draft"],[992,416,"Preview"],[1184,512,"High Detail"],[1536,672,"Native"],[1760,768,"1.5K"],[2208,960,"1080P Class"],[2336,992,"2K"]],
};

const videoLabel = (row: [number, number, string]) => `${row[2]} — ${row[0]}×${row[1]}`;
const videoTier = (v: string) =>
  (VIDEO_PRESETS["1:1"].map((r) => r[2]).find((t) => v.includes(t)) || "Native");

function ratioOf(size: string): string | null {
  for (const [ratio, sizes] of Object.entries(SIZE_PRESETS)) {
    if (sizes.includes(size)) return ratio;
  }
  return null;
}

function SizePicker({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const active = ratioOf(value) ?? "1:1";
  return (
    <div>
      <div className="flex flex-wrap gap-1.5">
        {Object.keys(SIZE_PRESETS).map((ratio) => {
          const [rw, rh] = ratio.split(":").map(Number);
          const sel = ratio === active;
          return (
            <button
              key={ratio}
              type="button"
              onClick={() => onChange(SIZE_PRESETS[ratio][0])}
              className={`flex w-16 flex-col items-center gap-1 rounded-lg border px-1 py-2 transition-all duration-150 ${
                sel
                  ? "border-accent/60 bg-accent/10 text-accent shadow-[0_0_12px_rgb(124_92_255/0.15)]"
                  : "border-border bg-bg-elev text-muted hover:border-border-strong hover:bg-panel-hover hover:text-text"
              }`}
            >
              <span
                className="rounded-sm border border-current"
                style={{ width: Math.min(22, 10 + (rw / rh) * 10), height: Math.min(22, 10 + (rh / rw) * 10) }}
              />
              <span className="text-[10px] font-semibold">{ratio}</span>
            </button>
          );
        })}
      </div>
      <div className="mt-2 flex flex-wrap gap-1.5">
        {SIZE_PRESETS[active].map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => onChange(s)}
            className={`rounded-md border px-2 py-1 font-mono text-[11px] transition-all duration-150 ${
              s === value
                ? "border-accent/60 bg-accent/10 text-accent"
                : "border-border bg-bg-elev text-muted hover:border-border-strong hover:bg-panel-hover hover:text-text"
            }`}
          >
            {s.replace("x", "×")}
          </button>
        ))}
      </div>
    </div>
  );
}

// Param keys grouped into sections — everything else falls to "Parameters".
const SECTIONS: Array<{ title: string; keys: string[] }> = [
  { title: "Prompt", keys: ["prompt", "images", "video"] },
  { title: "Enhancer (QwenVL)", keys: ["enhance", "vl_preset", "camera_tag"] },
  { title: "Generation", keys: ["seconds", "config", "seed"] },
  { title: "Post-processing", keys: ["upscale", "upscale_model", "upscale_target", "rife"] },
];

interface Props {
  client: ForgeHubClient;
  parameters: WorkflowParam[];
  values: Record<string, unknown>;
  setValue: (key: string, value: unknown) => void;
  imageSlots: Record<string, string[]>;
  setImageSlots: React.Dispatch<React.SetStateAction<Record<string, string[]>>>;
  onError: (msg: string) => void;
}

export default function RecipeForm({ client, parameters, values, setValue, imageSlots, setImageSlots, onError }: Props) {
  const fileRefs = useRef<Record<string, HTMLInputElement | null>>({});

  // Video resolution fields ("*:aspect_ratio" + "*:resolution") stay in sync:
  // changing the ratio rewrites the label with the same tier at the new size.
  const aspectKey = parameters.find((p) => p.key.endsWith(":aspect_ratio"))?.key;
  const resKey = parameters.find((p) => p.key.endsWith(":resolution"))?.key;
  const aspect = aspectKey ? String(values[aspectKey] ?? "") : "";
  const resRows = aspectKey && resKey ? VIDEO_PRESETS[aspect] : undefined;

  useEffect(() => {
    if (!resRows || !resKey) return;
    const label = videoLabel(resRows.find((r) => r[2] === videoTier(String(values[resKey] ?? ""))) ?? resRows[3]);
    if (values[resKey] !== label) setValue(resKey, label);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [aspect]);

  const upload = async (param: WorkflowParam, file: File) => {
    try {
      const res = await client.uploadImage(file);
      const max = param.max ?? 1;
      setImageSlots((prev) => ({
        ...prev,
        [param.key]: [...(prev[param.key] ?? []), res.filename].slice(-max),
      }));
    } catch (e) {
      onError(String(e));
    }
  };

  const renderField = (p: WorkflowParam) => {
    const v = values[p.key];
    if (p.type === "images") {
      const files = imageSlots[p.key] ?? [];
      const max = p.max ?? 1;
      return (
        <div className="flex flex-wrap gap-2">
          {files.map((f, i) => (
            <div key={i} className="group relative">
              <img
                src={`/outputs/${f}?type=input`}
                alt={f}
                title={f}
                className="h-24 w-auto max-w-44 rounded-lg border border-border object-cover shadow-[var(--shadow-panel)]"
              />
              <button
                onClick={() => setImageSlots((prev) => ({ ...prev, [p.key]: files.filter((_, j) => j !== i) }))}
                className="absolute -right-1.5 -top-1.5 rounded-full bg-danger p-0.5 text-white opacity-0 shadow-md transition-opacity group-hover:opacity-100"
              >
                <X size={10} />
              </button>
            </div>
          ))}
          {files.length < max && (
            <>
              <input
                ref={(el) => { fileRefs.current[p.key] = el; }}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) upload(p, f);
                  e.target.value = "";
                }}
              />
              <button
                onClick={() => fileRefs.current[p.key]?.click()}
                className="flex h-24 w-24 items-center justify-center rounded-lg border border-dashed border-border-strong bg-bg-elev/50 text-muted transition-all duration-150 hover:border-accent/60 hover:bg-accent/5 hover:text-accent hover:shadow-[0_0_12px_rgb(124_92_255/0.12)]"
              >
                <ImagePlus size={20} />
              </button>
            </>
          )}
        </div>
      );
    }
    if (p.type === "bool") {
      return <Toggle checked={v !== false} onChange={(nv) => setValue(p.key, nv)} />;
    }
    if (p.key === "image_size") {
      return <SizePicker value={String(v ?? "1024x1024")} onChange={(nv) => setValue(p.key, nv)} />;
    }
    if (p.key.endsWith(":resolution") && resRows) {
      const opts = resRows.map(videoLabel);
      const current = opts.find((o) => o.startsWith(videoTier(String(v ?? ""))));
      return (
        <Select value={current ?? String(v ?? "")} onChange={(e) => setValue(p.key, e.target.value)}>
          {opts.map((o) => <option key={o} value={o}>{o}</option>)}
        </Select>
      );
    }
    if (p.type === "select") {
      return (
        <Select value={String(v ?? "")} onChange={(e) => setValue(p.key, e.target.value)}>
          {(p.options || []).map((o) => <option key={o} value={o}>{o}</option>)}
        </Select>
      );
    }
    if (p.type === "int" || p.type === "float") {
      return (
        <TextInput
          type="number"
          value={v === undefined || v === null ? "" : String(v)}
          onChange={(e) => setValue(p.key, p.type === "int" ? parseInt(e.target.value || "0", 10) : parseFloat(e.target.value || "0"))}
        />
      );
    }
    if (p.type === "video") {
      return (
        <TextInput
          value={String(v ?? "")}
          placeholder="file video (upload)"
          onChange={(e) => setValue(p.key, e.target.value)}
        />
      );
    }
    // text — prompt gets the wildcard-autocomplete textarea
    if (p.key === "prompt") {
      return <WildcardTextArea client={client} value={String(v ?? "")} presetPrefix={p.wildcard_prefix} onChange={(nv) => setValue(p.key, nv)} />;
    }
    return String(v ?? "").length > 60 ? (
      <TextArea value={String(v ?? "")} onChange={(e) => setValue(p.key, e.target.value)} />
    ) : (
      <TextInput value={String(v ?? "")} onChange={(e) => setValue(p.key, e.target.value)} />
    );
  };

  const sections = SECTIONS.map((s) => ({
    ...s,
    params: parameters.filter((p) =>
      s.keys.includes(p.key) ||
      (s.title === "Prompt" && p.key.endsWith(":mode")) ||
      (s.title === "Enhancer (QwenVL)" && p.key.endsWith(":style_tag"))),
  })).filter((s) => s.params.length > 0);
  const sectioned = new Set(sections.flatMap((s) => s.params.map((p) => p.key)));
  const rest = parameters.filter((p) => !sectioned.has(p.key));

  return (
    <div className="space-y-4">
      {sections.map((s) => (
        <Card key={s.title}>
          <div className="mb-3 flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.08em] text-muted">
            <span className="h-3 w-[3px] rounded-full bg-gradient-to-b from-accent to-magenta" />
            {s.title}
            {s.title.startsWith("Enhancer") && values.enhance !== false && (
              <span className="rounded-md border border-accent/40 bg-accent/15 px-2 py-0.5 text-[9px] normal-case tracking-normal text-accent-hover">
                prompt goes through QwenVL-Mod
              </span>
            )}
          </div>
          <div className="space-y-3">
            {s.params.map((p) => (
              <div key={p.key} className={p.type === "bool" ? "flex items-center justify-between" : ""}>
                {(p.label || p.key).toLowerCase() !== s.title.toLowerCase() && <Label>{p.label || p.key}</Label>}
                {renderField(p)}
              </div>
            ))}
          </div>
        </Card>
      ))}
      {rest.length > 0 && (
        <Card>
          <div className="mb-3 flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.08em] text-muted">
            <span className="h-3 w-[3px] rounded-full bg-gradient-to-b from-accent to-magenta" />
            Parameters
          </div>
          <div className="space-y-3">
            {rest.map((p) => (
              <div key={p.key} className={p.type === "bool" ? "flex items-center justify-between" : ""}>
                <Label>{p.label || p.key}</Label>
                {renderField(p)}
              </div>
            ))}
          </div>
        </Card>
      )}
      {parameters.length === 0 && (
        <div className="rounded-xl border border-dashed border-border p-8 text-center text-[12px] text-muted">
          No parameters declared in this workflow's .meta.json.
        </div>
      )}
    </div>
  );
}
