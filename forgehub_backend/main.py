"""FastAPI entry point for ForgeHub backend."""

import base64
import json
import re
import time
from contextlib import asynccontextmanager
from urllib.parse import quote
from pathlib import Path
from typing import Any

import copy

from fastapi import FastAPI, File, HTTPException, Request, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import Response
from fastapi.staticfiles import StaticFiles

from forgehub_backend.chat_proxy import CHAT_PROXY
from forgehub_backend.config import SETTINGS
from forgehub_backend.executor import get_backend
from forgehub_backend.files import (
    delete_output_file,
    read_output_file,
    save_uploaded_b64,
    save_uploaded_image,
    thumbnail_path,
)
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
    app.state.backend = get_backend()
    try:
        yield
    finally:
        await CHAT_PROXY.close()
        backend = getattr(app.state, "backend", None)
        client = getattr(backend, "client", None)
        if client is not None and hasattr(client, "close"):
            await client.close()


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
        "workflow_dir": str(SETTINGS.workflow_dir),
        "max_upload_mb": SETTINGS.max_upload_mb,
        "max_chat_images": SETTINGS.max_chat_images,
        "max_image_pixels": SETTINGS.max_image_pixels,
        "chat_enabled": bool(SETTINGS.chat_llm_url or SETTINGS.chat_base_url),
    }


@app.get("/settings")
async def get_settings():
    return {
        "runpod_endpoint_id": SETTINGS.runpod_endpoint_id,
        "runpod_api_key_set": bool(SETTINGS.runpod_api_key),
        "chat_llm_url": SETTINGS.chat_llm_url,
        "chat_llm_model": SETTINGS.chat_llm_model,
        "chat_llm_key_set": bool(SETTINGS.chat_llm_key),
        "runpod_s3_access_id_set": bool(SETTINGS.runpod_s3_access_id),
        "runpod_s3_access_secret_set": bool(SETTINGS.runpod_s3_access_secret),
        "runpod_s3_bucket": SETTINGS.runpod_s3_bucket,
        "runpod_s3_datacenter": SETTINGS.runpod_s3_datacenter,
    }


@app.put("/settings")
async def put_settings(body: dict):
    from forgehub_backend.config import save_overrides
    save_overrides(body)
    # Rebuild the execution backend so the new credentials/endpoint apply
    # without a restart.
    app.state.backend = get_backend()
    return await get_settings()


async def _resolve_endpoint_id(meta) -> str:
    if meta.endpoint_id:
        return meta.endpoint_id
    if not meta.endpoint_name:
        return ""
    from forgehub_backend.runpod_client import list_endpoints
    try:
        eps = await list_endpoints()
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"Cannot resolve endpoint '{meta.endpoint_name}': {exc}")
    matches = [e for e in eps if meta.endpoint_name.lower() in e.get("name", "").lower()]
    if not matches:
        raise HTTPException(status_code=400, detail=f"No RunPod endpoint matching '{meta.endpoint_name}' — deploy the worker from the Hub or set endpoint_id in meta.json")
    matches.sort(key=lambda e: e.get("createdAt", ""), reverse=True)
    return matches[0]["id"]


@app.get("/runpod/endpoints")
async def runpod_endpoints(api_key: str = ""):
    from forgehub_backend.runpod_client import list_endpoints
    try:
        return {"endpoints": await list_endpoints(api_key or None)}
    except RuntimeError as exc:
        raise HTTPException(status_code=502, detail=str(exc))


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


def _chat_unavailable() -> bool:
    return not (SETTINGS.chat_base_url or SETTINGS.chat_llm_url)


@app.get("/chat/models")
async def chat_models():
    if _chat_unavailable():
        raise HTTPException(status_code=503, detail="Chat is disabled (set FORGEHUB_CHAT_LLM_URL or FORGEHUB_CHAT_BASE_URL)")
    try:
        return await CHAT_PROXY.models()
    except Exception as exc:
        raise HTTPException(status_code=503, detail=f"Chat backend unavailable: {exc}")


@app.get("/chat/provider-models")
async def provider_models(url: str):
    """List model ids from an OpenAI-compatible provider (GET {url}/models)."""
    import aiohttp
    base = url.rstrip("/")
    headers = {}
    if SETTINGS.chat_llm_key:
        headers["Authorization"] = f"Bearer {SETTINGS.chat_llm_key}"
    try:
        async with aiohttp.ClientSession(timeout=aiohttp.ClientTimeout(total=15)) as s:
            async with s.get(f"{base}/models", headers=headers) as resp:
                if resp.status != 200:
                    raise HTTPException(status_code=resp.status, detail=f"Provider returned {resp.status}: {await resp.text()}")
                data = await resp.json()
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"Provider unreachable: {exc}")
    ids = [m.get("id") for m in data.get("data", []) if isinstance(m, dict) and m.get("id")]
    return {"models": sorted(ids)}


