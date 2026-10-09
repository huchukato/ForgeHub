import { createContext, useContext } from "react";

export type Language = "en" | "it" | "es";

export const LANGUAGES: Array<{ id: Language; label: string }> = [
  { id: "en", label: "English" },
  { id: "it", label: "Italiano" },
  { id: "es", label: "Español" },
];

const LANG_KEY = "forgehub.lang";

export function getStoredLang(): Language {
  const v = localStorage.getItem(LANG_KEY);
  return v === "it" || v === "es" ? v : "en";
}

export function storeLang(l: Language) {
  localStorage.setItem(LANG_KEY, l);
}

export interface Translations {
  appName: string;
  tagline: string;
  language: string;

  // App chrome
  execute: string;
  outputsTitle: string;
  promptAssist: string;
  settings: string;
  library: string;
  jobsGenerating: string;
  jobsQueued: string;
  stop: string;
  loadingWorkflows: string;
  outputsEmpty: string;

  // Sidebar
  searchWorkflows: string;
  noWorkflows: string;
  categories: { agent: string; video: string; image: string; audio: string; other: string };

  // RecipeForm
  secPrompt: string;
  secEnhancer: string;
  secGeneration: string;
  secPost: string;
  secParameters: string;
  enhancerBadge: string;
  history: string;
  historyLoading: string;
  historyEmpty: string;
  noPrompt: string;
  promptTrace: string;
  traceFills: string;
  traceBody: string;
  uploadVideo: string;
  changeVideo: string;
  noParams: string;

  // Outputs gallery
  selectMultiple: string;
  exitSelection: string;
  selectAll: string;
  deselectAll: string;
  download: string;
  cancel: string;
  delete: string;
  deleting: string;
  useAsInput: string;
  outputsEmptyLib: string;
  previous: string;
  next: string;
  capturing: string;
  setCurrentFrame: string;
  setLastFrame: string;
  useAsRef: string;

  // Settings
  runpodServerless: string;
  apiKey: string;
  apiKeySet: string;
  getApiKey: string;
  endpointId: string;
  detect: string;
  detecting: string;
  noEndpoints: string;
  pickEndpoint: string;
  chatLlm: string;
  service: string;
  openaiCompat: string;
  selectModel: string;
  customModel: string;
  saveKeyHint: string;
  s3Section: string;
  s3Hint: string;
  s3AccessId: string;
  s3AccessSecret: string;
  s3Volume: string;
  s3Datacenter: string;
  save: string;
  saving: string;

  // Updates
  updateAvailable: string;
  updateDownload: string;
  updateDetails: string;
  updateCheck: string;
  updateUpToDate: string;
  updateFailed: string;

  // Wildcard textarea / chat
  promptPlaceholder: string;
  browseOptions: string;
  typePlaceholder: string;
  send: string;

  // Legacy keys kept for ChatDrawer compatibility
  backendUrl: string;
  backendUrlHint: string;
  chatModel: string;
  backendGguf: string;
  backendHf: string;
  model: string;
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
  addImage: string;
  output: string;
  thinkingStatus: string;
  errorPrefix: string;
}

