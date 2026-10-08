"""Workflow execution against a RunPod serverless endpoint (/run + /status)."""

import base64
import copy
import urllib.parse
from typing import Any

from forgehub_backend.config import SETTINGS
from forgehub_backend.files import read_uploaded_b64, save_output_b64, write_output_meta
from forgehub_backend.models import ExecutionStatus, OutputFile
from forgehub_backend.runpod_client import RunPodClient


def _apply_parameters(workflow: dict[str, Any], parameters: dict[str, Any]) -> dict[str, Any]:
    workflow = copy.deepcopy(workflow)
    for key, value in parameters.items():
        if ":" in key:
            node_id, widget = key.rsplit(":", 1)
        else:
            parts = key.split(".", 1)
            if len(parts) != 2:
                continue
            node_id, widget = parts
        node = workflow.get(node_id)
        if not isinstance(node, dict):
            continue
        inputs = node.setdefault("inputs", {})
        inputs[widget] = value
    return workflow


def _bypass_nodes(prompt: dict[str, Any], node_ids: list[str]) -> dict[str, Any]:
    """Physically remove bypassed-group nodes and rewire consumers.

    ComfyUI ignores "mode" in API format — the UI strips bypassed nodes
    itself before submitting. We do the same: each removed node forwards its
    `pipe` input (or first link input) so surviving downstream links keep a
    live source. Chains of adjacent dead nodes resolve transitively."""
    prompt = copy.deepcopy(prompt)
    dead = {str(n) for n in node_ids}
    through: dict[str, Any] = {}
    for nid in dead:
        inputs = (prompt.get(nid) or {}).get("inputs") or {}
        src = inputs.get("pipe")
        if not isinstance(src, list):
            src = next((v for v in inputs.values() if isinstance(v, list)), None)
        through[nid] = src
    for nid in dead:
        prompt.pop(nid, None)
    for node in prompt.values():
        inputs = node.get("inputs")
        if not isinstance(inputs, dict):
            continue
        for key, val in list(inputs.items()):
            if not (isinstance(val, list) and val and str(val[0]) in dead):
                continue
            out_idx = val[1] if len(val) > 1 else 0
            seen = set()
            while isinstance(val, list) and val and str(val[0]) in dead and str(val[0]) not in seen:
                seen.add(str(val[0]))
                val = through.get(str(val[0]))
            if val is None:
                del inputs[key]
            else:
                inputs[key] = [val[0], out_idx]
    return prompt


def _as_b64(value: str) -> str:
    """Pass through data:/base64 payloads; resolve stored upload filenames."""
    if value.startswith("data:"):
        return value.split(",", 1)[1]
    try:
        base64.b64decode(value, validate=True)
        if len(value) > 256:
            return value
    except Exception:
        pass
    try:
        return read_uploaded_b64(value)
    except FileNotFoundError:
        return value


class RunPodServerlessBackend:
    """Executes against a RunPod serverless endpoint (/run + /status).

    Workflows may pin a RunPod endpoint via their meta ("endpoint_id") — each
    endpoint gets a cached client, and jobs remember which endpoint they were
    queued on so /status polls hit the right one."""

    def __init__(self, client: RunPodClient | None = None):
        self.client = client or RunPodClient()
        self._clients: dict[str, RunPodClient] = {}
        self._job_endpoints: dict[str, str] = {}
        self._job_meta: dict[str, dict[str, Any]] = {}

    def _client_for(self, endpoint_id: str | None) -> RunPodClient:
        if not endpoint_id or endpoint_id == SETTINGS.runpod_endpoint_id:
            return self.client
        client = self._clients.get(endpoint_id)
        if client is None:
            client = self._clients[endpoint_id] = RunPodClient(endpoint_id=endpoint_id)
        return client

    async def queue(self, workflow: dict[str, Any], parameters: dict[str, Any],
                    job_input: dict[str, Any] | None = None, client_id: str | None = None,
                    job_meta: dict[str, Any] | None = None) -> str:
        payload = dict(job_input or {})
        endpoint_id = payload.pop("endpoint_id", "")
        graph_params = {k: v for k, v in parameters.items() if ":" in k}
        for key, value in parameters.items():
            if ":" not in key:
                payload[key] = value
        # Ship the full API-format graph inside the job — the handler runs its
        # standard patch pass (media upload, unet/lora needles, config presets)
        # on it, so the worker needs no baked workflow templates.
        patched = _apply_parameters(workflow, graph_params)
        bypass_ids = payload.pop("bypass_nodes", None)
        if bypass_ids:
            patched = _bypass_nodes(patched, bypass_ids)
        if patched:
            payload["prompt_graph"] = patched
        for media_key in ("images", "video"):
            if payload.get(media_key):
                if media_key == "images":
                    payload["images"] = [_as_b64(v) for v in payload["images"]]
                else:
                    payload["video"] = _as_b64(payload["video"])
        job_id = await self._client_for(endpoint_id).run(payload)
        self._job_endpoints[job_id] = endpoint_id
        if job_meta:
            self._job_meta[job_id] = job_meta
        return job_id

    async def status(self, job_id: str) -> ExecutionStatus:
        result = await self._client_for(self._job_endpoints.get(job_id)).status(job_id)
        state = result.get("status", "")
        if state in ("IN_QUEUE", "IN_PROGRESS"):
            elapsed = int(result.get("delayTime") or 0) + int(result.get("executionTime") or 0)
            return ExecutionStatus(
                prompt_id=job_id,
                status="running",
                remote_status=state,
                elapsed_ms=elapsed,
            )
        if state == "CANCELLED":
            return ExecutionStatus(prompt_id=job_id, status="cancelled")
        if state != "COMPLETED":
            return ExecutionStatus(
                prompt_id=job_id,
                status="error",
                error=result.get("error") or f"RunPod job {state.lower()}",
            )
        job_out = result.get("output") or {}
        texts = {k: str(v) for k, v in (job_out.get("texts") or {}).items()}
        job_meta = self._job_meta.pop(job_id, {}) or {}
        meta = {
            "app": "forgehub",
            "workflow": job_meta.get("workflow", ""),
            "created": result.get("completedTime") or "",
            "parameters": job_meta.get("parameters", {}),
            "texts": texts,
        }
        outputs: list[OutputFile] = []
        for item in job_out.get("outputs", []):
            filename = item.get("filename", "output.bin")
            try:
                saved = save_output_b64(filename, item.get("b64", ""))
            except Exception:
                continue
            try:
                write_output_meta(saved, meta)
            except Exception:
                pass
            outputs.append(OutputFile(
                filename=saved.name,
                subfolder="",
                type="output",
                url=f"/outputs/{urllib.parse.quote(saved.name)}",
            ))
        return ExecutionStatus(prompt_id=job_id, status="success", outputs=outputs, texts=texts)

    async def cancel(self, job_id: str) -> None:
        await self._client_for(self._job_endpoints.get(job_id)).cancel(job_id)


def get_backend():
    return RunPodServerlessBackend()
