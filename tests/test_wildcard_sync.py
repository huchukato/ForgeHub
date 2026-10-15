import pathlib

from forgehub_backend.wildcard_sync import sync_garage_wildcards


def _fake_urlopen(content: bytes = b"new content"):
    def fake(url, timeout=10):
        class _Resp:
            def read(self):
                return content
        return _Resp()
    return fake


def test_sync_adds_updates_deletes(tmp_path, monkeypatch):
    target = tmp_path / "wildcards"
    (target / "pmp").mkdir(parents=True)
    (target / "pmp" / "old.yaml").write_text("stale")
    (target / "pmp" / "act.yaml").write_text("old")
    monkeypatch.setattr("urllib.request.urlopen", _fake_urlopen())

    assert sync_garage_wildcards(target, ["pmp/act.yaml", "pmp/new.yaml"]) is True
    assert not (target / "pmp" / "old.yaml").exists()
    assert (target / "pmp" / "act.yaml").read_bytes() == b"new content"
    assert (target / "pmp" / "new.yaml").read_bytes() == b"new content"
    assert (target / ".garage-manifest").read_text() == "pmp/act.yaml\npmp/new.yaml"


def test_sync_skips_unchanged_files(tmp_path, monkeypatch):
    target = tmp_path / "wildcards"
    (target / "pmp").mkdir(parents=True)
    (target / "pmp" / "act.yaml").write_bytes(b"new content")
    calls = []
    monkeypatch.setattr("urllib.request.urlopen", _fake_urlopen())

    assert sync_garage_wildcards(target, ["pmp/act.yaml"]) is False
    assert (target / "pmp" / "act.yaml").read_bytes() == b"new content"


def test_sync_preserves_unmanaged_dirs(tmp_path, monkeypatch):
    target = tmp_path / "wildcards"
    (target / "custom").mkdir(parents=True)
    (target / "custom" / "mine.yaml").write_text("mine")
    monkeypatch.setattr("urllib.request.urlopen", _fake_urlopen())

    sync_garage_wildcards(target, ["pmp/act.yaml"])
    assert (target / "custom" / "mine.yaml").exists()


def test_sync_cleans_empty_dirs(tmp_path, monkeypatch):
    target = tmp_path / "wildcards"
    (target / "vid").mkdir(parents=True)
    (target / "vid" / "gone.yaml").write_text("stale")
    (target / ".garage-manifest").write_text("vid/gone.yaml\n")
    monkeypatch.setattr("urllib.request.urlopen", _fake_urlopen())

    sync_garage_wildcards(target, ["pmp/act.yaml"])
    assert not (target / "vid" / "gone.yaml").exists()
    assert not (target / "vid").exists()
