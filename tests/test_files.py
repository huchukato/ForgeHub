import base64
from pathlib import Path

import pytest

from forgehub_backend.config import SETTINGS
from forgehub_backend.files import read_output_file


def test_read_output_file_reads_output(tmp_path: Path, monkeypatch):
    monkeypatch.setattr(SETTINGS, "storage_dir", tmp_path)
    (tmp_path / "outputs").mkdir()
    (tmp_path / "outputs" / "out.png").write_bytes(b"pngdata")
    assert read_output_file("out.png") == b"pngdata"


def test_read_output_file_reads_input_type(tmp_path: Path, monkeypatch):
    monkeypatch.setattr(SETTINGS, "storage_dir", tmp_path)
    (tmp_path / "uploads").mkdir()
    (tmp_path / "uploads" / "in.png").write_bytes(b"indata")
    assert read_output_file("in.png", "", "input") == b"indata"


def test_read_output_file_rejects_traversal(tmp_path: Path, monkeypatch):
    base = tmp_path / "outputs"
    base.mkdir()
    monkeypatch.setattr(SETTINGS, "storage_dir", tmp_path)
    secret = tmp_path / "secret.txt"
    secret.write_bytes(b"secret")
    with pytest.raises(FileNotFoundError):
        read_output_file("../secret.txt")
    with pytest.raises(FileNotFoundError):
        read_output_file("secret.txt", "..")


def test_resolve_chat_images_converts_filename(tmp_path: Path, monkeypatch):
    from fastapi import HTTPException

    from forgehub_backend.main import _resolve_chat_images

    monkeypatch.setattr(SETTINGS, "storage_dir", tmp_path)
    (tmp_path / "uploads").mkdir()
    (tmp_path / "uploads" / "forgehub_test.jpg").write_bytes(b"jpegdata")

    out = _resolve_chat_images(["forgehub_test.jpg"])
    assert out == [base64.b64encode(b"jpegdata").decode("ascii")]

    # data: URIs pass through untouched
    uri = "data:image/png;base64,aGVsbG8="
    assert _resolve_chat_images([uri]) == [uri]

    with pytest.raises(HTTPException) as exc:
        _resolve_chat_images(["missing_file.png"])
    assert exc.value.status_code == 400


def test_list_outputs_endpoint(tmp_path: Path, monkeypatch):
    from fastapi.testclient import TestClient

    from forgehub_backend.main import app

    outputs = tmp_path / "outputs"
    outputs.mkdir()
    (outputs / "a.mp4").write_bytes(b"vid")
    (outputs / "b.png").write_bytes(b"img")
    monkeypatch.setattr(SETTINGS, "storage_dir", tmp_path)

    with TestClient(app) as client:
        resp = client.get("/outputs")
    assert resp.status_code == 200
    names = {o["filename"] for o in resp.json()["outputs"]}
    assert names == {"a.mp4", "b.png"}


def test_list_outputs_empty_dir(tmp_path: Path, monkeypatch):
    from fastapi.testclient import TestClient

    from forgehub_backend.main import app

    monkeypatch.setattr(SETTINGS, "storage_dir", tmp_path)
    with TestClient(app) as client:
        resp = client.get("/outputs")
    assert resp.status_code == 200
    assert resp.json()["outputs"] == []
