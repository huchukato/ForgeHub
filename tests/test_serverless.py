import base64

import pytest

from forgehub_backend.config import SETTINGS
from forgehub_backend.executor import RunPodServerlessBackend, _as_b64
from forgehub_backend.files import save_output_b64, read_output_file
from forgehub_backend.main import _split_parameters
from forgehub_backend.models import ExecuteRequest, WorkflowMeta


class FakeRunPodClient:
    def __init__(self):
        self.payloads = []

    async def run(self, payload):
        self.payloads.append(payload)
        return "job-123"

    async def status(self, job_id):
        return {"id": job_id, "status": "COMPLETED",
                "output": {"outputs": [{"filename": "out.mp4", "b64": base64.b64encode(b"fakevideo").decode()}]}}


def test_split_parameters_job_and_node():
    meta = WorkflowMeta(
        id="mmh3-fl2va", name="x",
        parameters=[
            {"key": "prompt", "target": "job"},
            {"key": "seed", "target": "node:37:seed"},
        ],
    )
    req = ExecuteRequest(
        workflow_id="mmh3-fl2va",
        parameters={"prompt": "hi", "seed": 42, "9:cfg": 3.0, "other": "x"},
    )
    job, node = _split_parameters(req, meta)
    assert job == {"prompt": "hi", "other": "x"}
    assert node == {"37:seed": 42, "9:cfg": 3.0}


@pytest.mark.asyncio
async def test_serverless_queue_builds_payload():
    backend = RunPodServerlessBackend(client=FakeRunPodClient())
    job_id = await backend.queue(
        workflow={"37": {"class_type": "KSampler", "inputs": {"seed": 0}}},
        parameters={"prompt": "a cat", "37:seed": 42},
        job_input={"workflow": "wf.json", "params": {"1:steps": 8}},
    )
    assert job_id == "job-123"
    payload = backend.client.payloads[0]
    assert payload["workflow"] == "wf.json"
    assert payload["prompt"] == "a cat"
    # Graph params are baked into prompt_graph; job-level params pass through.
    assert payload["prompt_graph"]["37"]["inputs"]["seed"] == 42
    assert payload["params"] == {"1:steps": 8}


@pytest.mark.asyncio
async def test_serverless_status_saves_outputs(tmp_path, monkeypatch):
    monkeypatch.setattr(SETTINGS, "storage_dir", tmp_path)
    monkeypatch.setattr(SETTINGS, "execution_mode", "serverless")
    backend = RunPodServerlessBackend(client=FakeRunPodClient())
    st = await backend.status("job-123")
    assert st.status == "success"
    assert st.outputs[0].filename == "out.mp4"
    assert read_output_file("out.mp4") == b"fakevideo"


def test_as_b64_passthrough_and_filename(tmp_path, monkeypatch):
    monkeypatch.setattr(SETTINGS, "storage_dir", tmp_path)
    raw = base64.b64encode(b"x" * 1000).decode()
    assert _as_b64(raw) == raw
    up = tmp_path / "uploads"
    up.mkdir(parents=True)
    (up / "img.jpg").write_bytes(b"jpegbytes")
    assert _as_b64("img.jpg") == base64.b64encode(b"jpegbytes").decode()