export const translations: Record<Language, Translations> = {
  en: {
    appName: "ForgeHub",
    tagline: "ComfyUI workflow hub",
    language: "Language",

    execute: "Execute",
    outputsTitle: "Outputs",
    promptAssist: "Prompt assist",
    settings: "Settings",
    library: "Library",
    jobsGenerating: "generating",
    jobsQueued: "queued / cold start",
    stop: "Stop",
    loadingWorkflows: "Loading workflows…",
    outputsEmpty: "Generated media\nappears here",

    searchWorkflows: "Search workflows…",
    noWorkflows: "No workflows in this category.",
    categories: { agent: "Agent", video: "Video", image: "Image", audio: "Audio", other: "Other" },

    secPrompt: "Prompt",
    secEnhancer: "Enhancer (QwenVL)",
    secGeneration: "Generation",
    secPost: "Post-processing",
    secParameters: "Parameters",
    enhancerBadge: "prompt goes through QwenVL-Mod",
    history: "History",
    historyLoading: "Loading…",
    historyEmpty: "No prompts embedded in outputs yet",
    noPrompt: "(no prompt)",
    promptTrace: "Prompt trace",
    traceFills: "fills after generation",
    traceBody: "Wildcard-expanded and QwenVL prompts appear here.",
    uploadVideo: "Upload video",
    changeVideo: "Change",
    noParams: "No parameters declared in this workflow's .meta.json.",

    selectMultiple: "Select multiple",
    exitSelection: "Exit selection",
    selectAll: "Select all",
    deselectAll: "Deselect all",
    download: "Download",
    cancel: "Cancel",
    delete: "Delete",
    deleting: "Deleting…",
    useAsInput: "Use as input image",
    outputsEmptyLib: "Generated outputs will appear here.",
    previous: "Previous (←)",
    next: "Next (→)",
    capturing: "Capturing…",
    setCurrentFrame: "Set current frame",
    setLastFrame: "Set last frame as reference",
    useAsRef: "Use as reference",

    runpodServerless: "RunPod Serverless",
    apiKey: "API Key",
    apiKeySet: "(set — empty = keep)",
    getApiKey: "Get your API key →",
    endpointId: "Endpoint ID",
    detect: "Detect from account",
    detecting: "Detecting…",
    noEndpoints: "No endpoints found on this account",
    pickEndpoint: "— pick an endpoint —",
    chatLlm: "Chat (LLM)",
    service: "Service",
    openaiCompat: "OpenAI-compatible endpoint",
    selectModel: "— select a model —",
    customModel: "Custom (type manually)",
    saveKeyHint: "Save the API key below to list models.",
    s3Section: "Output storage (S3)",
    s3Hint: "Needed to download large video outputs — they're offloaded to the endpoint's network volume. Create the credentials in the RunPod console.",
    s3AccessId: "S3 Access ID",
    s3AccessSecret: "S3 Access Secret",
    s3Volume: "Network volume ID",
    s3Datacenter: "Datacenter",
    save: "Save",
    saving: "Saving…",
    updateAvailable: "ForgeHub v{0} is available",
    updateDownload: "Download",
    updateDetails: "Changelog",
    updateCheck: "Check for updates",
    updateUpToDate: "v{0} — up to date",
    updateFailed: "Update check failed",

    promptPlaceholder: "Prompt — type __ for wildcards (e.g. __pmp/act*__)",
    browseOptions: "Browse options",
    typePlaceholder: "Type…",
    send: "Send",

    backendUrl: "Backend URL",
    backendUrlHint: "Leave empty = same origin (backend-served GUI)",
    chatModel: "Chat model",
    backendGguf: "GGUF (local)",
    backendHf: "HF Transformers",
    model: "Model",
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
    addImage: "Add image",
    output: "Output",
    thinkingStatus: "Qwen is thinking…",
    errorPrefix: "Error: {0}",
  },

  it: {
    appName: "ForgeHub",
    tagline: "Hub per workflow ComfyUI",
    language: "Lingua",

    execute: "Genera",
    outputsTitle: "Output",
    promptAssist: "Assist prompt",
    settings: "Impostazioni",
    library: "Libreria",
    jobsGenerating: "in generazione",
    jobsQueued: "in coda / cold start",
    stop: "Stop",
    loadingWorkflows: "Caricamento workflow…",
    outputsEmpty: "I media generati\nappaiono qui",

    searchWorkflows: "Cerca workflow…",
    noWorkflows: "Nessun workflow in questa categoria.",
    categories: { agent: "Agent", video: "Video", image: "Immagine", audio: "Audio", other: "Altro" },

    secPrompt: "Prompt",
    secEnhancer: "Enhancer (QwenVL)",
    secGeneration: "Generazione",
    secPost: "Post-processing",
    secParameters: "Parametri",
    enhancerBadge: "il prompt passa da QwenVL-Mod",
    history: "Cronologia",
    historyLoading: "Caricamento…",
    historyEmpty: "Nessun prompt salvato negli output",
    noPrompt: "(nessun prompt)",
    promptTrace: "Traccia prompt",
    traceFills: "si popola a fine generazione",
    traceBody: "Qui compaiono il prompt espanso (wildcard) e quello finale QwenVL.",
    uploadVideo: "Carica video",
    changeVideo: "Cambia",
    noParams: "Nessun parametro dichiarato nel .meta.json di questo workflow.",

    selectMultiple: "Selezione multipla",
    exitSelection: "Esci dalla selezione",
    selectAll: "Seleziona tutto",
    deselectAll: "Deseleziona tutto",
    download: "Scarica",
    cancel: "Annulla",
    delete: "Elimina",
    deleting: "Eliminazione…",
    useAsInput: "Usa come immagine di input",
    outputsEmptyLib: "Gli output generati appariranno qui.",
    previous: "Precedente (←)",
    next: "Successivo (→)",
    capturing: "Cattura…",
    setCurrentFrame: "Usa frame corrente",
    setLastFrame: "Usa ultimo frame come riferimento",
    useAsRef: "Usa come riferimento",

    runpodServerless: "RunPod Serverless",
    apiKey: "API Key",
    apiKeySet: "(impostata — vuoto = mantieni)",
    getApiKey: "Ottieni la tua API key →",
    endpointId: "Endpoint ID",
    detect: "Rileva dall'account",
    detecting: "Rilevamento…",
    noEndpoints: "Nessun endpoint trovato su questo account",
    pickEndpoint: "— scegli un endpoint —",
    chatLlm: "Chat (LLM)",
    service: "Servizio",
    openaiCompat: "Endpoint OpenAI-compatible",
    selectModel: "— scegli un modello —",
    customModel: "Custom (scrivi a mano)",
    saveKeyHint: "Salva la API key qui sotto per elencare i modelli.",
    s3Section: "Storage output (S3)",
    s3Hint: "Serve per scaricare i video grandi — vengono caricati sul network volume dell'endpoint. Le credenziali si creano nella console RunPod.",
    s3AccessId: "S3 Access ID",
    s3AccessSecret: "S3 Access Secret",
    s3Volume: "Network volume ID",
    s3Datacenter: "Datacenter",
    save: "Salva",
    saving: "Salvataggio…",
    updateAvailable: "ForgeHub v{0} disponibile",
    updateDownload: "Scarica",
    updateDetails: "Novità",
    updateCheck: "Controlla aggiornamenti",
    updateUpToDate: "v{0} — aggiornato",
    updateFailed: "Controllo aggiornamenti fallito",

    promptPlaceholder: "Prompt — scrivi __ per le wildcard (es. __pmp/act*__)",
    browseOptions: "Sfoglia opzioni",
    typePlaceholder: "Scrivi…",
    send: "Invia",

    backendUrl: "URL backend",
    backendUrlHint: "Lascia vuoto = stessa origine (GUI servita dal backend)",
    chatModel: "Modello chat",
    backendGguf: "GGUF (locale)",
    backendHf: "HF Transformers",
    model: "Modello",
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
    addImage: "Aggiungi immagine",
    output: "Output",
    thinkingStatus: "Qwen sta pensando…",
    errorPrefix: "Errore: {0}",
  },

  es: {
    appName: "ForgeHub",
    tagline: "Hub de workflows ComfyUI",
    language: "Idioma",

    execute: "Generar",
    outputsTitle: "Salidas",
    promptAssist: "Asistente de prompt",
    settings: "Ajustes",
    library: "Biblioteca",
    jobsGenerating: "generando",
    jobsQueued: "en cola / cold start",
    stop: "Detener",
    loadingWorkflows: "Cargando workflows…",
    outputsEmpty: "Los medios generados\naparecen aquí",

    searchWorkflows: "Buscar workflows…",
    noWorkflows: "No hay workflows en esta categoría.",
    categories: { agent: "Agente", video: "Vídeo", image: "Imagen", audio: "Audio", other: "Otro" },

    secPrompt: "Prompt",
    secEnhancer: "Enhancer (QwenVL)",
    secGeneration: "Generación",
    secPost: "Post-procesado",
    secParameters: "Parámetros",
    enhancerBadge: "el prompt pasa por QwenVL-Mod",
    history: "Historial",
    historyLoading: "Cargando…",
    historyEmpty: "No hay prompts guardados en las salidas",
    noPrompt: "(sin prompt)",
    promptTrace: "Traza del prompt",
    traceFills: "se rellena al terminar",
    traceBody: "Aquí aparecen el prompt expandido (wildcards) y el final de QwenVL.",
    uploadVideo: "Subir vídeo",
    changeVideo: "Cambiar",
    noParams: "No hay parámetros declarados en el .meta.json de este workflow.",

    selectMultiple: "Selección múltiple",
    exitSelection: "Salir de la selección",
    selectAll: "Seleccionar todo",
    deselectAll: "Deseleccionar todo",
    download: "Descargar",
    cancel: "Cancelar",
    delete: "Eliminar",
    deleting: "Eliminando…",
    useAsInput: "Usar como imagen de entrada",
    outputsEmptyLib: "Las salidas generadas aparecerán aquí.",
    previous: "Anterior (←)",
    next: "Siguiente (→)",
    capturing: "Capturando…",
    setCurrentFrame: "Usar fotograma actual",
    setLastFrame: "Usar último fotograma como referencia",
    useAsRef: "Usar como referencia",

    runpodServerless: "RunPod Serverless",
    apiKey: "API Key",
    apiKeySet: "(guardada — vacío = mantener)",
    getApiKey: "Obtén tu API key →",
    endpointId: "Endpoint ID",
    detect: "Detectar desde la cuenta",
    detecting: "Detectando…",
    noEndpoints: "No se encontraron endpoints en esta cuenta",
    pickEndpoint: "— elige un endpoint —",
    chatLlm: "Chat (LLM)",
    service: "Servicio",
    openaiCompat: "Endpoint compatible con OpenAI",
    selectModel: "— elige un modelo —",
    customModel: "Personalizado (escríbelo)",
    saveKeyHint: "Guarda la API key abajo para listar los modelos.",
    s3Section: "Almacenamiento de salida (S3)",
    s3Hint: "Necesario para descargar salidas de video grandes — se suben al network volume del endpoint. Crea las credenciales en la consola de RunPod.",
    s3AccessId: "S3 Access ID",
    s3AccessSecret: "S3 Access Secret",
    s3Volume: "Network volume ID",
    s3Datacenter: "Datacenter",
    save: "Guardar",
    saving: "Guardando…",
    updateAvailable: "ForgeHub v{0} disponible",
    updateDownload: "Descargar",
    updateDetails: "Novedades",
    updateCheck: "Buscar actualizaciones",
    updateUpToDate: "v{0} — actualizado",
    updateFailed: "Error al buscar actualizaciones",

    promptPlaceholder: "Prompt — escribe __ para wildcards (ej. __pmp/act*__)",
    browseOptions: "Ver opciones",
    typePlaceholder: "Escribe…",
    send: "Enviar",

    backendUrl: "URL del backend",
    backendUrlHint: "Vacío = mismo origen (GUI servida por el backend)",
    chatModel: "Modelo de chat",
    backendGguf: "GGUF (local)",
    backendHf: "HF Transformers",
    model: "Modelo",
    maxTokens: "Max tokens",
    temperature: "Temperatura",
    enableThinking: "Activar thinking",
    noWorkflowSelected: "Ningún workflow seleccionado",
    welcomeTitle: "Hola, soy ForgeHub",
    welcomeBody: "Selecciona un workflow y dime qué hacer. Puedo ajustar parámetros y ejecutarlo en ComfyUI.",
    userInitial: "U",
    assistantInitial: "Q",
    thinking: "Pensando",
    placeholder: "ej. pon 25 steps y lanza el workflow...",
    addImage: "Añadir imagen",
    output: "Salida",
    thinkingStatus: "Qwen está pensando…",
    errorPrefix: "Error: {0}",
  },
};

export function format(template: string, ...args: unknown[]): string {
  return template.replace(/\{(\d+)\}/g, (_, index) => String(args[Number(index)] ?? ""));
}

interface LangCtx {
  lang: Language;
  setLang: (l: Language) => void;
}

export const LangContext = createContext<LangCtx>({ lang: "en", setLang: () => {} });

export const useLang = () => useContext(LangContext);
export const useT = (): Translations => translations[useLang().lang] ?? translations.en;
