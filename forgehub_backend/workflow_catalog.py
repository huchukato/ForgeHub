"""Workflow catalog: load and inspect ComfyUI API-format workflows."""

import json
import re
from pathlib import Path
from typing import Any

from forgehub_backend.config import SETTINGS
from forgehub_backend.models import WorkflowMeta


CATEGORY_HINTS = {
    "image": ["LoadImage", "SaveImage", "PreviewImage", "EmptyLatentImage", "VAEEncode", "VAEDecode"],
    "video": ["LoadVideo", "SaveVideo", "VideoCombine", "LTX", "Wan", "MMAudio", "CogVideo"],
    "audio": ["LoadAudio", "SaveAudio", "Audio", "MMAudio", "SeedanceAudio"],
    "agent": ["Qwen", "LLM", "Prompt", "Text"],
}


def _slugify(name: str) -> str:
    return re.sub(r"[^a-z0-9]+", "-", name.lower()).strip("-")


def _workflow_id(path: Path, base_dir: Path) -> str:
    try:
        rel = path.relative_to(base_dir)
    except ValueError:
        rel = Path(path.name)
    return _slugify(str(rel.with_suffix("")))


def _is_api_format(workflow: dict[str, Any]) -> bool:
    return any(
        isinstance(node, dict) and "class_type" in node
        for node in workflow.values()
    )


def _score_categories(classes: set[str]) -> str:
    scores = {}
    for category, hints in CATEGORY_HINTS.items():
        score = sum(1 for hint in hints if any(hint.lower() in cls for cls in classes))
        scores[category] = score
    if not scores or max(scores.values()) == 0:
        return "other"
    return max(scores, key=scores.get)


def _guess_category(workflow: dict[str, Any]) -> str:
    classes = {node.get("class_type", "").lower() for node in workflow.values() if isinstance(node, dict)}
    return _score_categories(classes)


def _ui_node_types(workflow: dict[str, Any]) -> set[str]:
    """Collect node type names from a UI-format (canvas) workflow graph."""
    nodes = workflow.get("nodes")
    if not isinstance(nodes, list):
        return set()
    return {
        str(node.get("type", "")).lower()
        for node in nodes
        if isinstance(node, dict)
    }


def _guess_category_ui(workflow: dict[str, Any]) -> str:
    return _score_categories(_ui_node_types(workflow))


def _outputs_from_types(classes: set[str]) -> list[str]:
    outputs = []
    for cls in classes:
        if cls in ("saveimage", "previewimage"):
            outputs.append("image")
        elif cls in ("savevideo", "videocombine"):
            outputs.append("video")
        elif "saveaudio" in cls or "audiosave" in cls:
            outputs.append("audio")
    return list(set(outputs)) or ["unknown"]


def _extract_parameters(workflow: dict[str, Any]) -> list[dict[str, Any]]:
    parameters = []
    for node_id, node in workflow.items():
        if not isinstance(node, dict):
            continue
        inputs = node.get("inputs", {})
        for key, value in inputs.items():
            if isinstance(value, (str, int, float, bool)) and not isinstance(value, list):
                parameters.append({
                    "node_id": node_id,
                    "widget": key,
                    "type": type(value).__name__,
                    "value": value,
                })
    return parameters[:50]


def _extract_outputs(workflow: dict[str, Any]) -> list[str]:
    outputs = []
    for node in workflow.values():
        if not isinstance(node, dict):
            continue
        class_type = node.get("class_type", "")
        if class_type in ("SaveImage", "PreviewImage"):
            outputs.append("image")
        elif class_type in ("SaveVideo", "VideoCombine"):
            outputs.append("video")
        elif "SaveAudio" in class_type or "AudioSave" in class_type:
            outputs.append("audio")
    return list(set(outputs)) or ["unknown"]


def load_workflow(path: Path) -> dict[str, Any]:
    with open(path, "r", encoding="utf-8") as f:
        data = json.load(f)
    if isinstance(data, dict):
        return data
    raise ValueError(f"Workflow file {path} does not contain a JSON object")


def load_meta(path: Path, workflow: dict[str, Any] | None = None, base_dir: Path | None = None) -> WorkflowMeta:
    meta_path = path.with_suffix(".meta.json")
    if meta_path.exists():
        with open(meta_path, "r", encoding="utf-8") as f:
            raw = json.load(f)
        meta = WorkflowMeta(**raw)
        if workflow is not None and not _is_api_format(workflow):
            meta.format = "ui"
        return meta

    wf_id = _workflow_id(path, base_dir) if base_dir else _slugify(path.stem)
    name = path.stem.replace("_", " ").replace("-", " ").title()
    is_api = _is_api_format(workflow) if workflow else True
    if workflow and is_api:
        category = _guess_category(workflow)
        parameters = _extract_parameters(workflow)
        outputs = _extract_outputs(workflow)
    elif workflow:
        # UI format: category/outputs inferred from nodes[].type, parameters
        # left empty (widgets are resolved at conversion time via object_info).
        ui_types = _ui_node_types(workflow)
        category = _score_categories(ui_types)
        parameters = []
        outputs = _outputs_from_types(ui_types)
    else:
        category = "other"
        parameters = []
        outputs = ["unknown"]
    return WorkflowMeta(
        id=wf_id,
        name=name,
        category=category,
        description="",
        parameters=parameters,
        outputs=outputs,
        format="api" if is_api else "ui",
    )


class WorkflowCatalog:
    def __init__(self, directory: Path | None = None):
        self.directory = directory or SETTINGS.workflow_dir

    def list_workflows(self) -> list[WorkflowMeta]:
        results = []
        if not self.directory.exists():
            return results
        for path in sorted(self.directory.rglob("*.json")):
            if path.name.endswith(".meta.json"):
                continue
            try:
                workflow = load_workflow(path)
                results.append(load_meta(path, workflow, self.directory))
            except Exception as exc:
                print(f"[ForgeHub] Failed to load workflow {path}: {exc}")
        return results

    def get_workflow(self, workflow_id: str) -> tuple[dict[str, Any], WorkflowMeta] | None:
        for path in self.directory.rglob("*.json"):
            if path.name.endswith(".meta.json"):
                continue
            try:
                workflow = load_workflow(path)
                meta = load_meta(path, workflow, self.directory)
                if meta.id == workflow_id or _slugify(path.stem) == workflow_id:
                    return workflow, meta
            except Exception:
                continue
        return None
