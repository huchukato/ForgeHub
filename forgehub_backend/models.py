"""Pydantic models for ForgeHub API."""

from typing import Any

from pydantic import BaseModel, Field


class WorkflowMeta(BaseModel):
    id: str
    name: str
    category: str = "other"
    description: str = ""
    tags: list[str] = Field(default_factory=list)
    parameters: list[dict[str, Any]] = Field(default_factory=list)
    outputs: list[str] = Field(default_factory=list)
    format: str = "api"


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


class ChatResponse(BaseModel):
    thinking: str = ""
    message: str = ""
    actions: list[dict[str, Any]] = Field(default_factory=list)


class ExecuteRequest(BaseModel):
    workflow_id: str
    parameters: dict[str, Any] = Field(default_factory=dict)
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
    error: str | None = None
