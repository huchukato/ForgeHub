export interface WorkflowParam {
  key: string;
  label?: string;
  type?: string; // text | int | float | select | images | video
  target?: string; // "job" | "node:<id>:<widget>"
  options?: string[];
  max?: number;
  default?: unknown;
  wildcard_prefix?: string;
  parent?: string;
}

export interface Workflow {
  id: string;
  name: string;
  category: string;
  description: string;
  tags: string[];
  parameters: WorkflowParam[];
  outputs: string[];
  handler?: string;
}

export interface ChatChoice {
  label: string;
  send: string;
}

export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
  thinking?: string;
  choices?: ChatChoice[];
  error?: boolean;
}

export interface ChatOptions {
  backend?: string;
  model?: string;
  max_tokens?: number;
  temperature?: number;
  thinking?: boolean;
}

export interface ChatResult {
  thinking: string;
  message: string;
  actions: Array<Record<string, unknown>>;
  choices?: ChatChoice[];
}

export interface ExecuteResult {
  prompt_id: string;
  status: string;
}

export interface OutputFile {
  filename: string;
  subfolder: string;
  type: string;
  url: string;
  thumb?: string;
  size?: number;
  mtime?: number;
}

export interface OutputMetaEntry {
  filename: string;
  subfolder: string;
  workflow: string;
  prompt: string;
  prompt_expanded?: string;
  parameters: Record<string, unknown>;
  texts: Record<string, string>;
  created: string;
}

export interface RunpodEndpoint {
  id: string;
  name: string;
  gpus: string;
  workers?: number;
}

export interface ForgeHubSettings {
  runpod_endpoint_id: string;
  runpod_api_key_set: boolean;
  chat_llm_url: string;
  chat_llm_model: string;
  chat_llm_key_set: boolean;
  runpod_s3_access_id_set: boolean;
  runpod_s3_access_secret_set: boolean;
  runpod_s3_bucket: string;
  runpod_s3_datacenter: string;
}

export interface ExecutionStatus {
  prompt_id: string;
  status: string;
  outputs: OutputFile[];
  texts?: Record<string, string>;
  error?: string;
  remote_status?: string;
  elapsed_ms?: number;
}

export class ForgeHubClient {
  // Empty baseUrl = same-origin relative URLs (GUI served by the backend itself).
  private baseUrl: string;

  constructor(baseUrl: string = "") {
    this.baseUrl = baseUrl.replace(/\/+$/, "");
  }

  // Media URLs come back relative ("/outputs/...") — absolutize them so they
  // also work when the UI is loaded from file:// in the packaged app.
  abs(url: string): string {
    return url.startsWith("/") ? `${this.baseUrl}${url}` : url;
  }

  private absOutputs(outputs: OutputFile[] | undefined): OutputFile[] {
    return (outputs ?? []).map((o) => ({
      ...o,
      url: this.abs(o.url),
      thumb: o.thumb ? this.abs(o.thumb) : o.thumb,
    }));
  }

  private async request<T>(path: string, init?: RequestInit): Promise<T> {
    const response = await fetch(`${this.baseUrl}${path}`, {
      ...init,
      headers: {
        "Content-Type": "application/json",
        ...init?.headers,
      },
    });
    if (!response.ok) {
      const text = await response.text();
      throw new Error(`${response.status}: ${text}`);
    }
    return response.json() as Promise<T>;
  }

  async getConfig() {
    return this.request<{
      workflow_dir: string;
      chat_enabled?: boolean;
    }>("/config");
  }

  async getSettings(): Promise<ForgeHubSettings> {
    return this.request<ForgeHubSettings>("/settings");
  }