@app.post("/chat")
async def chat(request: ChatRequest) -> ChatResponse:
    if _chat_unavailable():
        raise HTTPException(status_code=503, detail="Chat is disabled (set FORGEHUB_CHAT_LLM_URL or FORGEHUB_CHAT_BASE_URL)")
    catalog = _get_catalog()
    graph = None
    if request.workflow_id:
        result = catalog.get_workflow(request.workflow_id)
        if result is None:
            raise HTTPException(status_code=404, detail="Workflow not found")
        workflow, meta = result
        graph = _build_chat_graph(workflow)
    if request.images:
        request = request.model_copy(update={"images": _resolve_chat_images(request.images)})
    try:
        return await CHAT_PROXY.chat(request, graph)
    except Exception as exc:
        raise HTTPException(status_code=503, detail=f"Chat request failed: {exc}")


@app.post("/upload")
async def upload_image(file: UploadFile = File(...)):
    ct = file.content_type or ""
    if not (ct.startswith("image/") or ct.startswith("video/")):
        raise HTTPException(status_code=400, detail="Only image/video uploads are supported")
    data = await file.read()
    if len(data) > SETTINGS.max_upload_mb * 1024 * 1024:
        raise HTTPException(status_code=413, detail="File too large")
    if ct.startswith("video/"):
        filename = save_uploaded_b64(base64.b64encode(data).decode("ascii"), file.filename or "upload.mp4")
    else:
        b64 = base64.b64encode(data).decode("ascii")
        filename = save_uploaded_image(b64, file.filename or "upload.png")
    return {"filename": filename, "url": f"/outputs/{filename}?type=input"}


def _split_parameters(request: ExecuteRequest, meta: WorkflowMeta) -> tuple[dict[str, Any], dict[str, Any]]:
    """Split declared form params: target "job" → job input fields, "node:.."
    or undeclared colon keys → graph patches."""
    job_params: dict[str, Any] = {}
    node_params: dict[str, Any] = {}
    prompt_parts: list[str] = []
    prepend_parts: list[str] = []
    targets = {p.get("key"): p.get("target", "job") for p in meta.parameters if isinstance(p, dict)}
    prepends = {p.get("key") for p in meta.parameters if isinstance(p, dict) and p.get("prepend")}
    for key, value in request.parameters.items():
        target = targets.get(key)
        if target == "job":
            job_params[key] = value
        elif target == "prompt":
            if str(value) not in ("", "None"):
                (prepend_parts if key in prepends else prompt_parts).append(
                    re.sub(r"^\[[^\]]*\]\s*-\s*", "", str(value))
                )
        elif target and target.startswith("node:"):
            node_params[target[5:]] = value
        elif ":" in key:
            node_params[key] = value
        else:
            job_params[key] = value
    if prepend_parts or prompt_parts:
        parts = [*prepend_parts]
        if job_params.get("prompt"):
            parts.append(str(job_params["prompt"]).strip())
        if prompt_parts:
            parts.append("\n".join(prompt_parts))
        job_params["prompt"] = "\n\n".join(parts)
    return job_params, node_params


def _expand_wildcards(parameters: dict[str, Any]) -> dict[str, Any]:
    """Expand TagForge-style __wildcards__ and {a|b} groups in string params
    before the job leaves ForgeHub — works identically for direct and
    serverless backends."""
    if not SETTINGS.wildcard_dirs:
        return parameters
    import time
    from forgehub_backend.wildcards import WildcardLoader

    def _expand(value: Any) -> Any:
        if isinstance(value, str) and ("__" in value or ("{" in value and "|" in value)):
            return WildcardLoader.process(value, seed=int(time.time() * 1000) % (2**63))
        return value

    return {key: _expand(value) for key, value in parameters.items()}


@app.get("/wildcards")
async def list_wildcards():
    if not SETTINGS.wildcard_dirs:
        return {"wildcards": []}
    from forgehub_backend.wildcards import WildcardLoader
    return {"wildcards": WildcardLoader.get_wildcards_list()}


@app.get("/wildcards/values")
async def wildcard_values(key: str = ""):
    if not SETTINGS.wildcard_dirs:
        return {"values": []}
    from forgehub_backend.wildcards import WildcardLoader
    key = key.strip().strip("_")
    if not key:
        return {"values": []}
    return {"values": WildcardLoader.get_wildcard_value(key) or []}


