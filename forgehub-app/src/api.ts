export interface Workflow {
  id: string;
  name: string;
  category: string;
  description: string;
  tags: string[];
  parameters: Array<Record<string, unknown>>;
  outputs: string[];
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
}

export interface ExecutionStatus {
  prompt_id: string;
  status: string;
  outputs: OutputFile[];
  error?: string;
}

export class ForgeHubClient {
  // Empty baseUrl = same-origin relative URLs (GUI served by the backend itself).
  private baseUrl: string;

  constructor(baseUrl: string = "") {
    this.baseUrl = baseUrl.replace(/\/+$/, "");
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
    return this.request<{ comfy_url: string; workflow_dir: string }>("/config");
  }

  async listWorkflows(): Promise<Workflow[]> {
    const data = await this.request<{ workflows: Workflow[] }>("/workflows");
    return data.workflows;
  }

  async getChatModels(): Promise<{ hf: string[]; gguf: string[] }> {
    return this.request<{ hf: string[]; gguf: string[] }>("/chat/models");
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
    return this.request("/chat/actions", {
      method: "POST",
      body: JSON.stringify({ workflow_id: workflowId, actions }),
    });
  }

  async executeWorkflow(
    workflowId: string,
    parameters: Record<string, unknown> = {}
  ): Promise<ExecuteResult> {
    return this.request<ExecuteResult>("/execute", {
      method: "POST",
      body: JSON.stringify({ workflow_id: workflowId, parameters }),
    });
  }

  async getExecutionStatus(
    promptId: string,
    clientId?: string
  ): Promise<ExecutionStatus> {
    const params = clientId ? `?client_id=${encodeURIComponent(clientId)}` : "";
    return this.request<ExecutionStatus>(`/execute/${promptId}/status${params}`);
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
    return response.json();
  }
}
