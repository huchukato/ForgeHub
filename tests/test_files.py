import base64
from pathlib import Path

import pytest

from forgehub_backend.config import SETTINGS
from forgehub_backend.files import read_output_file


def test_read_output_file_reads_output(tmp_path: Path, monkeypatch):
    monkeypatch.setattr(SETTINGS, "comfy_output_dir", tmp_path)
    (tmp_path / "out.png").write_bytes(b"pngdata")
    assert read_output_file("out.png") == b"pngdata"


def test_read_output_file_reads_input_type(tmp_path: Path, monkeypatch):
    monkeypatch.setattr(SETTINGS, "comfy_input_dir", tmp_path)
    (tmp_path / "in.png").write_bytes(b"indata")
    assert read_output_file("in.png", "", "input") == b"indata"


def test_read_output_file_rejects_traversal(tmp_path: Path, monkeypatch):
    base = tmp_path / "output"
    base.mkdir()
    monkeypatch.setattr(SETTINGS, "comfy_output_dir", base)
    secret = tmp_path / "secret.txt"
    secret.write_bytes(b"secret")
    with pytest.raises(FileNotFoundError):
        read_output_file("../secret.txt")
    with pytest.raises(FileNotFoundError):
        read_output_file("secret.txt", "..")


def test_resolve_chat_images_converts_filename(tmp_path: Path, monkeypatch):
    from fastapi import HTTPException

    from forgehub_backend.main import _resolve_chat_images

    monkeypatch.setattr(SETTINGS, "comfy_input_dir", tmp_path)
    (tmp_path / "forgehub_test.jpg").write_bytes(b"jpegdata")

    out = _resolve_chat_images(["forgehub_test.jpg"])
    assert out == [base64.b64encode(b"jpegdata").decode("ascii")]

    # data: URIs pass through untouched
    uri = "data:image/png;base64,aGVsbG8="
    assert _resolve_chat_images([uri]) == [uri]

    with pytest.raises(HTTPException) as exc:
        _resolve_chat_images(["missing_file.png"])
    assert exc.value.status_code == 400
