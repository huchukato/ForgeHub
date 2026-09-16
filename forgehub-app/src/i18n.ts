export type Language = "en" | "it";

export const translations = {
  en: {
    appName: "ForgeHub",
    tagline: "ComfyUI workflow hub",
    backendUrl: "Backend URL",
    categories: {
      agent: "Agent",
      video: "Video",
      image: "Image",
      audio: "Audio",
      other: "Other",
    },
    noWorkflows: "No workflows in this category.",
    chatModel: "Chat model",
    backendGguf: "GGUF (local)",
    backendHf: "HF Transformers",
    maxTokens: "Max tokens",
    temperature: "Temperature",
    enableThinking: "Enable thinking",
    noWorkflowSelected: "No workflow selected",
    welcomeTitle: "Hello, I'm ForgeHub",
    welcomeBody: "Select a workflow and tell me what to do. I can tweak parameters and run it on ComfyUI.",
    userInitial: "U",
    assistantInitial: "Q",
    thinking: "Thinking",
    placeholder: "e.g. set steps to 25 and queue the workflow...",
    send: "Send",
    addImage: "Add image",
    output: "Output",
    thinkingStatus: "Qwen is thinking…",
    errorPrefix: "Error: {0}",
    language: "Language",
  },
  it: {
    appName: "ForgeHub",
    tagline: "Hub per workflow ComfyUI",
    backendUrl: "URL backend",
    categories: {
      agent: "Agent",
      video: "Video",
      image: "Immagine",
      audio: "Audio",
      other: "Altro",
    },
    noWorkflows: "Nessun workflow in questa categoria.",
    chatModel: "Modello chat",
    backendGguf: "GGUF (locale)",
    backendHf: "HF Transformers",
    maxTokens: "Max tokens",
    temperature: "Temperature",
    enableThinking: "Abilita thinking",
    noWorkflowSelected: "Nessun workflow selezionato",
    welcomeTitle: "Ciao, sono ForgeHub",
    welcomeBody: "Seleziona un workflow e scrivimi in italiano. Posso modificare parametri e avviare l'esecuzione su ComfyUI.",
    userInitial: "U",
    assistantInitial: "Q",
    thinking: "Pensiero",
    placeholder: "Es: imposta 25 step e avvia il workflow...",
    send: "Invia",
    addImage: "Aggiungi immagine",
    output: "Output",
    thinkingStatus: "Qwen sta pensando…",
    errorPrefix: "Errore: {0}",
    language: "Lingua",
  },
} as const;

export interface Translations {
  appName: string;
  tagline: string;
  backendUrl: string;
  categories: {
    agent: string;
    video: string;
    image: string;
    audio: string;
    other: string;
  };
  noWorkflows: string;
  chatModel: string;
  backendGguf: string;
  backendHf: string;
  maxTokens: string;
  temperature: string;
  enableThinking: string;
  noWorkflowSelected: string;
  welcomeTitle: string;
  welcomeBody: string;
  userInitial: string;
  assistantInitial: string;
  thinking: string;
  placeholder: string;
  send: string;
  addImage: string;
  output: string;
  thinkingStatus: string;
  errorPrefix: string;
  language: string;
}

export function format(template: string, ...args: unknown[]): string {
  return template.replace(/\{(\d+)\}/g, (_, index) => String(args[Number(index)] ?? ""));
}
