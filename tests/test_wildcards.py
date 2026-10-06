from pathlib import Path

import pytest

from forgehub_backend.config import SETTINGS
from forgehub_backend.wildcards import WildcardLoader


@pytest.fixture(autouse=True)
def wildcard_dir(tmp_path: Path, monkeypatch):
    (tmp_path / "poses.txt").write_text("standing\nsitting\n# comment\nlying\n")
    (tmp_path / "nested.yaml").write_text(
        "pmp:\n  act:\n    miss: ['missionary', 'on back']\n    dgy: ['doggystyle']\n"
    )
    monkeypatch.setattr(SETTINGS, "wildcard_dirs", str(tmp_path))
    WildcardLoader.unload()
    yield
    WildcardLoader.unload()


def test_expands_txt_wildcard():
    result = WildcardLoader.process("__poses__", seed=1)
    assert result in {"standing", "sitting", "lying"}


def test_expands_nested_yaml():
    assert WildcardLoader.process("__pmp/act/miss__", seed=1) in {"missionary", "on back"}
    assert WildcardLoader.process("__pmp/act/dgy__", seed=1) == "doggystyle"


def test_glob_matches_children():
    result = WildcardLoader.process("__pmp/act*__", seed=1)
    assert result in {"missionary", "on back", "doggystyle"}


def test_option_groups_and_weights():
    assert WildcardLoader.process("{a|b}", seed=1) in {"a", "b"}
    assert WildcardLoader.process("{5::a|0::b}", seed=1) == "a"


def test_seed_reproducible_and_unknown_left_literal():
    assert WildcardLoader.process("__poses__", seed=7) == WildcardLoader.process("__poses__", seed=7)
    assert WildcardLoader.process("__does/not/exist__", seed=1) == "__does/not/exist__"


def test_expand_endpoint_applies_to_params():
    from forgehub_backend.main import _expand_wildcards
    out = _expand_wildcards({"prompt": "__poses__", "seconds": 5})
    assert out["prompt"] in {"standing", "sitting", "lying"}
    assert out["seconds"] == 5