@app.post("/execute")
async def execute(request: ExecuteRequest) -> ExecuteResponse:
    # Raw parameters (prompt still carrying __wildcards__) get embedded into the
    # output files as generation metadata — the files are the prompt history.
    raw_parameters = dict(request.parameters or {})
    request = request.model_copy(update={"parameters": _expand_wildcards(request.parameters)})
    catalog = _get_catalog()
    result = catalog.get_workflow(request.workflow_id)
    if result is None:
        raise HTTPException(status_code=404, detail="Workflow not found")
    workflow, meta = result
    if meta.format == "ui":
        raise HTTPException(status_code=422, detail="UI-format workflows are not supported; re-export the workflow in ComfyUI API format.")
    if meta.requires_endpoint and not meta.endpoint_id and not meta.endpoint_name:
        raise HTTPException(status_code=400, detail=f"Workflow '{meta.id}' requires a dedicated RunPod endpoint — set endpoint_id in its meta.json")
    backend = app.state.backend

    job_params, node_params = _split_parameters(request, meta)
    bypass = [
        nid for group, ids in meta.bypass_groups.items()
        if str(job_params.pop(f"enable_{group}", "on")).lower() in ("off", "false", "0")
        for nid in ids
    ]
    job_input: dict[str, Any] = {**request.extra_data, **job_params}
    if bypass:
        job_input["bypass_nodes"] = bypass
    job_input["workflow"] = meta.remote_file or f"{meta.id}.json"
    job_input["job_name"] = f"{meta.id}-{time.strftime('%m%d-%H%M%S')}"
    endpoint_id = await _resolve_endpoint_id(meta)
    if endpoint_id:
        job_input["endpoint_id"] = endpoint_id
    if request.images:
        job_input["images"] = request.images
    if request.video:
        job_input["video"] = request.video

    try:
        job_id = await backend.queue(
            workflow, node_params, job_input, client_id=request.client_id,
            job_meta={"workflow": meta.id, "parameters": raw_parameters,
                      "parameters_expanded": job_params},
        )
        return ExecuteResponse(prompt_id=job_id, status="queued")
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Execution failed: {exc}")


@app.get("/execute/{prompt_id}/status")
async def execution_status(prompt_id: str, client_id: str | None = None) -> ExecutionStatus:
    try:
        return await app.state.backend.status(prompt_id)
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Status check failed: {exc}")


@app.post("/execute/{prompt_id}/cancel")
async def cancel_execution(prompt_id: str):
    backend = app.state.backend
    if not hasattr(backend, "cancel"):
        raise HTTPException(status_code=501, detail="Backend does not support cancellation")
    try:
        await backend.cancel(prompt_id)
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Cancel failed: {exc}")
    return {"ok": True}


@app.get("/outputs")
async def list_outputs():
    base = SETTINGS.storage_dir / "outputs"
    if not base.is_dir():
        return {"outputs": []}
    items = []
    for p in sorted(base.rglob("*"), key=lambda x: x.stat().st_mtime, reverse=True):
        if not p.is_file() or p.name.startswith(".") or p.name.endswith(".meta.json"):
            continue
        rel = p.relative_to(base)
        item = {
            "filename": p.name,
            "subfolder": str(rel.parent) if str(rel.parent) != "." else "",
            "type": "output",
            "url": f"/outputs/{quote(p.name)}" + (f"?subfolder={rel.parent}" if str(rel.parent) != "." else ""),
            "size": p.stat().st_size,
            "mtime": p.stat().st_mtime,
        }
        if p.suffix.lower() in (".mp4", ".webm", ".mov", ".png", ".jpg", ".jpeg", ".webp", ".gif"):
            item["thumb"] = f"/outputs/{quote(p.name)}/thumb" + (
                f"?subfolder={rel.parent}" if str(rel.parent) != "." else ""
            )
        items.append(item)
        if len(items) >= 200:
            break
    return {"outputs": items}


