"""Pydantic models for ForgeHub API."""

from typing import Any

from pydantic import BaseModel, Field


class WorkflowParameter(BaseModel):
    key: str
    label: str = ""
    type: str = "text"  # text | int | float | select | images | video
    target: str = "job"  # "job" | "node:<id>:<widget>" | "prompt" (appended to prompt)
    options: list[str] = Field(default_factory=list)
    max: int | None = None
    default: Any = None


class WorkflowMeta(BaseModel):
    id: str
    name: str
    category: str = "other"
    description: str = ""
    tags: list[str] = Field(default_factory=list)
    parameters: list[dict[str, Any]] = Field(default_factory=list)
    outputs: list[str] = Field(default_factory=list)
    format: str = "api"
    handler: str = ""
    remote_file: str = ""
    endpoint_id: str = ""  # optional RunPod endpoint override (multi-image setups)
    endpoint_name: str = ""  # name pattern resolved to a live endpoint id at submit time
    requires_endpoint: bool = False  # set when meta declares endpoint_id (even empty): hidden until configured
    bypass_groups: dict[str, list[str]] = Field(default_factory=dict)  # group name → node ids removed when enable_<name>="off"


class WorkflowListResponse(BaseModel):
    workflows: list[WorkflowMeta]


class ChatMessage(BaseModel):
    role: str
    content: str


class ChatRequest(BaseModel):
    backend: str = "gguf"
    model: str = ""
    messages: list[ChatMessage]
    workflow_id: str | None = None
    images: list[str] = Field(default_factory=list)
    options: dict[str, Any] = Field(default_factory=dict)


class ChatChoice(BaseModel):
    label: str
    send: str


class ChatResponse(BaseModel):
    thinking: str = ""
    message: str = ""
    actions: list[dict[str, Any]] = Field(default_factory=list)
    choices: list[ChatChoice] = Field(default_factory=list)


class ExecuteRequest(BaseModel):
    workflow_id: str
    parameters: dict[str, Any] = Field(default_factory=dict)
    images: list[str] = Field(default_factory=list)
    video: str | None = None
    extra_data: dict[str, Any] = Field(default_factory=dict)
    client_id: str | None = None


class ExecuteResponse(BaseModel):
    prompt_id: str
    status: str


class OutputFile(BaseModel):
    filename: str
    subfolder: str
    type: str
    url: str


class ExecutionStatus(BaseModel):
    prompt_id: str
    status: str
    outputs: list[OutputFile] = Field(default_factory=list)
    texts: dict[str, str] = Field(default_factory=dict)  # node_id → ShowText content (prompt trace)
    error: str | None = None
    remote_status: str | None = None
    elapsed_ms: int | None = None
