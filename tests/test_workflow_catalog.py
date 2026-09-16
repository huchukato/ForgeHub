import json
from pathlib import Path

import pytest

from forgehub_backend.workflow_catalog import WorkflowCatalog, load_meta


def test_loads_meta_from_sidecar(tmp_path: Path):
    workflow = {"1": {"class_type": "KSampler", "inputs": {"steps": 20}}}
    workflow_path = tmp_path / "test_workflow.json"
    workflow_path.write_text(json.dumps(workflow))
    meta_path = tmp_path / "test_workflow.meta.json"
    meta_path.write_text(json.dumps({
        "id": "my-workflow",
        "name": "My Workflow",
        "category": "image",
        "description": "A test workflow",
    }))
    catalog = WorkflowCatalog(tmp_path)
    results = catalog.list_workflows()
    assert len(results) == 1
    assert results[0].id == "my-workflow"
    assert results[0].category == "image"


def test_guesses_category_and_extracts_parameters(tmp_path: Path):
    workflow = {
        "1": {"class_type": "LoadImage", "inputs": {"image": "foo.png"}},
        "2": {"class_type": "SaveImage", "inputs": {"filename_prefix": "output"}},
    }
    workflow_path = tmp_path / "image_gen.json"
    workflow_path.write_text(json.dumps(workflow))
    meta = load_meta(workflow_path, workflow)
    assert meta.category == "image"
    assert "image" in [p["widget"] for p in meta.parameters]


def test_get_workflow_by_id(tmp_path: Path):
    workflow = {"1": {"class_type": "KSampler", "inputs": {}}}
    (tmp_path / "pony.json").write_text(json.dumps(workflow))
    catalog = WorkflowCatalog(tmp_path)
    result = catalog.get_workflow("pony")
    assert result is not None
    assert "1" in result[0]


def test_missing_workflow_returns_none(tmp_path: Path):
    catalog = WorkflowCatalog(tmp_path)
    assert catalog.get_workflow("missing") is None


def test_scans_subdirectories_recursively(tmp_path: Path):
    workflow = {"1": {"class_type": "KSampler", "inputs": {}}}
    subdir = tmp_path / "minimax"
    subdir.mkdir()
    (subdir / "MiniMaxH3-Turbo-I2VA-Qwen3.5.json").write_text(json.dumps(workflow))
    catalog = WorkflowCatalog(tmp_path)
    results = catalog.list_workflows()
    assert len(results) == 1
    assert results[0].id == "minimax-minimaxh3-turbo-i2va-qwen3-5"
    assert catalog.get_workflow("minimax-minimaxh3-turbo-i2va-qwen3-5") is not None


def test_no_id_collisions_across_subdirs(tmp_path: Path):
    workflow = {"1": {"class_type": "KSampler", "inputs": {}}}
    for sub in ("a", "b"):
        d = tmp_path / sub
        d.mkdir()
        (d / "wf.json").write_text(json.dumps(workflow))
    catalog = WorkflowCatalog(tmp_path)
    ids = [m.id for m in catalog.list_workflows()]
    assert sorted(ids) == ["a-wf", "b-wf"]


def test_skips_meta_sidecar_files(tmp_path: Path):
    (tmp_path / "wf.meta.json").write_text(json.dumps({"id": "x", "name": "X"}))
    catalog = WorkflowCatalog(tmp_path)
    assert catalog.list_workflows() == []


def test_ui_format_workflow_detected(tmp_path: Path):
    ui_workflow = {"nodes": [{"id": 1, "type": "KSampler"}], "links": []}
    (tmp_path / "ui_wf.json").write_text(json.dumps(ui_workflow))
    catalog = WorkflowCatalog(tmp_path)
    results = catalog.list_workflows()
    assert len(results) == 1
    meta = results[0]
    assert meta.format == "ui"
    assert meta.category == "other"
    assert meta.parameters == []


def test_api_format_is_default(tmp_path: Path):
    workflow = {"1": {"class_type": "KSampler", "inputs": {}}}
    (tmp_path / "api_wf.json").write_text(json.dumps(workflow))
    meta = load_meta(tmp_path / "api_wf.json", workflow, tmp_path)
    assert meta.format == "api"