@app.get("/outputs/meta")
async def outputs_meta(limit: int = 30):
    """Prompt history — generation metadata read back from the output files."""
    from forgehub_backend.files import read_output_meta
    base = SETTINGS.storage_dir / "outputs"
    if not base.is_dir():
        return {"entries": []}
    entries = []
    for p in sorted(base.rglob("*"), key=lambda x: x.stat().st_mtime, reverse=True):
        if not p.is_file() or p.name.startswith(".") or p.name.endswith(".meta.json"):
            continue
        meta = read_output_meta(p)
        if not meta:
            continue
        rel = p.relative_to(base)
        params = meta.get("parameters") or {}
        entries.append({
            "filename": p.name,
            "subfolder": str(rel.parent) if str(rel.parent) != "." else "",
            "workflow": meta.get("workflow") or "",
            "prompt": str(params.get("prompt") or ""),
            "prompt_expanded": str(meta.get("prompt_expanded") or ""),
            "parameters": params,
            "texts": meta.get("texts") or {},
            "created": meta.get("created") or "",
        })
        if len(entries) >= limit:
            break
    return {"entries": entries}


@app.get("/outputs/{filename}/meta")
async def output_meta(filename: str, subfolder: str = ""):
    from forgehub_backend.files import output_path, read_output_meta
    try:
        path = output_path(filename, subfolder, "output")
    except FileNotFoundError:
        raise HTTPException(status_code=404, detail="Output not found")
    meta = read_output_meta(path)
    if meta is None:
        raise HTTPException(status_code=404, detail="No embedded metadata")
    return meta


@app.get("/outputs/{filename}")
async def output_proxy(request: Request, filename: str, subfolder: str = "", type: str = "output"):
    try:
        data = read_output_file(filename, subfolder, type)
        content_type = "application/octet-stream"
        if filename.lower().endswith((".png", ".jpg", ".jpeg", ".webp", ".gif")):
            content_type = "image/" + filename.split(".")[-1].lower()
        elif filename.lower().endswith((".mp4", ".webm", ".mov")):
            content_type = "video/" + filename.split(".")[-1].lower()
        elif filename.lower().endswith((".mp3", ".wav", ".ogg", ".flac")):
            content_type = "audio/" + filename.split(".")[-1].lower()
        range_header = request.headers.get("range")
        if range_header and range_header.startswith("bytes="):
            import re
            m = re.match(r"bytes=(\d*)-(\d*)", range_header)
            if m:
                start = int(m.group(1)) if m.group(1) else 0
                end = int(m.group(2)) if m.group(2) else len(data) - 1
                end = min(end, len(data) - 1)
                if start <= end:
                    return Response(
                        content=data[start : end + 1],
                        status_code=206,
                        media_type=content_type,
                        headers={
                            "Content-Range": f"bytes {start}-{end}/{len(data)}",
                            "Accept-Ranges": "bytes",
                            "Content-Length": str(end - start + 1),
                        },
                    )
        return Response(content=data, media_type=content_type, headers={"Accept-Ranges": "bytes"})
    except FileNotFoundError:
        raise HTTPException(status_code=404, detail="Output not found")


@app.get("/outputs/{filename}/thumb")
async def output_thumb(filename: str, subfolder: str = ""):
    try:
        thumb = thumbnail_path(filename, subfolder)
    except FileNotFoundError:
        raise HTTPException(status_code=404, detail="Output not found")
    if thumb is None:
        raise HTTPException(status_code=404, detail="No thumbnail for this file type")
    return Response(content=thumb.read_bytes(), media_type="image/jpeg",
                    headers={"Cache-Control": "private, max-age=3600"})


@app.delete("/outputs/{filename}")
async def delete_output(filename: str, subfolder: str = ""):
    try:
        delete_output_file(filename, subfolder)
    except FileNotFoundError:
        raise HTTPException(status_code=404, detail="Output not found")
    return {"ok": True}


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

    backend = app.state.backend
    job_input = {}
    if SETTINGS.execution_mode == "serverless":
        job_input = {
            "workflow": meta.remote_file or f"{meta.id}.json",
            "job_name": f"{meta.id}-{time.strftime('%m%d-%H%M%S')}",
        }
        ep_id = await _resolve_endpoint_id(meta)
        if ep_id:
            job_input["endpoint_id"] = ep_id
    job_id = await backend.queue(workflow, parameters, job_input)
    return {
        "status": "queued",
        "prompt_id": job_id,
        "parameters": parameters,
    }


# Serve the built ForgeHub frontend last, so API routes keep precedence.
_frontend_dir = Path(SETTINGS.frontend_dir) if SETTINGS.frontend_dir else None
if _frontend_dir and _frontend_dir.is_dir() and (_frontend_dir / "index.html").exists():
    app.mount("/", StaticFiles(directory=str(_frontend_dir), html=True), name="frontend")


if __name__ == "__main__":
    import uvicorn
    uvicorn.run("forgehub_backend.main:app", host=SETTINGS.app_host, port=SETTINGS.app_port, log_level=SETTINGS.log_level.lower())
