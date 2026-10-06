"""Workflow execution with parameter patching and output retrieval."""

import asyncio
import base64
import copy
import urllib.parse
from typing import Any

from forgehub_backend.comfy_client import ComfyClient, COMFY_CLIENT
from forgehub_backend.config import SETTINGS
from forgehub_backend.files import read_uploaded_b64, save_output_b64
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


async def wait_for_outputs(
    client: ComfyClient,
    prompt_id: str,
    client_id: str,
    timeout: float = 600.0,
) -> ExecutionStatus:
    outputs: list[OutputFile] = []
    completed = False
    error_message: str | None = None

    async def handle_event(data: dict[str, Any]):
        nonlocal completed, error_message
        msg_type = data.get("type")
        if msg_type == "executed":
            output_data = data.get("data", {})
            if output_data.get("prompt_id") == prompt_id:
                node_outputs = output_data.get("output", {})
                for key in ("images", "gifs", "videos", "audio"):
                    for item in node_outputs.get(key, []):
                        if isinstance(item, dict) and "filename" in item:
                            outputs.append(OutputFile(
                                filename=item["filename"],
                                subfolder=item.get("subfolder", ""),
                                type=item.get("type", "output"),
                                url=client.view_url(item["filename"], item.get("subfolder", ""), item.get("type", "output")),
                            ))
        elif msg_type == "execution_error":
            error_data = data.get("data", {})
            if error_data.get("prompt_id") == prompt_id:
                error_message = error_data.get("exception_message", "Execution failed")
                completed = True
        elif msg_type == "execution_success":
            if data.get("data", {}).get("prompt_id") == prompt_id:
                completed = True

    event_task = asyncio.create_task(client.stream_events(client_id, handle_event))
    poll_deadline = asyncio.get_event_loop().time() + timeout

    try:
        while not completed and asyncio.get_event_loop().time() < poll_deadline:
            await asyncio.sleep(2.0)
            try:
                history = await client.get_history(prompt_id)
                entry = history.get(prompt_id)
                if isinstance(entry, dict):
                    status = entry.get("status", {})
                    if status.get("status_str") in ("success", "error"):
                        if status.get("status_str") == "error":
                            error_message = status.get("messages", [["", {}]])[0][1].get("exception_message", "Execution failed")
                        completed = True
                        outputs_node = entry.get("outputs", {})
                        for node_id, node_output in outputs_node.items():
                            for key in ("images", "gifs", "videos", "audio"):
                                for item in node_output.get(key, []):
                                    if isinstance(item, dict) and "filename" in item:
                                        outputs.append(OutputFile(
                                            filename=item["filename"],
                                            subfolder=item.get("subfolder", ""),
                                            type=item.get("type", "output"),
                                            url=client.view_url(item["filename"], item.get("subfolder", ""), item.get("type", "output")),
                                        ))
            except Exception as exc:
                print(f"[ForgeHub] History poll error: {exc}")
    finally:
        event_task.cancel()
        try:
            await event_task
        except asyncio.CancelledError:
            pass

    if not completed and error_message is None:
        error_message = "Timeout waiting for execution"

    return ExecutionStatus(
        prompt_id=prompt_id,
        status="error" if error_message else "success",
        outputs=outputs,
        error=error_message,
    )


async def execute_workflow(
    workflow: dict[str, Any],
    parameters: dict[str, Any],
    client: ComfyClient | None = None,
    client_id: str | None = None,
) -> ExecutionStatus:
    client = client or COMFY_CLIENT
    patched = _apply_parameters(workflow, parameters)
    prompt_id, used_client_id = await client.queue_prompt(patched, client_id)
    return await wait_for_outputs(client, prompt_id, used_client_id)


# ── Execution backends ───────────────────────────────────────────────────────


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


class DirectComfyBackend:
    """Executes against a running ComfyUI (pod or local)."""

    def __init__(self, client: ComfyClient | None = None):
        self.client = client or COMFY_CLIENT

    async def queue(self, workflow: dict[str, Any], parameters: dict[str, Any],
                    job_input: dict[str, Any] | None = None, client_id: str | None = None) -> str:
        patched = _apply_parameters(workflow, parameters)
        prompt_id, _ = await self.client.queue_prompt(patched, client_id)
        return prompt_id

    async def status(self, job_id: str) -> ExecutionStatus:
        history = await self.client.get_history(job_id)
        entry = history.get(job_id)
        if not isinstance(entry, dict):
            return ExecutionStatus(prompt_id=job_id, status="running")
        status = entry.get("status", {})
        status_str = status.get("status_str", "running")
        outputs: list[OutputFile] = []
        error = None
        if status_str == "error":
            error = status.get("messages", [["", {}]])[0][1].get("exception_message", "Execution failed")
        for node_output in (entry.get("outputs") or {}).values():
            for key in ("images", "gifs", "videos", "audio"):
                for item in node_output.get(key, []):
                    if isinstance(item, dict) and "filename" in item:
                        outputs.append(OutputFile(
                            filename=item["filename"],
                            subfolder=item.get("subfolder", ""),
                            type=item.get("type", "output"),
                            url=self.client.view_url(item["filename"], item.get("subfolder", ""), item.get("type", "output")),
                        ))
        return ExecutionStatus(
            prompt_id=job_id,
            status="success" if status_str == "success" else ("error" if error else "running"),
            outputs=outputs,
            error=error,
        )

    async def cancel(self, job_id: str) -> None:
        """Dequeue the prompt if pending and interrupt any running prompt."""
        await self.client.delete_from_queue(job_id)
        await self.client.interrupt()


class RunPodServerlessBackend:
    """Executes against a RunPod serverless endpoint (/run + /status).

    Workflows may pin a RunPod endpoint via their meta ("endpoint_id") — each
    endpoint gets a cached client, and jobs remember which endpoint they were
    queued on so /status polls hit the right one."""

    def __init__(self, client: RunPodClient | None = None):
        self.client = client or RunPodClient()
        self._clients: dict[str, RunPodClient] = {}
        self._job_endpoints: dict[str, str] = {}

    def _client_for(self, endpoint_id: str | None) -> RunPodClient:
        if not endpoint_id or endpoint_id == SETTINGS.runpod_endpoint_id:
            return self.client
        client = self._clients.get(endpoint_id)
        if client is None:
            client = self._clients[endpoint_id] = RunPodClient(endpoint_id=endpoint_id)
        return client

    async def queue(self, workflow: dict[str, Any], parameters: dict[str, Any],
                    job_input: dict[str, Any] | None = None, client_id: str | None = None) -> str:
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
        outputs: list[OutputFile] = []
        for item in job_out.get("outputs", []):
            filename = item.get("filename", "output.bin")
            try:
                saved = save_output_b64(filename, item.get("b64", ""))
            except Exception:
                continue
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
    if SETTINGS.execution_mode == "serverless":
        return RunPodServerlessBackend()
    return DirectComfyBackend()
