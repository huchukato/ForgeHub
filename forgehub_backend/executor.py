"""Workflow execution with parameter patching and output retrieval."""

import asyncio
import copy
from typing import Any

from forgehub_backend.comfy_client import ComfyClient, COMFY_CLIENT
from forgehub_backend.models import ExecutionStatus, OutputFile


def _apply_parameters(workflow: dict[str, Any], parameters: dict[str, Any]) -> dict[str, Any]:
    workflow = copy.deepcopy(workflow)
    for key, value in parameters.items():
        if ":" in key:
            node_id, widget = key.split(":", 1)
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