  async saveSettings(
    body: Partial<ForgeHubSettings> & {
      runpod_api_key?: string;
      chat_llm_key?: string;
      runpod_s3_access_id?: string;
      runpod_s3_access_secret?: string;
    }
  ): Promise<ForgeHubSettings> {
    return this.request<ForgeHubSettings>("/settings", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  }

  async getRunpodEndpoints(apiKey?: string): Promise<RunpodEndpoint[]> {
    const qs = apiKey ? `?api_key=${encodeURIComponent(apiKey)}` : "";
    const data = await this.request<{ endpoints: RunpodEndpoint[] }>(`/runpod/endpoints${qs}`);
    return data.endpoints;
  }

  async listWildcards(): Promise<string[]> {
    const data = await this.request<{ wildcards: string[] }>("/wildcards");
    return data.wildcards;
  }
  async listWildcardValues(key: string): Promise<string[]> {
    const data = await this.request<{ values: string[] }>(`/wildcards/values?key=${encodeURIComponent(key)}`);
    return data.values;
  }

  async listOutputs(): Promise<OutputFile[]> {
    const data = await this.request<{ outputs: OutputFile[] }>("/outputs");
    return this.absOutputs(data.outputs);
  }

  async listOutputMeta(limit = 30): Promise<OutputMetaEntry[]> {
    const data = await this.request<{ entries: OutputMetaEntry[] }>(`/outputs/meta?limit=${limit}`);
    return data.entries;
  }

  async deleteOutput(o: OutputFile): Promise<void> {
    const qs = o.subfolder ? `?subfolder=${encodeURIComponent(o.subfolder)}` : "";
    await this.request(`/outputs/${encodeURIComponent(o.filename)}${qs}`, { method: "DELETE" });
  }

  async listWorkflows(): Promise<Workflow[]> {
    const data = await this.request<{ workflows: Workflow[] }>("/workflows");
    return data.workflows;
  }

  async getChatModels(): Promise<{ hf: string[]; gguf: string[] }> {
    return this.request<{ hf: string[]; gguf: string[] }>("/chat/models");
  }

  async getProviderModels(url: string): Promise<string[]> {
    const data = await this.request<{ models: string[] }>(
      `/chat/provider-models?url=${encodeURIComponent(url)}`
    );
    return data.models;
  }

  async getWorkflowRaw(id: string): Promise<Record<string, unknown>> {
    return this.request<Record<string, unknown>>(`/workflows/${id}/raw`);
  }

  async chat(
    messages: ChatMessage[],
    options: ChatOptions = {},
    workflowId?: string,
    images: string[] = []
  ): Promise<ChatResult> {
    return this.request<ChatResult>("/chat", {
      method: "POST",
      body: JSON.stringify({
        backend: options.backend || "gguf",
        model: options.model || "",
        messages,
        workflow_id: workflowId,
        images,
        options: {
          max_tokens: options.max_tokens ?? 1024,
          temperature: options.temperature ?? 0.2,
          thinking: options.thinking ?? false,
        },
      }),
    });
  }

  async executeActions(
    workflowId: string,
    actions: Array<Record<string, unknown>>
  ): Promise<{ status: string; prompt_id?: string; outputs?: OutputFile[]; error?: string }> {
    const data = await this.request<{
      status: string;
      prompt_id?: string;
      outputs?: OutputFile[];
      error?: string;
    }>("/chat/actions", {
      method: "POST",
      body: JSON.stringify({ workflow_id: workflowId, actions }),
    });
    return { ...data, outputs: this.absOutputs(data.outputs) };
  }

  async executeWorkflow(
    workflowId: string,
    parameters: Record<string, unknown> = {},
    images: string[] = [],
    video?: string
  ): Promise<ExecuteResult> {
    return this.request<ExecuteResult>("/execute", {
      method: "POST",
      body: JSON.stringify({
        workflow_id: workflowId,
        parameters,
        images,
        video: video ?? null,
      }),
    });
  }

  async getExecutionStatus(
    promptId: string,
    clientId?: string
  ): Promise<ExecutionStatus> {
    const params = clientId ? `?client_id=${encodeURIComponent(clientId)}` : "";
    const data = await this.request<ExecutionStatus>(`/execute/${promptId}/status${params}`);
    return { ...data, outputs: this.absOutputs(data.outputs) };
  }

  async cancelExecution(promptId: string): Promise<void> {
    await this.request(`/execute/${promptId}/cancel`, { method: "POST" });
  }

  async uploadImage(file: File): Promise<{ filename: string; url: string }> {
    const form = new FormData();
    form.append("file", file);
    const response = await fetch(`${this.baseUrl}/upload`, {
      method: "POST",
      body: form,
    });
    if (!response.ok) {
      const text = await response.text();
      throw new Error(`${response.status}: ${text}`);
    }
    const data = (await response.json()) as { filename: string; url: string };
    return { ...data, url: this.abs(data.url) };
  }
}
