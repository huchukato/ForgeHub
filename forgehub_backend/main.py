"""FastAPI entry point for ForgeHub backend."""

import base64
import json
from contextlib import asynccontextmanager
from pathlib import Path
from typing import Any

import copy

from fastapi import FastAPI, File, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import Response
from fastapi.staticfiles import StaticFiles

from forgehub_backend.chat_proxy import CHAT_PROXY
from forgehub_backend.comfy_client import COMFY_CLIENT
from forgehub_backend.config import SETTINGS
from forgehub_backend.executor import execute_workflow, wait_for_outputs
from forgehub_backend.files import read_output_file, save_uploaded_image
from forgehub_backend.ui_to_api import convert_ui_to_api
from forgehub_backend.models import (
    ChatRequest,
    ChatResponse,
    ExecuteRequest,
    ExecuteResponse,
    ExecutionStatus,
    WorkflowListResponse,
    WorkflowMeta,
)
from forgehub_backend.workflow_catalog import WorkflowCatalog


@asynccontextmanager
async def lifespan(app: FastAPI):
    catalog = WorkflowCatalog()
    app.state.catalog = catalog
    try:
        yield
    finally:
        await COMFY_CLIENT.close()
        await CHAT_PROXY.close()


app = FastAPI(
    title="ForgeHub",
    description="Frontend hub for ComfyUI workflows.",
    version="0.1.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=SETTINGS.cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


def _get_catalog() -> WorkflowCatalog:
    return app.state.catalog


async def _resolve_prompt(workflow: dict[str, Any], meta: WorkflowMeta) -> dict[str, Any]:
    """Return an API-format prompt, converting UI-format workflows on the fly."""
    if meta.format != "ui":
        return workflow
    try:
        object_info = await COMFY_CLIENT.object_info()
    except Exception as exc:
        raise HTTPException(status_code=503, detail=f"ComfyUI object_info unavailable: {exc}")
    try:
        return convert_ui_to_api(workflow, object_info)
    except Exception as exc:
        raise HTTPException(status_code=422, detail=f"Cannot convert UI workflow to API format: {exc}")


def _looks_like_base64(value: str) -> bool:
    try:
        base64.b64decode(value, validate=True)
        return True
    except Exception:
        return False


def _resolve_chat_images(images: list[str]) -> list[str]:
    """Replace upload filenames with base64 payloads; data:/base64 pass through."""
    resolved = []
    for item in images:
        if item.startswith("data:") or _looks_like_base64(item):
            resolved.append(item)
            continue
        try:
            data = read_output_file(item, "", "input")
        except FileNotFoundError:
            raise HTTPException(status_code=400, detail=f"Image not found: {item}")
        resolved.append(base64.b64encode(data).decode("ascii"))
    return resolved


# Node types that carry no user-editable widgets — skip from the chat graph.
_CHAT_SKIP_TYPES = {"Note", "MarkdownNote", "Reroute", "PrimitiveNode"}

# LiteGraph modes: 0=normal, 2=bypassed, 4=muted.
_CHAT_MODES = {0: None, 2: "bypassed", 4: "muted"}


def _widget_options_from_object_info(
    class_type: str, widget_name: str, object_info: dict[str, Any]
) -> list[str] | None:
    """Return the allowed values for a combo widget, or None."""
    info = object_info.get(class_type)
    if not isinstance(info, dict):
        return None
    input_spec = info.get("input") or {}
    for section in ("required", "optional"):
        entries = input_spec.get(section) or {}
        spec = entries.get(widget_name)
        if spec is None:
            continue
        # spec is [type_or_choices, config?]. Combo specs have a list as first element.
        if isinstance(spec, (list, tuple)) and spec:
            head = spec[0]
            if isinstance(head, (list, tuple)):
                return [str(v) for v in head]
    return None


def _build_chat_graph(
    workflow: dict[str, Any], object_info: dict[str, Any] | None = None
) -> dict[str, Any]:
    """Build a node snapshot for the chat model.

    Handles both UI format (nodes list with widgets_values_named) and API
    format (node_id -> class_type/inputs). Includes combo options from
    object_info when available so the model knows valid widget values.
    """
    object_info = object_info or {}
    graph: dict[str, Any] = {"nodes": []}

    if isinstance(workflow.get("nodes"), list):
        # UI format — each entry has id, type, title, mode, widgets_values_named.
        for node in workflow["nodes"]:
            if not isinstance(node, dict):
                continue
            ntype = str(node.get("type") or "")
            if ntype in _CHAT_SKIP_TYPES:
                continue
            mode = _CHAT_MODES.get(node.get("mode", 0))
            entry: dict[str, Any] = {
                "id": node.get("id"),
                "type": ntype,
            }
            if node.get("title"):
                entry["title"] = node["title"]
            if mode:
                entry["mode"] = mode
            widgets = []
            wvn = node.get("widgets_values_named")
            if isinstance(wvn, dict):
                for k, v in wvn.items():
                    if isinstance(v, (str, int, float, bool)):
                        w: dict[str, Any] = {"name": k, "value": v}
                        options = _widget_options_from_object_info(ntype, k, object_info)
                        if options:
                            w["options"] = {"values": options}
                        widgets.append(w)
            entry["widgets"] = widgets
            graph["nodes"].append(entry)
        return graph

    # API format — keys are node IDs, values have class_type/inputs.
    for node_id, node in workflow.items():
        if not isinstance(node, dict):
            continue
        graph["nodes"].append({
            "id": node_id,
            "type": node.get("class_type", ""),
            "widgets": [
                {"name": k, "value": v}
                for k, v in node.get("inputs", {}).items()
                if isinstance(v, (str, int, float, bool))
            ],
        })
    return graph


@app.get("/health")
async def health():
    return {"status": "ok"}


@app.get("/config")
async def config():
    return {
        "comfy_url": SETTINGS.comfy_url,
        "workflow_dir": str(SETTINGS.workflow_dir),
        "max_upload_mb": SETTINGS.max_upload_mb,
        "max_chat_images": SETTINGS.max_chat_images,
        "max_image_pixels": SETTINGS.max_image_pixels,
    }


@app.get("/workflows")
async def list_workflows() -> WorkflowListResponse:
    catalog = _get_catalog()
    return WorkflowListResponse(workflows=catalog.list_workflows())


@app.get("/workflows/{workflow_id}")
async def get_workflow(workflow_id: str) -> WorkflowMeta:
    catalog = _get_catalog()
    result = catalog.get_workflow(workflow_id)
    if result is None:
        raise HTTPException(status_code=404, detail="Workflow not found")
    return result[1]


@app.get("/workflows/{workflow_id}/raw")
async def get_workflow_raw(workflow_id: str):
    catalog = _get_catalog()
    result = catalog.get_workflow(workflow_id)
    if result is None:
        raise HTTPException(status_code=404, detail="Workflow not found")
    return result[0]


@app.get("/chat/models")
async def chat_models():
    try:
        return await CHAT_PROXY.models()
    except Exception as exc:
        raise HTTPException(status_code=503, detail=f"ComfyUI chat unavailable: {exc}")


@app.post("/chat")
async def chat(request: ChatRequest) -> ChatResponse:
    catalog = _get_catalog()
    graph = None
    if request.workflow_id:
        result = catalog.get_workflow(request.workflow_id)
        if result is None:
            raise HTTPException(status_code=404, detail="Workflow not found")
        workflow, meta = result
        object_info = None
        try:
            object_info = await COMFY_CLIENT.object_info()
        except Exception:
            pass
        graph = _build_chat_graph(workflow, object_info)
    if request.images:
        request = request.model_copy(update={"images": _resolve_chat_images(request.images)})
    try:
        return await CHAT_PROXY.chat(request, graph)
    except Exception as exc:
        raise HTTPException(status_code=503, detail=f"Chat request failed: {exc}")


@app.post("/upload")
async def upload_image(file: UploadFile = File(...)):
    if not file.content_type or not file.content_type.startswith("image/"):
        raise HTTPException(status_code=400, detail="Only image uploads are supported")
    data = await file.read()
    if len(data) > SETTINGS.max_upload_mb * 1024 * 1024:
        raise HTTPException(status_code=413, detail="Image too large")
    b64 = base64.b64encode(data).decode("ascii")
    filename = save_uploaded_image(b64, file.filename or "upload.png")
    return {"filename": filename, "url": f"/outputs/{filename}?type=input"}


@app.post("/execute")
async def execute(request: ExecuteRequest) -> ExecuteResponse:
    catalog = _get_catalog()
    result = catalog.get_workflow(request.workflow_id)
    if result is None:
        raise HTTPException(status_code=404, detail="Workflow not found")
    workflow, meta = result
    workflow = await _resolve_prompt(workflow, meta)
    try:
        exec_result = await execute_workflow(workflow, request.parameters, client_id=request.client_id)
        return ExecuteResponse(prompt_id=exec_result.prompt_id, status=exec_result.status)
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Execution failed: {exc}")


@app.get("/execute/{prompt_id}/status")
async def execution_status(prompt_id: str, client_id: str | None = None) -> ExecutionStatus:
    try:
        used_client_id = client_id or prompt_id
        return await wait_for_outputs(COMFY_CLIENT, prompt_id, used_client_id)
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Status check failed: {exc}")


@app.get("/outputs/{filename}")
async def output_proxy(filename: str, subfolder: str = "", type: str = "output"):
    try:
        data = read_output_file(filename, subfolder, type)
        content_type = "application/octet-stream"
        if filename.lower().endswith((".png", ".jpg", ".jpeg", ".webp", ".gif")):
            content_type = "image/" + filename.split(".")[-1].lower()
        elif filename.lower().endswith((".mp4", ".webm", ".mov")):
            content_type = "video/" + filename.split(".")[-1].lower()
        elif filename.lower().endswith((".mp3", ".wav", ".ogg", ".flac")):
            content_type = "audio/" + filename.split(".")[-1].lower()
        return Response(content=data, media_type=content_type)
    except FileNotFoundError:
        raise HTTPException(status_code=404, detail="Output not found")


@app.post("/chat/actions")
async def apply_chat_actions(payload: dict[str, Any]):
    """Apply validated actions from chat response to a workflow and optionally execute."""
    workflow_id = payload.get("workflow_id")
    actions = payload.get("actions", [])
    if not workflow_id or not actions:
        raise HTTPException(status_code=400, detail="workflow_id and actions are required")

    catalog = _get_catalog()
    result = catalog.get_workflow(workflow_id)
    if result is None:
        raise HTTPException(status_code=404, detail="Workflow not found")
    workflow, meta = result
    workflow = await _resolve_prompt(workflow, meta)
    workflow = copy.deepcopy(workflow)

    parameters = {}
    should_queue = False
    for action in actions:
        action_type = action.get("type")
        if action_type == "set_widget_value":
            node_id = action.get("node_id")
            widget = action.get("widget")
            value = action.get("value")
            if node_id is not None and widget:
                parameters[f"{node_id}:{widget}"] = value
        elif action_type == "set_node_mode":
            pass
        elif action_type == "queue_workflow":
            should_queue = True

    if not should_queue:
        return {"status": "patched", "parameters": parameters}

    exec_result = await execute_workflow(workflow, parameters)
    return {
        "status": exec_result.status,
        "prompt_id": exec_result.prompt_id,
        "parameters": parameters,
        "outputs": [out.model_dump() for out in exec_result.outputs],
        "error": exec_result.error,
    }


# Serve the built ForgeHub frontend last, so API routes keep precedence.
_frontend_dir = Path(SETTINGS.frontend_dir) if SETTINGS.frontend_dir else None
if _frontend_dir and _frontend_dir.is_dir() and (_frontend_dir / "index.html").exists():
    app.mount("/", StaticFiles(directory=str(_frontend_dir), html=True), name="frontend")


if __name__ == "__main__":
    import uvicorn
    uvicorn.run("forgehub_backend.main:app", host=SETTINGS.app_host, port=SETTINGS.app_port, log_level=SETTINGS.log_level.lower())
